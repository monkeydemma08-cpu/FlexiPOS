from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

PAGE_WIDTH = 612
PAGE_HEIGHT = 792
MARGIN = 72
CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2)

FONT_BODY = "Times-Roman"
FONT_BOLD = "Times-Bold"
FONT_ITALIC = "Times-Italic"

LINE_SPACING = 6
PARA_SPACING = 8
LIST_ITEM_SPACING = 4
CALLOUT_SPACING = 8
HEADING_SPACING = {
    "h1": 10,
    "h2": 8,
    "h3": 6,
    "h4": 6,
}


@dataclass
class Line:
    text: str
    font: str
    size: int
    x: float
    y: float
    word_spacing: float = 0.0


class ManualParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tokens: list[tuple[str, str]] = []
        self.current_tag: str | None = None
        self.current_text: list[str] = []
        self.page_started = False
        self.in_callout = False
        self.capture_div_as: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "div":
            classes = attrs_dict.get("class", "") or ""
            class_set = set(classes.split())
            if "page" in class_set:
                if self.page_started:
                    self.tokens.append(("page_break", ""))
                self.page_started = True
            if "callout" in class_set:
                self.in_callout = True
            if "brand" in class_set:
                self.current_tag = "h1"
                self.current_text = []
                self.capture_div_as = "h1"
                return
            if "subtitle" in class_set:
                self.current_tag = "p"
                self.current_text = []
                self.capture_div_as = "p"
                return
        if tag in ("h1", "h2", "h3", "h4", "p", "li"):
            self.current_tag = tag
            self.current_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self.capture_div_as:
            self._flush(self.capture_div_as)
            self.capture_div_as = None
            return
        if tag == "div" and self.in_callout:
            self.in_callout = False
        if tag in ("h1", "h2", "h3", "h4", "p", "li"):
            self._flush(tag)

    def handle_data(self, data: str) -> None:
        if self.current_tag:
            self.current_text.append(data)

    def _flush(self, tag: str) -> None:
        text = "".join(self.current_text).strip()
        if text:
            token_type = tag
            if self.in_callout and tag == "p":
                token_type = "callout"
            self.tokens.append((token_type, text))
        self.current_tag = None
        self.current_text = []


def char_width(ch: str) -> float:
    if ch == " ":
        return 0.25
    if ch in "il.,;:!'\"`":
        return 0.22
    if ch in "mwMW":
        return 0.85
    if ch.isupper():
        return 0.68
    if ch.isdigit():
        return 0.55
    if ch in "áéíóúÁÉÍÓÚñÑ":
        return 0.55
    return 0.5


def text_width(text: str, size: int) -> float:
    return sum(char_width(ch) for ch in text) * size


