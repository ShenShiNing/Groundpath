from __future__ import annotations

import argparse
import atexit
import importlib.util
import json
import locale
import os
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SAMPLES_DIR = ROOT / ".cache" / "structured-rag" / "pdf-samples"
DEFAULT_OUTPUT_DIR = ROOT / ".cache" / "structured-rag" / "pdf-runtime-compare"
DEFAULT_MANIFEST = DEFAULT_SAMPLES_DIR / "manifest.json"
NODE_HELPER = ROOT / "packages" / "server" / "src" / "scripts" / "pdf-parse-extract.mjs"
NODE_CWD = ROOT / "packages" / "server"
DOCLING_HELPER = ROOT / "scripts" / "docling-export-single.py"
LOCAL_PYTHON312_ROOT = ROOT / ".cache" / "python312" / "python-3.12.10-amd64"
LOCAL_PYTHON312_EXE = LOCAL_PYTHON312_ROOT / "python.exe"
LOCAL_PYTHON312_SCRIPTS = LOCAL_PYTHON312_ROOT / "Scripts"
RUNTIME_ORDER = ("pdf-parse", "marker", "docling")
QUICK_SAMPLE_IDS = (
    "book-nist-ai-600-1",
    "paper-attention-2017",
    "synthetic-chart-dense-report",
)
QUICK_MAX_PAGES = 16
TEXT_EXT_PRIORITY = (".md", ".markdown", ".txt", ".text", ".json")
DEFAULT_HEARTBEAT_SECONDS = 5
HEADING_PATTERNS = (
    re.compile(r"^\s*#{1,6}\s+\S+", re.IGNORECASE),
    re.compile(r"^\s*(chapter|section|appendix|part)\s+[a-z0-9.-]+\b", re.IGNORECASE),
    re.compile(r"^\s*\d+(?:\.\d+){0,4}\s+[A-Za-z].{0,120}$"),
)
FIGURE_RE = re.compile(r"\bfigure\s+[a-z]?\d+(?:[-.]\d+)?\b", re.IGNORECASE)
TABLE_RE = re.compile(r"\btable\s+[a-z]?\d+(?:[-.]\d+)?\b", re.IGNORECASE)
APPENDIX_RE = re.compile(r"\bappendix\s+[a-z0-9]+\b", re.IGNORECASE)


@dataclass
class SampleInfo:
    id: str
    category: str
    title: str
    file_name: str
    path: str
    size_bytes: int
    source: str


@dataclass
class RuntimeResult:
    sample_id: str
    file_name: str
    runtime: str
    status: str
    duration_ms: int
    page_count: int | None
    text_length: int
    word_count: int
    line_count: int
    heading_hint_count: int
    figure_anchor_count: int
    table_anchor_count: int
    appendix_anchor_count: int
    output_path: str | None
    error: str | None
    command: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare pdf-parse / marker / docling on the structured RAG PDF sample set."
    )
    parser.add_argument("--samples-dir", default=str(DEFAULT_SAMPLES_DIR))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument(
        "--sample-set",
        choices=("quick", "full"),
        default="quick",
        help="quick runs the minimal 3-sample set; full runs all available samples.",
    )
    parser.add_argument(
        "--sample-ids",
        help="Comma-separated sample IDs to run. Overrides --sample-set when provided.",
    )
    parser.add_argument(
        "--runtimes",
        default=",".join(RUNTIME_ORDER),
        help="Comma-separated runtimes, e.g. pdf-parse,marker,docling",
    )
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--marker-timeout-seconds", type=int, default=600)
    parser.add_argument("--docling-timeout-seconds", type=int, default=600)
    parser.add_argument("--marker-command")
    parser.add_argument("--docling-command")
    parser.add_argument(
        "--python312",
        default=str(LOCAL_PYTHON312_EXE),
        help="Path to the local Python 3.12 interpreter used for marker/docling.",
    )
    parser.add_argument(
        "--fail-on-runtime-error",
        action="store_true",
        help="Exit non-zero when a configured runtime returns error/timeout. Unavailable runtimes do not fail.",
    )
    parser.add_argument(
        "--heartbeat-seconds",
        type=int,
        default=DEFAULT_HEARTBEAT_SECONDS,
        help="Print a progress heartbeat for long-running subprocesses.",
    )
    parser.add_argument(
        "--allow-model-download",
        action="store_true",
        help="Allow marker/docling to fetch missing model artifacts from the network.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run runtimes even when a cached per-sample result.json already exists.",
    )
    parser.add_argument(
        "--ignore-lock",
        action="store_true",
        help="Ignore an existing compare lock file. Use only if you are sure no older run is still active.",
    )
    return parser.parse_args()


