from __future__ import annotations

import argparse
import json
from pathlib import Path

from docling.datamodel.base_models import ConversionStatus
from docling.document_converter import DocumentConverter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-pages", type=int, default=9223372036854775807)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    converter = DocumentConverter()
    result = converter.convert(
        input_path,
        raises_on_error=False,
        page_range=(1, args.max_pages),
    )

    payload = {
        "status": str(result.status),
        "success": result.status in {ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS},
        "errors": [
            {
                "component": error.component_type,
                "message": error.error_message,
            }
            for error in (result.errors or [])
        ],
    }

    if payload["success"]:
        markdown = result.document.export_to_markdown()
        output_path.write_text(markdown, encoding="utf-8")

    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
