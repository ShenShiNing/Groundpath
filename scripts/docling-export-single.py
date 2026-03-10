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
    parser.add_argument("--export-images", action="store_true", default=False)
    parser.add_argument("--image-dir", default=None)
    return parser.parse_args()


def export_images(result, image_dir: Path) -> list[dict]:
    """Export pictures from the converted document to image files.

    Returns a list of dicts with ``index`` and ``filename`` keys.
    Gracefully returns an empty list when the docling version does not
    support image extraction.
    """
    images: list[dict] = []
    try:
        pictures = getattr(result.document, "pictures", None)
        if not pictures:
            return images

        image_dir.mkdir(parents=True, exist_ok=True)

        for idx, picture in enumerate(pictures):
            try:
                pil_image = picture.get_image(result.document)
                if pil_image is None:
                    continue
                filename = f"figure_{idx}.png"
                pil_image.save(image_dir / filename, format="PNG")
                images.append({"index": idx, "filename": filename})
            except Exception:
                # Skip individual images that cannot be extracted
                continue
    except Exception:
        # Docling version may not support picture extraction – degrade gracefully
        pass

    return images


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
        "images": [],
    }

    if payload["success"]:
        markdown = result.document.export_to_markdown()
        output_path.write_text(markdown, encoding="utf-8")

        if args.export_images:
            image_dir = Path(args.image_dir).resolve() if args.image_dir else output_path.parent / "images"
            payload["images"] = export_images(result, image_dir)

    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