def load_samples(samples_dir: Path, manifest_path: Path) -> list[SampleInfo]:
    if manifest_path.exists():
        items = json.loads(manifest_path.read_text(encoding="utf-8"))
        samples: list[SampleInfo] = []
        for item in items:
            file_name = item["fileName"]
            file_path = samples_dir / file_name
            if not file_path.exists():
                continue
            samples.append(
                SampleInfo(
                    id=item["id"],
                    category=item["category"],
                    title=item["title"],
                    file_name=file_name,
                    path=str(file_path),
                    size_bytes=file_path.stat().st_size,
                    source=item["url"],
                )
            )
        if samples:
            return samples

    samples = []
    for pdf_file in sorted(samples_dir.glob("*.pdf")):
        samples.append(
            SampleInfo(
                id=pdf_file.stem,
                category="unknown",
                title=pdf_file.stem,
                file_name=pdf_file.name,
                path=str(pdf_file),
                size_bytes=pdf_file.stat().st_size,
                source="local://unknown",
            )
        )
    return samples


def select_samples(samples: list[SampleInfo], args: argparse.Namespace) -> list[SampleInfo]:
    if args.sample_ids:
        requested = {item.strip() for item in args.sample_ids.split(",") if item.strip()}
        selected = [sample for sample in samples if sample.id in requested]
        return selected

    if args.sample_set == "full":
        return samples

    selected = [sample for sample in samples if sample.id in QUICK_SAMPLE_IDS]
    return selected or samples


def get_max_pages(sample: SampleInfo, args: argparse.Namespace) -> int:
    if args.sample_set == "quick":
        return QUICK_MAX_PAGES
    return sys.maxsize


def count_heading_hints(text: str) -> int:
    count = 0
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or len(line) > 140:
            continue
        if any(pattern.match(line) for pattern in HEADING_PATTERNS):
            count += 1
    return count


def compute_metrics(text: str) -> dict[str, int]:
    normalized = text.replace("\r\n", "\n")
    words = re.findall(r"\S+", normalized)
    return {
        "text_length": len(normalized),
        "word_count": len(words),
        "line_count": len(normalized.splitlines()),
        "heading_hint_count": count_heading_hints(normalized),
        "figure_anchor_count": len(FIGURE_RE.findall(normalized)),
        "table_anchor_count": len(TABLE_RE.findall(normalized)),
        "appendix_anchor_count": len(APPENDIX_RE.findall(normalized)),
    }


def get_timeout_for_runtime(runtime: str, args: argparse.Namespace) -> int:
    if runtime == "marker":
        return args.marker_timeout_seconds
    if runtime == "docling":
        return args.docling_timeout_seconds
    return args.timeout_seconds


def render_markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header_row = "| " + " | ".join(headers) + " |"
    separator = "| " + " | ".join("---" for _ in headers) + " |"
    body = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([header_row, separator, *body])


def format_ms(value: float | None) -> str:
    if value is None:
        return "-"
    return str(int(round(value)))


def stringify_command(command: list[str] | None) -> str | None:
    if not command:
        return None
    return " ".join(shlex.quote(part) for part in command)