def wrap_text(text: str, size: int, max_width: float) -> list[list[str]]:
    words = text.split()
    if not words:
        return []
    lines: list[list[str]] = []
    current = [words[0]]
    for word in words[1:]:
        candidate = current + [word]
        candidate_text = " ".join(candidate)
        if text_width(candidate_text, size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = [word]
    lines.append(current)
    return lines


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def add_footer(lines: list[Line], page_number: int) -> None:
    footer_text = f"POSIUM · Manual de operación · {page_number}"
    size = 9
    width = text_width(footer_text, size)
    x = (PAGE_WIDTH - width) / 2
    y = 40
    lines.append(Line(footer_text, FONT_ITALIC, size, x, y))


def build_pages(tokens: list[tuple[str, str]]) -> list[list[Line]]:
    pages: list[list[Line]] = []
    y = PAGE_HEIGHT - MARGIN
    current_lines: list[Line] = []

    def new_page() -> None:
        nonlocal y, current_lines
        if current_lines:
            pages.append(current_lines)
        current_lines = []
        y = PAGE_HEIGHT - MARGIN

    def ensure_space(height: float) -> None:
        nonlocal y
        if y - height < MARGIN:
            new_page()

    def add_line(
        text: str,
        font: str,
        size: int,
        indent: float = 0.0,
        spacing: float = 0.0,
        line_spacing: int = LINE_SPACING,
    ) -> None:
        nonlocal y
        ensure_space(size + line_spacing)
        x = MARGIN + indent
        current_lines.append(Line(text, font, size, x, y, spacing))
        y -= (size + line_spacing)

    def add_paragraph(
        text: str,
        size: int = 11,
        font: str = FONT_BODY,
        indent: float = 0.0,
        paragraph_spacing: int = PARA_SPACING,
    ) -> None:
        nonlocal y
        lines_words = wrap_text(text, size, CONTENT_WIDTH - indent)
        for i, words in enumerate(lines_words):
            line_text = " ".join(words)
            spacing = 0.0
            if i < len(lines_words) - 1 and len(words) > 1:
                line_width = text_width(line_text, size)
                extra = (CONTENT_WIDTH - indent) - line_width
                if extra > 0:
                    spacing = extra / (len(words) - 1)
            add_line(line_text, font, size, indent=indent, spacing=spacing)
        y -= paragraph_spacing

    while tokens and tokens[0][0] != "page_break":
        tokens.pop(0)
    if tokens and tokens[0][0] == "page_break":
        tokens.pop(0)

    for token_type, text in tokens:
        if token_type == "page_break":
            new_page()
            continue
        if token_type == "h1":
            add_paragraph(text.upper(), size=18, font=FONT_BOLD)
            y -= HEADING_SPACING["h1"]
        elif token_type == "h2":
            add_paragraph(text, size=14, font=FONT_BOLD)
            y -= HEADING_SPACING["h2"]
        elif token_type == "h3":
            add_paragraph(text, size=12, font=FONT_BOLD)
            y -= HEADING_SPACING["h3"]
        elif token_type == "h4":
            add_paragraph(text, size=11, font=FONT_BOLD)
            y -= HEADING_SPACING["h4"]
        elif token_type == "callout":
            add_paragraph(
                f"Nota: {text}",
                size=10,
                font=FONT_ITALIC,
                indent=8,
                paragraph_spacing=CALLOUT_SPACING,
            )
        elif token_type == "li":
            add_paragraph(
                f"- {text}",
                size=11,
                font=FONT_BODY,
                indent=12,
                paragraph_spacing=LIST_ITEM_SPACING,
            )
        elif token_type == "p":
            add_paragraph(text, size=11, font=FONT_BODY)
        else:
            add_paragraph(text, size=11, font=FONT_BODY)

    if current_lines:
        pages.append(current_lines)
    return pages


def build_cover_page() -> list[Line]:
    lines: list[Line] = []
    brand = "POSIUM"
    subtitle = "Manual integral de operación, configuración y buenas prácticas"
    tagline = "Guía general + adaptación práctica para tu negocio"
    meta1 = f"Versión: {date.today().strftime('%d/%m/%Y')}"
    meta2 = "Soporte y adquisición: 809-967-2501"

    y = PAGE_HEIGHT - 200

    def center(text: str, size: int, font: str) -> None:
        nonlocal y
        width = text_width(text, size)
        x = (PAGE_WIDTH - width) / 2
        lines.append(Line(text, font, size, x, y))
        y -= (size + 10)

    center(brand, 28, FONT_BOLD)
    center(subtitle, 14, FONT_BODY)
    center(tagline, 12, FONT_BODY)
    y -= 20
    center(meta1, 11, FONT_ITALIC)
    center(meta2, 11, FONT_ITALIC)
    return lines


def build_pdf(pages: list[list[Line]], output: Path) -> None:
    objects: list[bytes] = []

    def add_obj(content: bytes) -> int:
        objects.append(content)
        return len(objects)

    font_body_id = add_obj(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>"
    )
    font_bold_id = add_obj(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>"
    )
    font_italic_id = add_obj(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>"
    )

    content_ids: list[int] = []
    for page_lines in pages:
        content_lines: list[str] = []
        for line in page_lines:
            font_ref = {
                FONT_BODY: f"/F{font_body_id}",
                FONT_BOLD: f"/F{font_bold_id}",
                FONT_ITALIC: f"/F{font_italic_id}",
            }[line.font]
            text = pdf_escape(line.text)
            try:
                text.encode("cp1252")
            except Exception:
                text = text.encode("cp1252", errors="replace").decode("cp1252")
            content_lines.append(
                f"BT {font_ref} {line.size} Tf {line.word_spacing:.2f} Tw {line.x:.2f} {line.y:.2f} Td ({text}) Tj ET"
            )
        stream = "\n".join(content_lines).encode("cp1252", errors="replace")
        content = b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"
        content_id = add_obj(content)
        content_ids.append(content_id)

    page_ids: list[int] = []
    pages_id = len(objects) + len(pages) + 1

    for content_id in content_ids:
        page = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F{font_body_id} {font_body_id} 0 R /F{font_bold_id} {font_bold_id} 0 R "
            f"/F{font_italic_id} {font_italic_id} 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode("ascii")
        page_ids.append(add_obj(page))

    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    pages_obj = f"<< /Type /Pages /Kids [ {kids} ] /Count {len(page_ids)} >>".encode("ascii")
    pages_id = add_obj(pages_obj)

    catalog_id = add_obj(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii"))

    xref_offsets: list[int] = []
    output_data = bytearray()
    output_data.extend(b"%PDF-1.4\n")
    for i, obj in enumerate(objects, start=1):
        xref_offsets.append(len(output_data))
        output_data.extend(f"{i} 0 obj\n".encode("ascii"))
        output_data.extend(obj)
        output_data.extend(b"\nendobj\n")
    xref_start = len(output_data)
    output_data.extend(f"xref\n0 {len(objects)+1}\n".encode("ascii"))
    output_data.extend(b"0000000000 65535 f \n")
    for offset in xref_offsets:
        output_data.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output_data.extend(
        f"trailer\n<< /Size {len(objects)+1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode(
            "ascii"
        )
    )
    output.write_bytes(output_data)


def main() -> None:
    html_path = Path("docs/manual_posium.html")
    parser = ManualParser()
    parser.feed(html_path.read_text(encoding="utf-8"))

    cover_page = build_cover_page()
    content_pages = build_pages(parser.tokens)

    all_pages = [cover_page] + content_pages
    for i, page in enumerate(all_pages, start=1):
        add_footer(page, i)

    output_path = Path("docs/Manual_POSIUM.pdf")
    build_pdf(all_pages, output_path)
    print(f"PDF generado: {output_path}")


if __name__ == "__main__":
    main()
