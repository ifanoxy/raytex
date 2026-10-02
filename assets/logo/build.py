#!/usr/bin/env python3
"""Builds the RayTeX logos from the violet manta ray (ray.json, traced from
the drawing by trace.py) and the letters "RayTeX" typeset by LaTeX
(letters.svg, from letters.tex):

- ../logo.svg: the application icon (1024x1024), the ray on a lavender tile;
- ray.svg: the ray alone (favicon, illustrations);
- logo-mark-dark.svg / logo-mark-light.svg: the wordmark (the ray, then
  "Ray" and the \\TeX logo) for dark and light backgrounds.

`python3 build.py` (after `latex letters.tex && dvisvgm --no-fonts
--exact-bbox --precision=3 letters.dvi -o letters.svg`).
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAY = json.loads((HERE / "ray.json").read_text())

# The two violets of the drawing, and brighter ones for dark backgrounds.
ON_LIGHT = ("#7e87d9", "#6d4fd8")
ON_DARK = ("#a9b0f2", "#9479f4")


def ray(colors=ON_LIGHT) -> str:
    """The ray in its 1000x1000 box."""
    light, dark = colors
    return f'<path d="{RAY["light"]}" fill="{light}" fill-rule="evenodd"/><path d="{RAY["dark"]}" fill="{dark}" fill-rule="evenodd"/>'


def ray_box():
    """Bounding box of the ray in its 1000x1000 box."""
    nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", RAY["light"])]
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


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


def letters():
    """Glyph definitions, the uses of "Ray" and of "TeX", and their box."""
    paths, uses = parse((HERE / "letters.svg").read_text())
    boxes = []
    for x, y, g in uses:
        b = bbox(paths[g])
        boxes.append((x + b[0], y + b[1], x + b[2], y + b[3]))
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    used = sorted({g for _, _, g in uses})
    defs = "\n    ".join(f'<path id="{g}" d="{paths[g]}"/>' for g in used)
    ray_part = "".join(f'<use href="#{g}" x="{x}" y="{y}"/>' for x, y, g in uses[:3])
    tex_part = "".join(f'<use href="#{g}" x="{x}" y="{y}"/>' for x, y, g in uses[3:])
    return defs, ray_part, tex_part, box


def main():
    rx0, ry0, rx1, ry1 = ray_box()
    rw, rh = rx1 - rx0, ry1 - ry0

    # The application icon: the ray on a lavender tile, like paper.
    size = 760
    s = size / max(rw, rh)
    x = 512 - rw * s / 2 - rx0 * s
    y = 512 - rh * s / 2 - ry0 * s + 10
    icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#fdfcff"/>
      <stop offset="1" stop-color="#e4e6fb"/>
    </linearGradient>
    <filter id="shade" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#4b2aa8" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="url(#tile)"/>
  <rect x="33" y="33" width="958" height="958" rx="215" fill="none" stroke="#5b36c9" stroke-opacity="0.12" stroke-width="2"/>
  <g filter="url(#shade)" transform="translate({x:.2f} {y:.2f}) scale({s:.4f})">{ray()}</g>
</svg>
"""
    (HERE.parent / "logo.svg").write_text(icon)

    # The ray alone, cropped to itself.
    (HERE / "ray.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{rx0:.1f} {ry0:.1f} {rw:.1f} {rh:.1f}" width="{rw:.0f}" height="{rh:.0f}">{ray()}</svg>\n'
    )

    # Wordmarks: the ray, then "Ray" and \TeX.
    defs, ray_letters, tex_letters, (lx0, ly0, lx1, ly1) = letters()
    lw, lh = lx1 - lx0, ly1 - ly0
    height = 100
    rs = height * 1.5 / rh
    ts = height / lh
    gap = 18
    ray_w = rw * rs
    width = ray_w + gap + lw * ts
    for name, text, accent, colors in [
        ("logo-mark-dark.svg", "#eceefc", "#a9b0f2", ON_DARK),
        ("logo-mark-light.svg", "#1d1636", "#6d4fd8", ON_LIGHT),
    ]:
        mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -16 {width + 12:.2f} {height * 1.5 + 24:.2f}" width="{(width + 12) * 2:.0f}" height="{(height * 1.5 + 24) * 2:.0f}">
  <defs>
    {defs}
  </defs>
  <g transform="scale({rs:.4f}) translate({-rx0:.1f} {-ry0:.1f})">{ray(colors)}</g>
  <g transform="translate({ray_w + gap:.2f} {height * 0.2:.2f}) scale({ts:.4f}) translate({-lx0:.2f} {-ly0:.2f})">
    <g fill="{text}">{ray_letters}</g>
    <g fill="{accent}">{tex_letters}</g>
  </g>
</svg>
"""
        (HERE / name).write_text(mark)
    print("written:", HERE.parent / "logo.svg", HERE / "ray.svg", HERE / "logo-mark-dark.svg", HERE / "logo-mark-light.svg")


if __name__ == "__main__":
    main()
