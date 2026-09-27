#!/usr/bin/env python3
"""Builds the labaguetex logos from letters typeset by LaTeX.

1. `latex letters.tex && dvisvgm --no-fonts --exact-bbox --precision=3 letters.dvi -o letters.svg`
   (the letters L, A, T, E, X of the \\LaTeX logo, in Latin Modern Bold, with
   the exact kerning of the \\LaTeX command);
2. `python3 build.py letters.svg` writes ../logo.svg (app icon),
   logo-mark-dark.svg and logo-mark-light.svg (transparent wordmarks),
   replacing the X by two crossed baguettes.
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


def baguette(cx: float, cy: float, length: float, angle: float, idx: int) -> str:
    """A baguette centred at (cx, cy); geometry defined for length 800."""
    s = length / 800
    return f"""<g transform="translate({cx:.2f} {cy:.2f}) rotate({angle:.1f}) scale({s:.4f})">
    <rect x="-400" y="-62" width="800" height="124" rx="62" fill="url(#crust{idx})" stroke="#7d4712" stroke-width="12"/>
    <rect x="-356" y="-51" width="712" height="40" rx="20" fill="url(#shine)"/>
    <g fill="none" stroke="#fde6b8" stroke-width="22" stroke-linecap="round">
      <path d="M-215 30 C -192 -6, -168 -24, -136 -36"/>
      <path d="M-40 30 C -17 -6, 7 -24, 39 -36"/>
      <path d="M135 30 C 158 -6, 182 -24, 214 -36"/>
    </g>
  </g>"""


DEFS = """<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26335f"/>
      <stop offset="1" stop-color="#111831"/>
    </linearGradient>
    <linearGradient id="crust0" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7d28c"/>
      <stop offset="0.55" stop-color="#e0a04a"/>
      <stop offset="1" stop-color="#b06a20"/>
    </linearGradient>
    <linearGradient id="crust1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3c878"/>
      <stop offset="0.55" stop-color="#d69038"/>
      <stop offset="1" stop-color="#a55f18"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff5de" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#fff5de" stop-opacity="0"/>
    </linearGradient>
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
    length = math.hypot(w, h) * 1.02
    minx = min(b[0] for *_, b in glyphs)
    miny = min(min(b[1] for *_, b in glyphs), x_box[1])
    maxx = x_box[2] + 2
    maxy = max(max(b[3] for *_, b in glyphs), x_box[3])
    used = {g for _, _, g, _ in glyphs}
    defs = "\n    ".join(f'<path id="{g}" d="{paths[g]}"/>' for g in sorted(used))
    letters = "\n    ".join(f'<use href="#{g}" x="{x}" y="{y}"/>' for x, y, g, _ in glyphs)
    content = f"""<g filter="url(#shadow)">
    <g fill="LETTERS" stroke="LETTERS" stroke-width="1.7" stroke-linejoin="round">
    {letters}
    </g>
  {baguette(cx, cy, length, angle, 0)}
  {baguette(cx, cy, length, -angle, 1)}
  </g>"""
    return defs, content, (minx, miny, maxx, maxy)


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
    {DEFS}
    {glyph_defs}
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="url(#bg)"/>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="4"/>
  <g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">
  {content.replace("LETTERS", "#f6ead3")}
  </g>
</svg>
"""
    (HERE.parent / "logo.svg").write_text(icon)

    # Wordmarks with transparent background.
    pad = 6
    for name, color in [("logo-mark-dark.svg", "#f6ead3"), ("logo-mark-light.svg", "#1d2233")]:
        mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx - pad:.2f} {miny - pad:.2f} {w + 2 * pad:.2f} {h + 2 * pad:.2f}" width="{(w + 2 * pad) * 2:.0f}" height="{(h + 2 * pad) * 2:.0f}">
  <defs>
    {DEFS}
    {glyph_defs}
  </defs>
  {content.replace("LETTERS", color)}
</svg>
"""
        (HERE / name).write_text(mark)
    print("written:", HERE.parent / "logo.svg", HERE / "logo-mark-dark.svg", HERE / "logo-mark-light.svg")


if __name__ == "__main__":
    main()
