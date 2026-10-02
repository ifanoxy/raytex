#!/usr/bin/env python3
"""Traces the photo of the new RayTeX logo (a violet manta ray) into SVG:
one shape for the light lavender, one for the deep violet strokes.

Upscaled and smoothed fields, contours by contourpy (marching squares),
small specks dropped, rings smoothed, simplified (Ramer-Douglas-Peucker) and
written as cubic Bezier curves (Catmull-Rom)."""

import json
import sys
from pathlib import Path

import contourpy
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "drawing.png"
UP = 4  # upscale


def field(img: np.ndarray) -> np.ndarray:
    r, g, b = (img[..., i].astype(float) for i in range(3))
    return b - g  # violetness


def rings_of(z: np.ndarray, level: float, min_area: float):
    gen = contourpy.contour_generator(z=z, fill_type=contourpy.FillType.OuterCode)
    points, codes = gen.filled(level, np.inf)
    shapes = []
    for pts, cds in zip(points, codes):
        starts = np.where(cds == 1)[0]
        rings = [pts[s:e] for s, e in zip(starts, list(starts[1:]) + [len(pts)])]
        outer = rings[0]
        if abs(area(outer)) < min_area:
            continue
        shapes.append([r for r in rings if abs(area(r)) >= min_area / 6])
    return shapes


def area(ring):
    x, y = ring[:, 0], ring[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def smooth(ring: np.ndarray, sigma: float) -> np.ndarray:
    ring = ring[:-1] if np.allclose(ring[0], ring[-1]) else ring
    return np.stack([ndimage.gaussian_filter1d(ring[:, i], sigma, mode="wrap") for i in range(2)], axis=1)


def rdp(points: np.ndarray, eps: float) -> np.ndarray:
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    ab = b - a
    n = np.hypot(*ab) or 1e-9
    d = np.abs(ab[0] * (points[:, 1] - a[1]) - ab[1] * (points[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        left = rdp(points[: i + 1], eps)
        right = rdp(points[i:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


def simplify_closed(ring: np.ndarray, eps: float) -> np.ndarray:
    # split at the farthest point from the first to keep a closed ring
    far = int(np.argmax(np.hypot(*(ring - ring[0]).T)))
    a = rdp(ring[: far + 1], eps)
    b = rdp(np.vstack([ring[far:], ring[:1]]), eps)
    return np.vstack([a[:-1], b[:-1]])


def bezier_path(ring: np.ndarray, fmt) -> str:
    """Closed Catmull-Rom spline through the points, as cubic Beziers."""
    n = len(ring)
    out = [f"M{fmt(ring[0])}"]
    for i in range(n):
        p0, p1, p2, p3 = ring[(i - 1) % n], ring[i], ring[(i + 1) % n], ring[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        out.append(f"C{fmt(c1)} {fmt(c2)} {fmt(p2)}")
    return "".join(out) + "Z"


def main():
    img = np.asarray(Image.open(SRC).convert("RGB"))
    z = field(img)
    z = ndimage.zoom(z, UP, order=1)
    z = ndimage.gaussian_filter(z, 2.8)
    layers = {"light": (40, 900), "dark": (108, 260)}
    shapes = {name: rings_of(z, level, min_area) for name, (level, min_area) in layers.items()}
    allpts = np.vstack([r for s in shapes["light"] for r in s])
    x0, y0 = allpts.min(axis=0)
    x1, y1 = allpts.max(axis=0)
    scale = 1000 / max(x1 - x0, y1 - y0)
    ox = (1000 - (x1 - x0) * scale) / 2
    oy = (1000 - (y1 - y0) * scale) / 2

    def fmt(p):
        return f"{(p[0] - x0) * scale + ox:.1f},{(p[1] - y0) * scale + oy:.1f}"

    out = {}
    for name, ss in shapes.items():
        parts = []
        for s in ss:
            for ring in s:
                r = smooth(ring, 2.6)
                r = simplify_closed(r, 1.1)
                if len(r) >= 3:
                    parts.append(bezier_path(r, fmt))
        out[name] = "".join(parts)
        print(name, len(ss), "shapes,", sum(len(s) for s in ss), "rings,", len(out[name]), "chars")
    (HERE / "ray.json").write_text(json.dumps(out))
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <path d="{out['light']}" fill="#b7a2f5" fill-rule="evenodd"/>
  <path d="{out['dark']}" fill="#7e4ff0" fill-rule="evenodd"/>
</svg>
"""
    (HERE / "ray-traced.svg").write_text(svg)  # to look at the trace alone


if __name__ == "__main__":
    main()
