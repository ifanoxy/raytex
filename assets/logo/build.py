#!/usr/bin/env python3
"""Builds the RayTeX logos: a manta ray (the "Ray") gliding with the \\TeX
logo (the "TeX").

1. `latex letters.tex && dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg`
   (T, lowered E and X in bold Latin Modern, like the \\TeX command);
2. `python3 build.py letters.svg` writes ../logo.svg (app icon: the ray above
   the letters on the night background), logo-mark-dark.svg and
   logo-mark-light.svg (wordmarks: the ray, then the letters).
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The ray seen from above, in a 1000-wide box (centre line x = 500):
# cephalic fins in front, pointed wings swept back, thin tail.
RAY_BODY = (
    "M500 172"
    " C484 172 466 170 452 166"  # the wide mouth, between the cephalic fins
    " C458 140 456 112 444 92"  # left fin, inner edge
    " C428 92 412 128 408 186"  # its outer edge, back to the head
    " C300 140 120 206 30 330"  # leading edge of the left wing
    " C170 348 330 380 424 430"  # trailing edge
    " C444 456 470 484 490 494"  # to the base of the tail
    " L510 494"
    " C530 484 556 456 576 430"
    " C670 380 830 348 970 330"
    " C880 206 700 140 592 186"
    " C588 128 572 92 556 92"
    " C544 112 542 140 548 166"
    " C534 170 516 172 500 172 Z"
)
RAY_TAIL = "M493 488 C492 560 498 610 486 660 C505 610 509 560 507 488 Z"
# A ridge along the back, for depth.
RAY_RIDGE = "M500 196 C494 270 494 360 500 462 C506 360 506 270 500 196 Z"
RAY_BOX = (30, 92, 970, 660)


def parse(svg: str):
    paths = dict(re.findall(r"<path id='([^']+)' d='([^']+)'", svg))
    uses = [(float(x), float(y), g) for x, y, g in re.findall(r"<use x='([^']+)' y='([^']+)' xlink:href='#([^']+)'", svg)]
    return paths, uses


def bbox(d: str):
    toks = re.findall(r"[A-Za-z]|-?\d*\.?\d+", d)
    x = y = 0.0
    xs, ys = [], []
    cmd = None
    i = 0
    nargs = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "Q": 4, "S": 4, "T": 2, "Z": 0}
    while i < len(toks):
        if re.match(r"[A-Za-z]", toks[i]):
            cmd = toks[i]
            i += 1
        if cmd in "Zz":
            continue
        n = nargs[cmd.upper()]
        vals = [float(v) for v in toks[i : i + n]]
        i += n
        rel = cmd.islower()
        if cmd.upper() == "H":
            x = x + vals[0] if rel else vals[0]
        elif cmd.upper() == "V":
            y = y + vals[0] if rel else vals[0]
        else:
            pts = [(vals[k], vals[k + 1]) for k in range(0, n, 2)]
            for px, py in pts:
                xs.append(x + px if rel else px)
                ys.append(y + py if rel else py)
            lx, ly = pts[-1]
            x, y = (x + lx, y + ly) if rel else (lx, ly)
            if cmd == "M":
                cmd = "L"
            elif cmd == "m":
                cmd = "l"
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def defs(dark: bool) -> str:
    """Night background; the ray in amber light (brighter on the dark side)."""
    centre, edge = ("#fff1cf", "#ffa53a") if dark else ("#ffc766", "#e07b00")
    return f"""<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26335f"/>
      <stop offset="1" stop-color="#111831"/>
    </linearGradient>
    <radialGradient id="ray" gradientUnits="userSpaceOnUse" cx="500" cy="300" r="480">
      <stop offset="0" stop-color="{centre}"/>
      <stop offset="0.45" stop-color="#ffcf6e"/>
      <stop offset="1" stop-color="{edge}"/>
    </radialGradient>
    <linearGradient id="tail" gradientUnits="userSpaceOnUse" x1="0" y1="494" x2="0" y2="770">
      <stop offset="0" stop-color="#ffcf6e"/>
      <stop offset="1" stop-color="{edge}" stop-opacity="0.15"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-30%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000" flood-opacity="0.35"/>
    </filter>"""


def ray(glow: bool) -> str:
    """The ray in its 1000-wide box (with a halo on dark backgrounds)."""
    halo = f'<path d="{RAY_BODY}" fill="#ffb347" opacity="0.45" filter="url(#glow)"/>' if glow else ""
    return f"""{halo}
    <path d="{RAY_TAIL}" fill="url(#tail)"/>
    <path d="{RAY_BODY}" fill="url(#ray)"/>
    <path d="{RAY_RIDGE}" fill="#ffffff" opacity="0.28"/>