def build_local_python_env(python312: Path) -> dict[str, str]:
    env = dict(os.environ)
    scripts_dir = python312.parent / "Scripts"
    path_parts = [str(scripts_dir)]
    current_path = env.get("PATH")
    if current_path:
        path_parts.append(current_path)
    env["PATH"] = os.pathsep.join(path_parts)

    model_cache = ROOT / ".cache" / "structured-rag" / "model-cache"
    temp_dir = ROOT / ".cache" / "structured-rag" / "tmp"
    (model_cache / "hf" / "hub").mkdir(parents=True, exist_ok=True)
    (model_cache / "torch").mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    env.setdefault("HF_HOME", str(model_cache / "hf"))
    env.setdefault("HUGGINGFACE_HUB_CACHE", str(model_cache / "hf" / "hub"))
    env.setdefault("TORCH_HOME", str(model_cache / "torch"))
    env.setdefault("TRANSFORMERS_CACHE", str(model_cache / "transformers"))
    env.setdefault("MODEL_CACHE_DIR", str(Path(os.environ.get("LOCALAPPDATA", str(ROOT))) / "datalab" / "datalab" / "Cache" / "models"))
    env.setdefault("TMP", str(temp_dir))
    env.setdefault("TEMP", str(temp_dir))
    return env


def acquire_run_lock(out_dir: Path, ignore_lock: bool) -> tuple[int, Path] | None:
    out_dir.mkdir(parents=True, exist_ok=True)
    lock_path = out_dir / ".compare.lock"
    if ignore_lock:
        try:
            lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        existing = ""
        try:
            existing = lock_path.read_text(encoding="utf-8")
        except Exception:
            pass
        raise SystemExit(
            "Another PDF runtime comparison appears to still be running. "
            f"Lock file: {lock_path}. "
            f"Details: {existing or 'unreadable'}. "
            "If you are sure the old run is gone, rerun with --ignore-lock."
        )

    payload = {
        "pid": os.getpid(),
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    os.write(fd, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    os.close(fd)

    def cleanup() -> None:
        try:
            lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    atexit.register(cleanup)
    return fd, lock_path


def decode_output(value: bytes | None) -> str:
    if not value:
        return ""

    preferred_encoding = locale.getpreferredencoding(False) or "utf-8"
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError:
        return value.decode(preferred_encoding, errors="replace")


def run_subprocess(
    command: list[str],
    cwd: Path,
    timeout_seconds: int,
    env: dict[str, str] | None = None,
    heartbeat_label: str | None = None,
    heartbeat_seconds: int = DEFAULT_HEARTBEAT_SECONDS,
) -> subprocess.CompletedProcess[bytes]:
    if not heartbeat_label or heartbeat_seconds <= 0:
        return subprocess.run(
            command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
            check=False,
            env=env,
        )

    process = subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    start = time.time()
    last_heartbeat = start

    while True:
        return_code = process.poll()
        if return_code is not None:
            break

        now = time.time()
        elapsed = int(now - start)
        if heartbeat_label and heartbeat_seconds > 0 and now - last_heartbeat >= heartbeat_seconds:
            print(f"    {heartbeat_label} still running... {elapsed}s", flush=True)
            last_heartbeat = now

        if now - start > timeout_seconds:
            process.kill()
            stdout, stderr = process.communicate()
            raise subprocess.TimeoutExpired(command, timeout_seconds, output=stdout, stderr=stderr)

        time.sleep(1)

    stdout, stderr = process.communicate()
    return subprocess.CompletedProcess(command, return_code, stdout, stderr)


def run_pdf_parse(sample: SampleInfo, runtime_dir: Path, timeout_seconds: int) -> RuntimeResult:
    return run_pdf_parse_with_max_pages(sample, runtime_dir, timeout_seconds, sys.maxsize)


def run_pdf_parse_with_max_pages(
    sample: SampleInfo,
    runtime_dir: Path,
    timeout_seconds: int,
    max_pages: int,
) -> RuntimeResult:
    output_path = runtime_dir / "extracted.txt"
    started_at = time.perf_counter()
    command = ["node", str(NODE_HELPER), sample.path]
    if max_pages < sys.maxsize:
        command.extend(["--max-pages", str(max_pages)])

    try:
        completed = run_subprocess(command, NODE_CWD, timeout_seconds)
    except subprocess.TimeoutExpired:
        return RuntimeResult(
            sample_id=sample.id,
            file_name=sample.file_name,
            runtime="pdf-parse",
            status="timeout",
            duration_ms=int((time.perf_counter() - started_at) * 1000),
            page_count=None,
            text_length=0,
            word_count=0,
            line_count=0,
            heading_hint_count=0,
            figure_anchor_count=0,
            table_anchor_count=0,
            appendix_anchor_count=0,
            output_path=None,
            error=f"Timed out after {timeout_seconds}s",
            command=stringify_command(command),
        )

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    if completed.returncode != 0:
        error = decode_output(completed.stderr).strip() or decode_output(completed.stdout).strip() or f"Exit code {completed.returncode}"
        return RuntimeResult(
            sample_id=sample.id,
            file_name=sample.file_name,
            runtime="pdf-parse",
            status="error",
            duration_ms=duration_ms,
            page_count=None,
            text_length=0,
            word_count=0,
            line_count=0,
            heading_hint_count=0,
            figure_anchor_count=0,
            table_anchor_count=0,
            appendix_anchor_count=0,
            output_path=None,
            error=error[:500],
            command=stringify_command(command),
        )

    payload = json.loads(decode_output(completed.stdout))
    text = payload.get("text", "")
    output_path.write_text(text, encoding="utf-8")
    metrics = compute_metrics(text)
    return RuntimeResult(
        sample_id=sample.id,
        file_name=sample.file_name,
        runtime="pdf-parse",
        status="success",
        duration_ms=duration_ms,
        page_count=payload.get("pageCount"),
        output_path=str(output_path),
        error=None,
        command=stringify_command(command),
        **metrics,
    )


def has_files(directory: Path) -> bool:
    return directory.exists() and any(path.is_file() for path in directory.rglob("*"))


def marker_model_state(env: dict[str, str]) -> tuple[bool, str | None]:
    base = Path(env["MODEL_CACHE_DIR"])
    required = {
        "layout": base / "layout" / "2025_09_23",
        "text_recognition": base / "text_recognition" / "2025_09_23",
        "table_recognition": base / "table_recognition" / "2025_02_18",
        "text_detection": base / "text_detection" / "2025_05_07",
        "ocr_error_detection": base / "ocr_error_detection" / "2025_02_18",
    }
    missing = [name for name, path in required.items() if not has_files(path)]
    if missing:
        return False, (
            "marker local model artifacts missing: "
            + ", ".join(missing)
            + ". Rerun with --allow-model-download after enabling access to models.datalab.to."
        )
    return True, None


def docling_model_state(env: dict[str, str]) -> tuple[bool, str | None]:
    hub = Path(env["HUGGINGFACE_HUB_CACHE"])
    required = {
        "docling-models": hub / "models--docling-project--docling-models" / "snapshots",
        "docling-layout-heron": hub / "models--docling-project--docling-layout-heron" / "snapshots",
    }
    missing = [name for name, path in required.items() if not has_files(path)]
    if missing:
        return False, (
            "docling local model artifacts missing: "
            + ", ".join(missing)
            + ". Rerun with --allow-model-download after enabling access to huggingface.co."
        )
    return True, None


def runtime_is_available(
    runtime: str,
    python312: Path,
    env: dict[str, str],
    allow_model_download: bool,
) -> tuple[bool, str | None]:
    if runtime == "marker":
        if python312.exists():
            completed = run_subprocess(
                [str(python312), "-c", "import marker; print(marker.__file__)"],
                ROOT,
                60,
                env=env,
            )
            if completed.returncode == 0:
                if allow_model_download:
                    return True, None
                return marker_model_state(env)
        available = bool(shutil.which("marker_single") or importlib.util.find_spec("marker_single"))
        return available, None if available else "marker is not installed in the current environment."
    if runtime == "docling":
        if python312.exists():
            completed = run_subprocess(
                [str(python312), "-c", "import docling; print(docling.__file__)"],
                ROOT,
                60,
                env=env,
            )
            if completed.returncode == 0:
                if allow_model_download:
                    return True, None
                return docling_model_state(env)
        available = bool(shutil.which("docling") or importlib.util.find_spec("docling"))
        return available, None if available else "docling is not installed in the current environment."
    return True, None


def resolve_runtime_commands(
    runtime: str,
    sample_path: Path,
    runtime_dir: Path,
    override: str | None,
    python312: Path,
    max_pages: int,
) -> list[list[str]]:
    input_str = str(sample_path)
    out_str = str(runtime_dir)

    if override:
        return [shlex.split(override.format(input=input_str, output_dir=out_str))]

    if runtime == "marker":
        candidates: list[list[str]] = []
        if python312.exists():
            candidates.append(
                [
                    str(python312),
                    "-c",
                    "from marker.scripts.convert_single import convert_single_cli; convert_single_cli()",
                    input_str,
                    "--output_dir",
                    out_str,
                    "--output_format",
                    "markdown",
                    "--disable_multiprocessing",
                    "--disable_ocr",
                    "--page_range",
                    f"0-{max_pages - 1}",
                ]
            )
        marker_single = shutil.which("marker_single")
        if marker_single:
            candidates.append(
                [marker_single, input_str, "--output_dir", out_str, "--output_format", "markdown"]
            )
            candidates.append([marker_single, input_str, "--output_dir", out_str])
        if importlib.util.find_spec("marker_single"):
            candidates.append(
                [
                    sys.executable,
                    "-m",
                    "marker_single",
                    input_str,
                    "--output_dir",
                    out_str,
                    "--output_format",
                    "markdown",
                ]
            )
            candidates.append([sys.executable, "-m", "marker_single", input_str, "--output_dir", out_str])
        return candidates

    if runtime == "docling":
        candidates = []
        if python312.exists():
            candidates.append(
                [
                    str(python312),
                    str(DOCLING_HELPER),
                    "--input",
                    input_str,
                    "--output",
                    str(runtime_dir / "output.md"),
                    "--max-pages",
                    str(max_pages),
                ]
            )
        docling = shutil.which("docling")
        if docling:
            candidates.append([docling, input_str, "--output-dir", out_str])
            candidates.append([docling, input_str, "--output", out_str])
        if importlib.util.find_spec("docling"):
            candidates.append([sys.executable, "-m", "docling", input_str, "--output-dir", out_str])
            candidates.append([sys.executable, "-m", "docling", input_str, "--output", out_str])
        return candidates

    return []


def find_best_text_artifact(runtime_dir: Path) -> Path | None:
    matches: list[Path] = []
    for ext in TEXT_EXT_PRIORITY:
        matches.extend(runtime_dir.rglob(f"*{ext}"))

    if not matches:
        return None

    def sort_key(path: Path) -> tuple[int, int]:
        ext_rank = TEXT_EXT_PRIORITY.index(path.suffix.lower()) if path.suffix.lower() in TEXT_EXT_PRIORITY else 99
        size_rank = -path.stat().st_size
        return (ext_rank, size_rank)

    matches = sorted({path.resolve() for path in matches}, key=sort_key)
    return matches[0]


def read_text_artifact(path: Path) -> str:
    if path.suffix.lower() == ".json":
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return path.read_text(encoding="utf-8", errors="replace")

        if isinstance(payload, dict):
            for key in ("markdown", "text", "content"):
                value = payload.get(key)
                if isinstance(value, str):
                    return value
        return json.dumps(payload, ensure_ascii=False, indent=2)

    return path.read_text(encoding="utf-8", errors="replace")


def load_cached_result(runtime_dir: Path) -> RuntimeResult | None:
    result_path = runtime_dir / "result.json"
    if not result_path.exists():
        return None

    try:
        payload = json.loads(result_path.read_text(encoding="utf-8"))
        result = RuntimeResult(**payload)
        if result.status in {"success", "unavailable"}:
            return result
        return None
    except Exception:
        return None


def write_cached_result(runtime_dir: Path, result: RuntimeResult) -> None:
    runtime_dir.mkdir(parents=True, exist_ok=True)
    result_path = runtime_dir / "result.json"
    result_path.write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2), encoding="utf-8")


