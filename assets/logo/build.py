#!/usr/bin/env python3
"""Builds the RayTeX logos from letters typeset by LaTeX.

1. `latex letters.tex && dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg`
   (R, raised small caps AY, T, lowered E and X in Latin Modern, in the
   style of the \\LaTeX command);
2. `python3 build.py letters.svg` writes ../logo.svg (app icon),
   logo-mark-dark.svg and logo-mark-light.svg (transparent wordmarks),
   replacing the X by two crossed rays of light with a flare where they meet.
"""

import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


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


def ray(cx: float, cy: float, length: float, angle: float, glow: bool) -> str:
    """A ray of light centred at (cx, cy); geometry defined for length 800."""
    s = length / 800
    halo = '<path d="M-420 0 Q 0 -120 420 0 Q 0 120 -420 0 Z" fill="url(#beam)" filter="url(#blur)" opacity="0.8"/>' if glow else ""
    core = '<path d="M-330 0 Q 0 -22 330 0 Q 0 22 -330 0 Z" fill="url(#core)"/>' if glow else ""
    return f"""<g transform="translate({cx:.2f} {cy:.2f}) rotate({angle:.1f}) scale({s:.4f})">
    {halo}
    <path d="M-400 0 Q 0 -64 400 0 Q 0 64 -400 0 Z" fill="url(#beam)"/>
    {core}
  </g>"""


def flare(cx: float, cy: float, length: float, glow: bool) -> str:
    """The spark where the rays cross: a glow and a small four-pointed star."""
    r = length * 0.2
    star = length * 0.26
    w = length * 0.03
    return f"""<g transform="translate({cx:.2f} {cy:.2f})">
    {f'<circle r="{r:.2f}" fill="url(#spark)"/>' if glow else ""}
    <path d="M{-star:.2f} 0 Q 0 {-w:.2f} {star:.2f} 0 Q 0 {w:.2f} {-star:.2f} 0 Z" fill="url(#star)"/>
    <path d="M0 {-star:.2f} Q {-w:.2f} 0 0 {star:.2f} Q {w:.2f} 0 0 {-star:.2f} Z" fill="url(#star)"/>
  </g>"""


def defs(dark: bool) -> str:
    """Gradients: bright light on the night background, amber on a light one."""
    if dark:
        edge, mid, centre, star = "#ffae3b", "#ffcf6e", "#fff4d8", "#ffffff"
    else:
        edge, mid, centre, star = "#e07b00", "#f29a12", "#f7b733", "#f7b733"
    return f"""<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26335f"/>
      <stop offset="1" stop-color="#111831"/>
    </linearGradient>
    <linearGradient id="beam" gradientUnits="userSpaceOnUse" x1="-400" y1="0" x2="400" y2="0">
      <stop offset="0" stop-color="{edge}" stop-opacity="0"/>
      <stop offset="0.14" stop-color="{mid}" stop-opacity="0.95"/>
      <stop offset="0.5" stop-color="{centre}"/>
      <stop offset="0.86" stop-color="{mid}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="{edge}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="core" gradientUnits="userSpaceOnUse" x1="-310" y1="0" x2="310" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="spark">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.25" stop-color="#fff0c4" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="star">
      <stop offset="0" stop-color="{star}"/>
      <stop offset="1" stop-color="{mid}" stop-opacity="0.2"/>
    </radialGradient>
    <filter id="blur" x="-20%" y="-300%" width="140%" height="700%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000" flood-opacity="0.35"/>
    </filter>"""


def compose(letters_svg: str):
    paths, uses = parse(letters_svg)
    glyphs = []
    x_box = None
    for x, y, g in uses:
        b = bbox(paths[g])
        box = (x + b[0], y + b[1], x + b[2], y + b[3])
        if g.endswith("-88"):  # the X
            x_box = box
        else:
            glyphs.append((x, y, g, box))
    assert x_box, "no X glyph found"
    cx, cy = (x_box[0] + x_box[2]) / 2, (x_box[1] + x_box[3]) / 2
    w, h = x_box[2] - x_box[0], x_box[3] - x_box[1]
    angle = math.degrees(math.atan2(h, w))
    length = math.hypot(w, h) * 1.12
    minx = min(b[0] for *_, b in glyphs)
    miny = min(min(b[1] for *_, b in glyphs), x_box[1])
    maxx = x_box[2] + 2
    maxy = max(max(b[3] for *_, b in glyphs), x_box[3])
    used = {g for _, _, g, _ in glyphs}
    glyph_defs = "\n    ".join(f'<path id="{g}" d="{paths[g]}"/>' for g in sorted(used))
    letters = "\n    ".join(f'<use href="#{g}" x="{x}" y="{y}"/>' for x, y, g, _ in glyphs)
    def content(glow: bool) -> str:
        return f"""<g filter="url(#shadow)">
    <g fill="LETTERS" stroke="LETTERS" stroke-width="1.7" stroke-linejoin="round">
    {letters}
    </g>
  </g>
  {ray(cx, cy, length, angle, glow)}
  {ray(cx, cy, length, -angle, glow)}
  {flare(cx, cy, length, glow)}"""
    return glyph_defs, content, (minx, miny, maxx, maxy)


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "letters.svg").read_text()
    glyph_defs, content, (minx, miny, maxx, maxy) = compose(src)
    w, h = maxx - minx, maxy - miny

    # App icon: 1024×1024, night background.
    size = 1024
    scale = 880 / w
    tx = size / 2 - scale * (minx + maxx) / 2
    ty = size / 2 - scale * (miny + maxy) / 2 + 8
    icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <defs>
    {defs(True)}
    {glyph_defs}
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="url(#bg)"/>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="4"/>
  <g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">
  {content(True).replace("LETTERS", "#f6ead3")}
  </g>
</svg>
"""
    (HERE.parent / "logo.svg").write_text(icon)

    # Wordmarks with transparent background.
    pad = 6
    for name, color, dark in [("logo-mark-dark.svg", "#f6ead3", True), ("logo-mark-light.svg", "#1d2233", False)]:
        mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx - pad:.2f} {miny - pad:.2f} {w + 2 * pad:.2f} {h + 2 * pad:.2f}" width="{(w + 2 * pad) * 2:.0f}" height="{(h + 2 * pad) * 2:.0f}">
  <defs>
    {defs(dark)}
    {glyph_defs}
  </defs>
  {content(dark).replace("LETTERS", color)}
</svg>
"""
        (HERE / name).write_text(mark)
    print("written:", HERE.parent / "logo.svg", HERE / "logo-mark-dark.svg", HERE / "logo-mark-light.svg")


if __name__ == "__main__":
    main()
