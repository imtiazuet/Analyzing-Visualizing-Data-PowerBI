"""Build a PowerPoint deck whose slideshow is a 2-minute countdown timer.

Each second of the countdown is its own slide. Slideshow timings advance
one slide per second, from 02:00 down to 00:00, then hold on the last slide.
"""

from __future__ import annotations

import argparse
import io
import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

SLIDE_W = Inches(13.333333)
SLIDE_H = Inches(7.5)
BG = RGBColor(0x0B, 0x12, 0x20)
MUTED = RGBColor(0x94, 0xA3, 0xB8)
LABEL = RGBColor(0x93, 0xC5, 0xFD)
WHITE = RGBColor(0xF8, 0xFA, 0xFC)
TRACK = RGBColor(0x1E, 0x29, 0x3B)
ACCENT = RGBColor(0x38, 0xBD, 0xF8)
WARN = RGBColor(0xFB, 0xBF, 0x24)
DANGER = RGBColor(0xF8, 0x71, 0x71)
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _set_run(run, text: str, size: int, color: RGBColor, bold: bool = False) -> None:
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = "Arial"


def _add_text(slide, left, top, width, height, text, size, color, bold=False):
    shape = slide.shapes.add_textbox(left, top, width, height)
    frame = shape.text_frame
    frame.word_wrap = False
    frame.auto_size = None
    frame.margin_left = Emu(0)
    frame.margin_right = Emu(0)
    frame.margin_top = Emu(0)
    frame.margin_bottom = Emu(0)
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    paragraph = frame.paragraphs[0]
    paragraph.alignment = PP_ALIGN.CENTER
    paragraph.space_before = Pt(0)
    paragraph.space_after = Pt(0)
    _set_run(paragraph.add_run(), text, size, color, bold)
    return shape


def _rect(slide, left, top, width, height, color: RGBColor):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    # Keep the rounded corner subtle and consistent.
    shape.adjustments[0] = 0.5
    return shape


def _advance_after(slide, milliseconds: int) -> None:
    # A cut keeps the second accurate. advTm is how long the slide stays up.
    transition = etree.Element(qn("p:transition"))
    transition.set("spd", "fast")
    transition.set("advClick", "0")
    transition.set("advTm", str(milliseconds))
    etree.SubElement(transition, qn("p:cut"))
    slide._element.append(transition)


def _paint_slide(slide, remaining: int, total: int) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = BG

    minutes, seconds = divmod(remaining, 60)
    clock = f"{minutes:02d}:{seconds:02d}"
    if remaining == 0:
        clock_color = DANGER
        status = "Time is up"
        status_color = DANGER
        bar_color = DANGER
    elif remaining <= 10:
        clock_color = DANGER
        status = "2-minute timer"
        status_color = DANGER
        bar_color = DANGER
    elif remaining <= 30:
        clock_color = WARN
        status = "2-minute timer"
        status_color = MUTED
        bar_color = WARN
    else:
        clock_color = WHITE
        status = "2-minute timer"
        status_color = MUTED
        bar_color = ACCENT

    _add_text(
        slide, Inches(0.8), Inches(1.15), Inches(11.73), Inches(0.45),
        "PRESENTATION", 22, LABEL, bold=True,
    )
    _add_text(
        slide, Inches(0.8), Inches(1.85), Inches(11.73), Inches(0.4),
        "TIME REMAINING", 18, MUTED, bold=False,
    )
    _add_text(
        slide, Inches(0.8), Inches(2.35), Inches(11.73), Inches(2.3),
        clock, 132, clock_color, bold=True,
    )
    _add_text(
        slide, Inches(0.8), Inches(4.75), Inches(11.73), Inches(0.45),
        status, 22, status_color, bold=False,
    )

    track_left = Inches(1.666)
    track_top = Inches(5.85)
    track_width = Inches(10.0)
    track_height = Inches(0.22)
    _rect(slide, track_left, track_top, track_width, track_height, TRACK)
    if remaining > 0:
        fill_width = int(track_width * remaining / total)
        if fill_width > 0:
            _rect(slide, track_left, track_top, fill_width, track_height, bar_color)

    _add_text(
        slide, Inches(0.8), Inches(6.35), Inches(11.73), Inches(0.4),
        "Starts at 02:00  ·  advances automatically  ·  press Esc to exit",
        14, RGBColor(0x64, 0x74, 0x8B), bold=False,
    )


def _enable_timings(package: bytes) -> bytes:
    """Turn on 'Use Timings' so PowerPoint and Impress honor the countdown."""
    src = zipfile.ZipFile(io.BytesIO(package), "r")
    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, "w") as dst:
        pres_props = (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<p:presentationPr xmlns:p="{P_NS}" xmlns:r="{R_NS}">'
            f'<p:showPr useTimings="1"/></p:presentationPr>'
        )
        for info in src.infolist():
            data = pres_props.encode("utf-8") if info.filename == "ppt/presProps.xml" else src.read(info.filename)
            dst.writestr(info, data)
    return out_buf.getvalue()


def build(path: Path, seconds: int = 120) -> None:
    if seconds < 1:
        raise SystemExit("seconds must be at least 1")
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    prs.core_properties.title = "2-minute presentation timer"
    prs.core_properties.subject = "Countdown timer lasting 2 minutes"
    blank = prs.slide_layouts[6]

    for elapsed in range(seconds + 1):
        remaining = seconds - elapsed
        slide = prs.slides.add_slide(blank)
        _paint_slide(slide, remaining, seconds)
        if remaining > 0:
            _advance_after(slide, 1000)

    buf = io.BytesIO()
    prs.save(buf)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_enable_timings(buf.getvalue()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=Path(__file__).with_name("2-minute-timer.pptx"),
    )
    parser.add_argument("--seconds", type=int, default=120)
    args = parser.parse_args()
    build(args.output, args.seconds)
    print(f"Wrote {args.output} ({args.seconds} seconds, {args.seconds + 1} slides)")


if __name__ == "__main__":
    main()