def run_external_runtime(
    runtime: str,
    sample: SampleInfo,
    runtime_dir: Path,
    timeout_seconds: int,
    override: str | None,
    python312: Path,
    max_pages: int,
    allow_model_download: bool,
    heartbeat_seconds: int,
) -> RuntimeResult:
    runtime_env = build_local_python_env(python312)
    if not allow_model_download:
        runtime_env["HF_HUB_OFFLINE"] = "1"

    available, availability_error = runtime_is_available(
        runtime,
        python312,
        runtime_env,
        allow_model_download,
    )
    if not available:
        return RuntimeResult(
            sample_id=sample.id,
            file_name=sample.file_name,
            runtime=runtime,
            status="unavailable",
            duration_ms=0,
            page_count=None,
            text_length=0,
            word_count=0,
            line_count=0,
            heading_hint_count=0,
            figure_anchor_count=0,
            table_anchor_count=0,
            appendix_anchor_count=0,
            output_path=None,
            error=availability_error,
            command=None,
        )

    commands = resolve_runtime_commands(
        runtime,
        Path(sample.path),
        runtime_dir,
        override,
        python312,
        max_pages,
    )
    if not commands:
        return RuntimeResult(
            sample_id=sample.id,
            file_name=sample.file_name,
            runtime=runtime,
            status="unavailable",
            duration_ms=0,
            page_count=None,
            text_length=0,
            word_count=0,
            line_count=0,
            heading_hint_count=0,
            figure_anchor_count=0,
            table_anchor_count=0,
            appendix_anchor_count=0,
            output_path=None,
            error=f"No runnable command found for {runtime}.",
            command=None,
        )

    attempts: list[str] = []
    for command in commands:
        started_at = time.perf_counter()
        try:
            use_local_python = bool(command) and Path(command[0]).resolve() == python312.resolve()
            completed = run_subprocess(
                command,
                ROOT,
                timeout_seconds,
                env=runtime_env if use_local_python else None,
                heartbeat_label=f"{runtime}/{sample.id}",
                heartbeat_seconds=heartbeat_seconds,
            )
        except subprocess.TimeoutExpired:
            return RuntimeResult(
                sample_id=sample.id,
                file_name=sample.file_name,
                runtime=runtime,
                status="timeout",
                duration_ms=int((time.perf_counter() - started_at) * 1000),
                page_count=None,
                text_length=0,
                word_count=0,
                line_count=0,
                heading_hint_count=0,
                figure_anchor_count=0,
                table_anchor_count=0,
                appendix_anchor_count=0,
                output_path=None,
                error=f"Timed out after {timeout_seconds}s",
                command=stringify_command(command),
            )

        duration_ms = int((time.perf_counter() - started_at) * 1000)
        if completed.returncode != 0:
            stderr = decode_output(completed.stderr).strip()
            stdout = decode_output(completed.stdout).strip()
            attempts.append(
                f"{stringify_command(command)} -> exit {completed.returncode}: {(stderr or stdout or 'no output')[:180]}"
            )
            continue

        artifact = find_best_text_artifact(runtime_dir)
        if artifact is None:
            attempts.append(f"{stringify_command(command)} -> success with no markdown/txt/json artifact")
            continue

        text = read_text_artifact(artifact)
        metrics = compute_metrics(text)
        return RuntimeResult(
            sample_id=sample.id,
            file_name=sample.file_name,
            runtime=runtime,
            status="success",
            duration_ms=duration_ms,
            page_count=None,
            output_path=str(artifact),
            error=None,
            command=stringify_command(command),
            **metrics,
        )

    return RuntimeResult(
        sample_id=sample.id,
        file_name=sample.file_name,
        runtime=runtime,
        status="error",
        duration_ms=0,
        page_count=None,
        text_length=0,
        word_count=0,
        line_count=0,
        heading_hint_count=0,
        figure_anchor_count=0,
        table_anchor_count=0,
        appendix_anchor_count=0,
        output_path=None,
        error="\n".join(attempts)[:1500] or f"All {runtime} command attempts failed.",
        command=stringify_command(commands[0]),
    )