"""


def letters(svg: str):
    """Glyph definitions, the letters, and their box."""
    paths, uses = parse(svg)
    boxes = []
    for x, y, g in uses:
        b = bbox(paths[g])
        boxes.append((x + b[0], y + b[1], x + b[2], y + b[3]))
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    used = sorted({g for _, _, g in uses})
    glyph_defs = "\n    ".join(f'<path id="{g}" d="{paths[g]}"/>' for g in used)
    body = "\n    ".join(f'<use href="#{g}" x="{x}" y="{y}"/>' for x, y, g in uses)
    return glyph_defs, body, box


def main():
    glyph_defs, body, (lx0, ly0, lx1, ly1) = letters(Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "letters.svg").read_text())
    lw, lh = lx1 - lx0, ly1 - ly0
    rx0, ry0, rx1, ry1 = RAY_BOX
    rw, rh = rx1 - rx0, ry1 - ry0

    def text(color: str, scale: float, x: float, y: float) -> str:
        return f"""<g filter="url(#shadow)" transform="translate({x:.2f} {y:.2f}) scale({scale:.4f}) translate({-lx0:.2f} {-ly0:.2f})">
    <g fill="{color}" stroke="{color}" stroke-width="1.2" stroke-linejoin="round">
    {body}
    </g>
  </g>"""

    # App icon, 1024×1024: the ray gliding above the letters, the whole
    # centred in the square.
    ray_w = 720
    rs = ray_w / rw
    text_w = 520
    ts = text_w / lw
    gap = 36
    total = rh * rs + gap + lh * ts
    ray_x = 512 - ray_w / 2
    ray_y = 512 - total / 2
    text_x = 512 - text_w / 2
    text_y = ray_y + rh * rs + gap
    icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    {defs(True)}
    {glyph_defs}
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="url(#bg)"/>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="4"/>
  <g transform="translate({ray_x:.2f} {ray_y:.2f}) scale({rs:.4f}) translate({-rx0} {-ry0})">
    {ray(True)}
  </g>
  {text("#f6ead3", ts, text_x, text_y)}
</svg>
"""
    (HERE.parent / "logo.svg").write_text(icon)

    # Wordmarks, transparent: the ray, then the letters, on one line.
    height = 100
    rs2 = height * 1.25 / rh
    ts2 = height / lh
    gap = 14
    ray_w2 = rw * rs2
    width = ray_w2 + gap + lw * ts2
    for name, color, dark in [("logo-mark-dark.svg", "#f6ead3", True), ("logo-mark-light.svg", "#1d2233", False)]:
        mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -22 {width + 16:.2f} {height * 1.25 + 30:.2f}" width="{(width + 16) * 2:.0f}" height="{(height * 1.25 + 30) * 2:.0f}">
  <defs>
    {defs(dark)}
    {glyph_defs}
  </defs>
  <g transform="scale({rs2:.4f}) translate({-rx0} {-ry0})">
    {ray(False)}
  </g>
  {text(color, ts2, ray_w2 + gap, height * 0.18)}
</svg>
"""
        (HERE / name).write_text(mark)
    print("written:", HERE.parent / "logo.svg", HERE / "logo-mark-dark.svg", HERE / "logo-mark-light.svg")


if __name__ == "__main__":
    main()
