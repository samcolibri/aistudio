#!/usr/bin/env python3
"""
Generate 'Should I Be a Nurse?' Instagram Carousel
6 slides — Python PIL, pixel-perfect text, exact brand colors
No AI image generation — programmatic, zero spelling mistakes

Run: python3 src/scripts/gen-carousel-pil.py
"""
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path("output/recUm0xdiqNLg664h/carousel")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1080, 1080  # Instagram square

# Brand colors
DARK    = "#282323"
DTEAL   = "#005374"
TEAL    = "#00709c"
PINK    = "#fc3467"
LBLUE   = "#75c7e6"
YELLOW  = "#fad74f"
WHITE   = "#ffffff"

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def find_font(size):
    """Try to find a clean system sans-serif font."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except:
                pass
    return ImageFont.load_default()

def find_bold_font(size):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSDisplayCondensed-Black.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except:
                pass
    return find_font(size)

def wrap_text(text, font, max_width, draw):
    """Wrap text to fit within max_width."""
    words = text.split()
    lines = []
    current = []
    for word in words:
        test = " ".join(current + [word])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines

def draw_slide_number(draw, num, total, bg_color):
    font = find_font(26)
    text = f"{num} of {total}"
    color = LBLUE if bg_color == DARK else WHITE
    draw.text((W - 60, H - 50), text, font=font, fill=hex_to_rgb(color), anchor="rs")

def slide_1_hook():
    img = Image.new("RGB", (W, H), hex_to_rgb(DARK))
    draw = ImageDraw.Draw(img)

    headline = "How to figure out\nif nursing fits\nyour life"
    font_h = find_bold_font(96)

    # Center the headline
    lines = headline.split("\n")
    line_h = 110
    total_h = len(lines) * line_h
    y = (H - total_h) // 2 - 30

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_h)
        x = (W - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=font_h, fill=hex_to_rgb(PINK))
        y += line_h

    # Tagline
    font_tag = find_font(34)
    tagline = "10 honest questions. No sugar-coating."
    bbox = draw.textbbox((0, 0), tagline, font=font_tag)
    x = (W - (bbox[2] - bbox[0])) // 2
    draw.text((x, y + 30), tagline, font=font_tag, fill=hex_to_rgb(LBLUE))

    # Brand name top left
    font_brand = find_bold_font(28)
    draw.text((54, 54), "SimpleNursing", font=font_brand, fill=hex_to_rgb(LBLUE))

    draw_slide_number(draw, 1, 6, DARK)
    return img

def slide_numbered_list(slide_num, bg_color, header_color, headline, questions):
    img = Image.new("RGB", (W, H), hex_to_rgb(bg_color))
    draw = ImageDraw.Draw(img)

    PAD = 72

    font_h = find_bold_font(52)
    font_q = find_font(38)

    # Header
    bbox = draw.textbbox((0, 0), headline, font=font_h)
    draw.text((PAD, PAD + 20), headline, font=font_h, fill=hex_to_rgb(header_color))

    # Divider line
    line_y = PAD + 20 + (bbox[3] - bbox[1]) + 28
    draw.rectangle([(PAD, line_y), (W - PAD, line_y + 3)], fill=hex_to_rgb(header_color))

    y = line_y + 44
    max_text_w = W - PAD * 2 - 60  # room for number prefix

    for q in questions:
        lines = wrap_text(q, font_q, max_text_w, draw)
        for i, line in enumerate(lines):
            draw.text((PAD, y), line, font=font_q, fill=hex_to_rgb(WHITE))
            y += 52
        y += 18  # gap between questions

    draw_slide_number(draw, slide_num, 6, bg_color)
    return img

def slide_5_q10():
    img = Image.new("RGB", (W, H), hex_to_rgb(DARK))
    draw = ImageDraw.Draw(img)
    PAD = 72

    font_h = find_bold_font(52)
    font_q = find_bold_font(44)
    font_note = find_font(34)

    headline = "The most important question"
    draw.text((PAD, PAD + 20), headline, font=font_h, fill=hex_to_rgb(PINK))
    bbox = draw.textbbox((0, 0), headline, font=font_h)
    line_y = PAD + 20 + (bbox[3] - bbox[1]) + 28
    draw.rectangle([(PAD, line_y), (W - PAD, line_y + 3)], fill=hex_to_rgb(PINK))

    # Q10
    q10 = "10. If you found out nursing school\nwas harder than expected, would\nyou adjust your plan or walk away?"
    y = line_y + 60
    for line in q10.split("\n"):
        draw.text((PAD, y), line, font=font_q, fill=hex_to_rgb(WHITE))
        y += 58

    # Note
    note1 = "No perfect score."
    note2 = "Said yes to most? Nursing is worth looking into."
    note3 = "Said no to a few? That's useful information too."
    y += 36
    for note in [note1, note2, note3]:
        draw.text((PAD, y), note, font=font_note, fill=hex_to_rgb(LBLUE))
        y += 46

    draw_slide_number(draw, 5, 6, DARK)
    return img

def slide_6_cta():
    img = Image.new("RGB", (W, H), hex_to_rgb(DARK))
    draw = ImageDraw.Draw(img)
    PAD = 72

    font_brand = find_bold_font(30)
    font_h = find_bold_font(52)
    font_body = find_font(34)
    font_url = find_bold_font(40)

    # Brand
    draw.text((PAD, PAD + 10), "SimpleNursing", font=font_brand, fill=hex_to_rgb(LBLUE))

    # Headline
    headline_lines = [
        "Built for clarity,",
        "not to make you",
        "feel better.",
    ]
    y = PAD + 80
    for line in headline_lines:
        draw.text((PAD, y), line, font=font_h, fill=hex_to_rgb(WHITE))
        y += 68

    # Divider
    y += 10
    draw.rectangle([(PAD, y), (W - PAD, y + 3)], fill=hex_to_rgb(PINK))
    y += 28

    # Body
    body_lines = [
        "Most nursing quizzes are too vague",
        "or too positive to help you decide.",
        "",
        "This quiz focuses on what matters:",
        "lifestyle fit, workload expectations,",
        "and the real time commitment.",
    ]
    for line in body_lines:
        if line:
            draw.text((PAD, y), line, font=font_body, fill=hex_to_rgb(WHITE))
        y += 42

    # URL
    y += 20
    draw.text((PAD, y), "simplenursing.com/quiz", font=font_url, fill=hex_to_rgb(PINK))

    draw_slide_number(draw, 6, 6, DARK)
    return img

def main():
    print("\n🎨 Generating 6-slide Instagram Carousel — pixel-perfect text\n")

    slides = [
        (slide_1_hook,        "slide_01.png", "HOOK"),
        (lambda: slide_numbered_list(2, DTEAL, LBLUE,
            "Start with the practical questions", [
                "1. Can you commit to 2-4 years of school right now?",
                "2. Are you okay working 12-hour shifts, nights and weekends?",
                "3. Does ~$75K+ average starting pay in the U.S. match your financial goals?",
            ]),                "slide_02.png", "Q1-3"),
        (lambda: slide_numbered_list(3, TEAL, YELLOW,
            "Think about the day to day", [
                "4. Can you handle being on your feet for most of a shift?",
                "5. Are you comfortable making fast decisions when things go wrong?",
                "6. Does working closely with patients during hard moments sound like something you want?",
            ]),                "slide_03.png", "Q4-6"),
        (lambda: slide_numbered_list(4, DTEAL, LBLUE,
            "Big picture questions", [
                "7. Do you want a career with dozens of specialty paths to switch between?",
                "8. Are you looking for a job in demand basically everywhere?",
                "9. Would you rather have job stability than a higher ceiling that takes longer to reach?",
            ]),                "slide_04.png", "Q7-9"),
        (slide_5_q10,         "slide_05.png", "Q10"),
        (slide_6_cta,         "slide_06.png", "CTA"),
    ]

    paths = []
    for i, entry in enumerate(slides):
        fn, filename, label = entry[0], entry[1], entry[2]
        print(f"  [{i+1}/6] {label}... ", end="", flush=True)
        img = fn()
        path = OUT / filename
        img.save(str(path), "PNG")
        paths.append(str(path))
        print(f"✅ ({path.stat().st_size // 1024}KB)")
        subprocess.Popen(["open", str(path)])

    print(f"\n✅ All 6 slides saved to {OUT}")
    for p in paths:
        print(f"  {p}")

if __name__ == "__main__":
    main()