def run_runtime(
    runtime: str,
    sample: SampleInfo,
    out_dir: Path,
    timeout_seconds: int,
    marker_override: str | None,
    docling_override: str | None,
    python312: Path,
    force: bool,
    max_pages: int,
    allow_model_download: bool,
    heartbeat_seconds: int,
) -> RuntimeResult:
    runtime_dir = out_dir / runtime / sample.id

    if not force:
        cached_result = load_cached_result(runtime_dir)
        if cached_result is not None:
            return cached_result

    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    if runtime == "pdf-parse":
        result = run_pdf_parse_with_max_pages(sample, runtime_dir, timeout_seconds, max_pages)
        write_cached_result(runtime_dir, result)
        return result
    if runtime == "marker":
        result = run_external_runtime(
            runtime,
            sample,
            runtime_dir,
            timeout_seconds,
            marker_override,
            python312,
            max_pages,
            allow_model_download,
            heartbeat_seconds,
        )
        write_cached_result(runtime_dir, result)
        return result
    if runtime == "docling":
        result = run_external_runtime(
            runtime,
            sample,
            runtime_dir,
            timeout_seconds,
            docling_override,
            python312,
            max_pages,
            allow_model_download,
            heartbeat_seconds,
        )
        write_cached_result(runtime_dir, result)
        return result
    raise ValueError(f"Unsupported runtime: {runtime}")


