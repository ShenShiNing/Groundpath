from __future__ import annotations

import argparse
import textwrap
from pathlib import Path

PAGE_WIDTH = 612
PAGE_HEIGHT = 792


def escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class Canvas:
    def __init__(self, width: int = PAGE_WIDTH, height: int = PAGE_HEIGHT) -> None:
        self.width = width
        self.height = height
        self.ops: list[str] = []

    def add(self, command: str) -> None:
        self.ops.append(command)

    def rect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        fill: tuple[float, float, float] | None = None,
        stroke: tuple[float, float, float] | None = None,
        line_width: float = 1,
    ) -> None:
        self.add(f"{line_width:.2f} w")
        if fill is not None:
            self.add(f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg")
        if stroke is not None:
            self.add(f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG")
        self.add(f"{x:.2f} {y:.2f} {width:.2f} {height:.2f} re")
        if fill is not None and stroke is not None:
            self.add("B")
        elif fill is not None:
            self.add("f")
        else:
            self.add("S")

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        *,
        stroke: tuple[float, float, float] = (0.25, 0.25, 0.25),
        line_width: float = 1,
    ) -> None:
        self.add(f"{line_width:.2f} w")
        self.add(f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG")
        self.add(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def text(
        self,
        x: float,
        y: float,
        value: str,
        *,
        font: str = "F1",
        size: int = 12,
        color: tuple[float, float, float] = (0.12, 0.12, 0.12),
    ) -> None:
        escaped = escape_pdf_text(value)
        self.add("BT")
        self.add(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg")
        self.add(f"/{font} {size} Tf")
        self.add(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        self.add(f"({escaped}) Tj")
        self.add("ET")

    def paragraph(
        self,
        x: float,
        y: float,
        width: float,
        value: str,
        *,
        font: str = "F1",
        size: int = 11,
        leading: int = 14,
        color: tuple[float, float, float] = (0.18, 0.18, 0.18),
    ) -> float:
        max_chars = max(12, int(width / max(size * 0.52, 1)))
        lines = textwrap.wrap(value, width=max_chars)
        current_y = y
        for line in lines:
            self.text(x, current_y, line, font=font, size=size, color=color)
            current_y -= leading
        return current_y

    def bar_chart(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        values: list[int],
        labels: list[str],
        *,
        title: str,
    ) -> None:
        self.text(x, y + height + 22, title, font="F2", size=12)
        self.line(x, y, x, y + height)
        self.line(x, y, x + width, y)
        bar_width = width / (len(values) * 1.5)
        gap = bar_width / 2
        max_value = max(values) or 1

        for index, value in enumerate(values):
            bar_height = height * (value / max_value)
            left = x + gap + index * (bar_width + gap)
            self.rect(
                left,
                y,
                bar_width,
                bar_height,
                fill=(0.27, 0.54, 0.89),
                stroke=(0.18, 0.34, 0.62),
            )
            self.text(left + 4, y + bar_height + 8, str(value), size=9)
            self.text(left - 2, y - 16, labels[index], size=9)

    def line_chart(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        values: list[int],
        labels: list[str],
        *,
        title: str,
    ) -> None:
        self.text(x, y + height + 22, title, font="F2", size=12)
        self.line(x, y, x, y + height)
        self.line(x, y, x + width, y)
        max_value = max(values) or 1
        step = width / max(1, len(values) - 1)
        points: list[tuple[float, float]] = []

        for index, value in enumerate(values):
            px = x + index * step
            py = y + height * (value / max_value)
            points.append((px, py))
            self.rect(px - 2, py - 2, 4, 4, fill=(0.83, 0.29, 0.25))
            self.text(px - 6, y - 16, labels[index], size=9)

        for start, end in zip(points, points[1:]):
            self.line(start[0], start[1], end[0], end[1], stroke=(0.83, 0.29, 0.25), line_width=2)

    def table(
        self,
        x: float,
        y: float,
        column_widths: list[float],
        row_height: float,
        headers: list[str],
        rows: list[list[str]],
    ) -> None:
        current_y = y
        total_width = sum(column_widths)
        self.rect(x, current_y, total_width, row_height, fill=(0.9, 0.94, 0.98), stroke=(0.4, 0.4, 0.4))

        current_x = x
        for width, header in zip(column_widths, headers):
            self.line(current_x, current_y, current_x, current_y - row_height * (len(rows) + 1))
            self.text(current_x + 6, current_y - 16, header, font="F2", size=10)
            current_x += width
        self.line(x + total_width, current_y, x + total_width, current_y - row_height * (len(rows) + 1))

        for row_index, row in enumerate(rows, start=1):
            row_y = current_y - row_height * row_index
            self.rect(x, row_y, total_width, row_height, stroke=(0.5, 0.5, 0.5))
            cell_x = x
            for width, cell in zip(column_widths, row):
                self.text(cell_x + 6, row_y - 16, cell, size=10)
                cell_x += width

    def to_bytes(self) -> bytes:
        return "\n".join(self.ops).encode("ascii")


def build_pdf(page_streams: list[bytes], path: Path) -> None:
    font_ids = {"F1": 1, "F2": 2, "F3": 3}
    content_ids = [4 + index for index in range(len(page_streams))]
    page_ids = [4 + len(page_streams) + index for index in range(len(page_streams))]
    pages_id = 4 + len(page_streams) * 2
    catalog_id = pages_id + 1

    objects: dict[int, bytes] = {
        1: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        2: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    }

    for object_id, stream in zip(content_ids, page_streams):
        objects[object_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream"
        )

    for page_id, content_id in zip(page_ids, content_ids):
        objects[page_id] = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_ids['F1']} 0 R /F2 {font_ids['F2']} 0 R /F3 {font_ids['F3']} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id] = f"<< /Type /Pages /Count {len(page_ids)} /Kids [{kids}] >>".encode("ascii")
    objects[catalog_id] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")

    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {0: 0}

    for object_id in range(1, catalog_id + 1):
        offsets[object_id] = len(result)
        result.extend(f"{object_id} 0 obj\n".encode("ascii"))
        result.extend(objects[object_id])
        result.extend(b"\nendobj\n")

    xref_offset = len(result)
    result.extend(f"xref\n0 {catalog_id + 1}\n".encode("ascii"))
    result.extend(b"0000000000 65535 f \n")
    for object_id in range(1, catalog_id + 1):
        result.extend(f"{offsets[object_id]:010d} 00000 n \n".encode("ascii"))

    result.extend(
        (
            f"trailer\n<< /Size {catalog_id + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("ascii")
    )
    path.write_bytes(result)


def build_chart_dense_report(path: Path) -> None:
    pages: list[bytes] = []

    page1 = Canvas()
    page1.rect(36, 730, 540, 34, fill=(0.14, 0.29, 0.48))
    page1.text(50, 742, "Synthetic Grid Outlook Report", font="F2", size=24, color=(1, 1, 1))
    page1.text(50, 714, "Sample category: chart-dense report with KPI cards, figures, tables, and appendix anchors.", size=11)
    page1.paragraph(
        50,
        678,
        500,
        "Executive summary. This synthetic report is designed to stress heading extraction, "
        "caption detection, chart adjacency, and locator rendering. The page mixes short "
        "summary prose with scorecards and figure references.",
    )

    cards = [
        ("Demand index", "124"),
        ("Storage share", "19%"),
        ("Peak load", "8.2 TW"),
    ]
    x = 50
    for title, value in cards:
        page1.rect(x, 560, 150, 80, fill=(0.93, 0.96, 0.99), stroke=(0.48, 0.62, 0.83))
        page1.text(x + 12, 612, title, font="F2", size=12)
        page1.text(x + 12, 580, value, font="F2", size=22, color=(0.18, 0.39, 0.65))
        x += 170

    page1.text(50, 520, "1. Key findings", font="F2", size=16)
    findings = [
        "Scenario A keeps total demand growth below the baseline path.",
        "Scenario B shifts more load into storage-backed evening capacity.",
        "Appendix A lists the assumptions used by Figure 2-1 and Table 3-1.",
    ]
    y = 492
    for item in findings:
        page1.text(60, y, f"- {item}", size=11)
        y -= 18
    pages.append(page1.to_bytes())

    page2 = Canvas()
    page2.text(50, 742, "2. Figure-heavy analysis pages", font="F2", size=18)
    page2.bar_chart(
        50,
        470,
        220,
        160,
        [92, 101, 115, 124],
        ["2023", "2024", "2025", "2026"],
        title="Figure 2-1. Regional demand index",
    )
    page2.line_chart(
        320,
        470,
        220,
        160,
        [35, 41, 57, 64, 73],
        ["Q1", "Q2", "Q3", "Q4", "Q5"],
        title="Figure 2-2. Storage deployment path",
    )
    page2.paragraph(
        50,
        420,
        500,
        "Interpretation note. Figure 2-1 should stay attached to the surrounding narrative "
        "paragraph, while Figure 2-2 should preserve quarter labels and the caption text.",
    )
    page2.rect(50, 270, 490, 100, fill=(0.97, 0.94, 0.88), stroke=(0.82, 0.64, 0.35))
    page2.text(62, 346, "Callout", font="F2", size=12, color=(0.45, 0.29, 0.1))
    page2.paragraph(
        62,
        324,
        460,
        "Cross-reference check. The parser should keep the links between Section 2.1, "
        "Figure 2-1, Figure 2-2, and Appendix A. Notes below charts often get detached in "
        "fallback extractors.",
        size=10,
        leading=13,
    )
    pages.append(page2.to_bytes())

    page3 = Canvas()
    page3.text(50, 742, "3. Tables and appendix anchors", font="F2", size=18)
    page3.table(
        50,
        680,
        [170, 110, 110, 110],
        28,
        ["Metric", "Baseline", "Scenario A", "Scenario B"],
        [
            ["Capacity reserve", "14%", "18%", "22%"],
            ["Curtailment", "9.1", "6.4", "4.8"],
            ["Import reliance", "17", "14", "12"],
            ["Fallback ratio", "0.42", "0.21", "0.16"],
        ],
    )
    page3.paragraph(
        50,
        520,
        500,
        "Appendix A. Data assumptions for Table 3-1. This appendix block is intentionally "
        "text heavy so that heading nodes, table captions, and appendix references coexist on "
        "the same page.",
    )
    page3.text(50, 470, "Appendix anchors", font="F2", size=14)
    appendix_lines = [
        "Appendix A. Assumptions for Figure 2-1",
        "Appendix B. Figure caption normalization rules",
        "Appendix C. Table 3-1 citation locator examples",
    ]
    line_y = 444
    for line in appendix_lines:
        page3.text(60, line_y, line, size=11)
        line_y -= 18
    pages.append(page3.to_bytes())

    build_pdf(pages, path)


def build_mixed_layout_report(path: Path) -> None:
    pages: list[bytes] = []

    page1 = Canvas()
    page1.rect(36, 728, 540, 38, fill=(0.2, 0.42, 0.28))
    page1.text(50, 742, "Synthetic Mixed Layout Program Review", font="F2", size=23, color=(1, 1, 1))
    page1.text(50, 712, "Sample category: mixed layout report with two-column narrative and sidebars.", size=11)
    page1.text(50, 670, "Contents", font="F2", size=16)
    toc = [
        "1. Program overview",
        "2. Two-column implementation notes",
        "3. Sidebar callouts and pseudo figures",
        "Appendix A. Evidence locator examples",
    ]
    y = 642
    for item in toc:
        page1.text(60, y, item, size=11)
        y -= 18
    page1.paragraph(
        50,
        560,
        500,
        "This synthetic document focuses on page regions. Left and right columns carry separate "
        "topic threads, while sidebars and figure placeholders try to pull the parser away from "
        "the main narrative.",
    )
    pages.append(page1.to_bytes())

    page2 = Canvas()
    page2.text(50, 742, "2. Two-column implementation notes", font="F2", size=18)
    page2.rect(372, 488, 170, 190, fill=(0.92, 0.95, 0.98), stroke=(0.48, 0.62, 0.83))
    page2.text(384, 654, "Sidebar", font="F2", size=13)
    page2.paragraph(
        384,
        632,
        145,
        "Figure 2-A placeholder. Keep this box separate from the main two-column text. The parser "
        "should not merge sidebar notes into Section 2.1 paragraphs.",
        size=9,
        leading=12,
    )
    page2.rect(384, 520, 130, 70, fill=(0.83, 0.9, 0.97), stroke=(0.42, 0.58, 0.78))
    page2.text(394, 560, "Pseudo figure", font="F2", size=11)
    page2.line(398, 534, 500, 576, stroke=(0.83, 0.29, 0.25), line_width=2)
    page2.line(398, 552, 500, 548, stroke=(0.27, 0.54, 0.89), line_width=2)

    left_text = (
        "Section 2.1. Left column narrative. The program review tracks delivery milestones, "
        "staffing changes, and tool outputs. This column should remain a coherent reading block "
        "with its own heading and paragraph flow."
    )
    right_text = (
        "Section 2.2. Right column narrative. The adjacent column contains rollout notes, "
        "failure classifications, and citation UI observations. Two-column extraction often "
        "breaks ordering when sidebars occupy the same page."
    )
    page2.paragraph(50, 680, 145, left_text, size=10, leading=13)
    page2.paragraph(212, 680, 145, right_text, size=10, leading=13)
    page2.text(50, 500, "Figure 2-A. Sidebar chart placeholder", font="F2", size=12)
    page2.paragraph(
        50,
        478,
        300,
        "Caption check. The locator should attach this caption to the pseudo figure, not to the "
        "right column body text.",
        size=10,
        leading=13,
    )
    pages.append(page2.to_bytes())

    page3 = Canvas()
    page3.text(50, 742, "Appendix A. Locator and table examples", font="F2", size=18)
    page3.table(
        50,
        680,
        [160, 120, 120, 120],
        28,
        ["Anchor", "Section", "Page hint", "Expected node"],
        [
            ["Figure 2-A", "2.2", "p.2", "sidebar-figure"],
            ["Appendix A", "A.1", "p.3", "appendix-root"],
            ["Table A-1", "A.2", "p.3", "appendix-table"],
        ],
    )
    page3.paragraph(
        50,
        560,
        500,
        "Reviewer note. This appendix page mixes a formal table with explanatory prose, which "
        "helps verify whether locators like Figure 2-A and Table A-1 survive into final citations.",
    )
    page3.rect(50, 420, 500, 90, fill=(0.96, 0.93, 0.89), stroke=(0.8, 0.63, 0.36))
    page3.text(64, 486, "Quality checklist", font="F2", size=12)
    checks = [
        "Heading order preserved",
        "Two-column reading order acceptable",
        "Sidebar detached from body text",
        "Appendix references stable",
    ]
    y = 462
    for check in checks:
        page3.text(72, y, f"- {check}", size=10)
        y -= 16
    pages.append(page3.to_bytes())

    build_pdf(pages, path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    outputs = {
        "synthetic-chart-dense-report.pdf": build_chart_dense_report,
        "synthetic-mixed-layout-report.pdf": build_mixed_layout_report,
    }

    for file_name, builder in outputs.items():
        target = out_dir / file_name
        if target.exists() and not args.force:
            continue
        builder(target)


if __name__ == "__main__":
    main()