def build_summary(results: list[RuntimeResult]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for runtime in RUNTIME_ORDER:
        rows = [item for item in results if item.runtime == runtime]
        if not rows:
            continue
        success_rows = [item for item in rows if item.status == "success"]
        summary[runtime] = {
            "samples": len(rows),
            "success": sum(1 for item in rows if item.status == "success"),
            "unavailable": sum(1 for item in rows if item.status == "unavailable"),
            "error": sum(1 for item in rows if item.status == "error"),
            "timeout": sum(1 for item in rows if item.status == "timeout"),
            "avg_duration_ms": round(statistics.mean(item.duration_ms for item in success_rows), 1)
            if success_rows
            else None,
            "avg_text_length": round(statistics.mean(item.text_length for item in success_rows), 1)
            if success_rows
            else None,
            "avg_heading_hints": round(
                statistics.mean(item.heading_hint_count for item in success_rows), 1
            )
            if success_rows
            else None,
        }
    return summary


def write_outputs(
    out_dir: Path,
    samples: list[SampleInfo],
    results: list[RuntimeResult],
    summary: dict[str, dict[str, Any]],
    args: argparse.Namespace,
) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "latest.json"
    md_path = out_dir / "latest.md"

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "samplesDir": str(Path(args.samples_dir).resolve()),
        "manifestPath": str(Path(args.manifest).resolve()),
        "outputDir": str(out_dir.resolve()),
        "sampleSet": args.sample_set,
        "sampleIds": args.sample_ids,
        "runtimes": [runtime.strip() for runtime in args.runtimes.split(",") if runtime.strip()],
        "timeoutSeconds": args.timeout_seconds,
        "python312": str(Path(args.python312).resolve()),
        "force": args.force,
        "samples": [asdict(sample) for sample in samples],
        "summary": summary,
        "results": [asdict(result) for result in results],
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary_rows = []
    for runtime in payload["runtimes"]:
        runtime_summary = summary.get(runtime)
        if runtime_summary is None:
            continue
        summary_rows.append(
            [
                runtime,
                str(runtime_summary["samples"]),
                str(runtime_summary["success"]),
                str(runtime_summary["unavailable"]),
                str(runtime_summary["error"]),
                str(runtime_summary["timeout"]),
                format_ms(runtime_summary["avg_duration_ms"]),
                str(runtime_summary["avg_text_length"] or "-"),
                str(runtime_summary["avg_heading_hints"] or "-"),
            ]
        )

    detail_rows = []
    for result in results:
        detail_rows.append(
            [
                result.runtime,
                result.sample_id,
                result.status,
                str(result.page_count or "-"),
                str(result.duration_ms),
                str(result.text_length),
                str(result.heading_hint_count),
                str(result.figure_anchor_count),
                str(result.table_anchor_count),
                str(result.appendix_anchor_count),
                result.error[:80].replace("\n", " ") + ("..." if result.error and len(result.error) > 80 else "")
                if result.error
                else "-",
            ]
        )

    sample_rows = [
        [
            sample.id,
            sample.category,
            sample.file_name,
            str(round(sample.size_bytes / 1024, 1)),
            sample.source,
        ]
        for sample in samples
    ]

    lines = [
        "# Structured RAG PDF Runtime Comparison",
        "",
        f"- Generated at: `{payload['generatedAt']}`",
        f"- Sample set: `{payload['sampleSet']}`",
        f"- Samples dir: `{payload['samplesDir']}`",
        f"- JSON payload: `{json_path}`",
        "",
        "## Samples",
        "",
        render_markdown_table(
            ["sample", "category", "file", "sizeKB", "source"],
            sample_rows,
        ),
        "",
        "## Runtime Summary",
        "",
        render_markdown_table(
            [
                "runtime",
                "samples",
                "success",
                "unavailable",
                "error",
                "timeout",
                "avgMs",
                "avgTextLen",
                "avgHeadingHints",
            ],
            summary_rows,
        ),
        "",
        "## Detailed Results",
        "",
        render_markdown_table(
            [
                "runtime",
                "sample",
                "status",
                "pages",
                "durationMs",
                "textLen",
                "headingHints",
                "figureAnchors",
                "tableAnchors",
                "appendixAnchors",
                "error",
            ],
            detail_rows,
        ),
        "",
    ]
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


def persist_progress(
    out_dir: Path,
    samples: list[SampleInfo],
    results: list[RuntimeResult],
    args: argparse.Namespace,
) -> tuple[Path, Path]:
    summary = build_summary(results)
    return write_outputs(out_dir, samples, results, summary, args)


def main() -> int:
    args = parse_args()
    samples_dir = Path(args.samples_dir).resolve()
    manifest_path = Path(args.manifest).resolve()
    out_dir = Path(args.out_dir).resolve()
    acquire_run_lock(out_dir, args.ignore_lock)
    runtimes = [runtime.strip() for runtime in args.runtimes.split(",") if runtime.strip()]

    unknown = [runtime for runtime in runtimes if runtime not in RUNTIME_ORDER]
    if unknown:
        raise SystemExit(f"Unsupported runtimes: {', '.join(unknown)}")

    samples = load_samples(samples_dir, manifest_path)
    if not samples:
        raise SystemExit(f"No PDF samples found in {samples_dir}")
    samples = select_samples(samples, args)
    if not samples:
        raise SystemExit("No PDF samples matched the current sample filter.")

    print(f"Structured RAG PDF runtime comparison")
    print(f"Sample set:       {args.sample_set}")
    print(f"Samples directory: {samples_dir}")
    print(f"Output directory:  {out_dir}")
    print(f"Python 3.12:       {Path(args.python312).resolve()}")
    print("")

    results: list[RuntimeResult] = []
    python312 = Path(args.python312).resolve()
    for sample in samples:
        print(f"[sample] {sample.id} ({sample.file_name})")
        for runtime in runtimes:
            print(f"  - {runtime:<9} running...", flush=True)
            try:
                result = run_runtime(
                    runtime=runtime,
                    sample=sample,
                    out_dir=out_dir,
                    timeout_seconds=get_timeout_for_runtime(runtime, args),
                marker_override=args.marker_command,
                docling_override=args.docling_command,
                python312=python312,
                force=args.force,
                max_pages=get_max_pages(sample, args),
                allow_model_download=args.allow_model_download,
                heartbeat_seconds=args.heartbeat_seconds,
            )
            except KeyboardInterrupt:
                print("")
                print("Interrupted by user. Writing partial results.")
                json_path, md_path = persist_progress(out_dir, samples, results, args)
                print(f"Markdown report: {md_path}")
                print(f"JSON report:     {json_path}")
                return 130

            results.append(result)
            persist_progress(out_dir, samples, results, args)
            print(
                f"  - {runtime:<9} status={result.status:<11} durationMs={result.duration_ms:<6} "
                f"textLen={result.text_length:<8} output={result.output_path or '-'}"
            )

    summary = build_summary(results)
    json_path, md_path = write_outputs(out_dir, samples, results, summary, args)

    print("")
    print("Summary")
    for runtime in runtimes:
        runtime_summary = summary.get(runtime)
        if runtime_summary is None:
            continue
        print(
            f"  - {runtime}: success={runtime_summary['success']}, unavailable={runtime_summary['unavailable']}, "
            f"error={runtime_summary['error']}, timeout={runtime_summary['timeout']}, "
            f"avgMs={format_ms(runtime_summary['avg_duration_ms'])}"
        )
    print("")
    print(f"Markdown report: {md_path}")
    print(f"JSON report:     {json_path}")

    if args.fail_on_runtime_error and any(
        item.status in {"error", "timeout"} for item in results if item.runtime in runtimes
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
