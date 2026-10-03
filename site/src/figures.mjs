// Figures in the manner of TikZ, drawn in SVG; the strokes trace themselves
// when the figure comes into view (site.js), step after step (data-step).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../assets/logo/ray.json"), "utf8"));

const f = (n) => Math.round(n * 10) / 10;
const pt = ([x, y]) => `${f(x)} ${f(y)}`;

/** The circumscribed circle of a triangle, built step by step. */
export function construction(lang) {
  const A = [70, 250];
  const B = [330, 270];
  const C = [205, 60];
  // Circumcentre.
  const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
  const sq = (p) => p[0] ** 2 + p[1] ** 2;
  const O = [
    (sq(A) * (B[1] - C[1]) + sq(B) * (C[1] - A[1]) + sq(C) * (A[1] - B[1])) / d,
    (sq(A) * (C[0] - B[0]) + sq(B) * (A[0] - C[0]) + sq(C) * (B[0] - A[0])) / d,
  ];
  const R = Math.hypot(A[0] - O[0], A[1] - O[1]);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  // Perpendicular bisector through the middle of [p q], long enough.
  const bisector = (p, q) => {
    const m = mid(p, q);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    const [ux, uy] = [-dy / len, dx / len];
    return `M${pt([m[0] - ux * 120, m[1] - uy * 120])} L${pt([m[0] + ux * 120, m[1] + uy * 120])}`;
  };
  const label = (p, text, dx, dy) => `<text class="tikz-label" x="${f(p[0] + dx)}" y="${f(p[1] + dy)}">${text}</text>`;
  const dot = (p, step) => `<circle class="tikz-dot" data-step="${step}" cx="${f(p[0])}" cy="${f(p[1])}" r="3.6"/>`;
  return `<svg class="tikz" viewBox="0 0 400 330" role="img" aria-label="${lang === "fr" ? "Construction du cercle circonscrit à un triangle" : "Construction of the circumscribed circle of a triangle"}">
  <g class="tikz-grid" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="330"/>`).join("")}${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 50 + 15}" x2="400" y2="${i * 50 + 15}"/>`).join("")}</g>
  <path class="draw ink" data-step="0" d="M${pt(A)} L${pt(B)} L${pt(C)} Z"/>
  <path class="draw ink-thin dashed" data-step="1" d="${bisector(A, B)}"/>
  <path class="draw ink-thin dashed" data-step="2" d="${bisector(B, C)}"/>
  <path class="draw ink-thin dashed" data-step="3" d="${bisector(C, A)}"/>
  <circle class="draw ink-violet" data-step="4" cx="${f(O[0])}" cy="${f(O[1])}" r="${f(R)}"/>
  ${dot(A, 0)}${dot(B, 0)}${dot(C, 0)}${dot(O, 4)}
  <g class="tikz-labels">${label(A, "A", -18, 14)}${label(B, "B", 8, 14)}${label(C, "C", -4, -12)}${label(O, "O", 8, -6)}</g>
</svg>`;
}

/** The heat equation in one dimension: the temperature spreads with time. */
export function heatPlot(lang) {
  const W = 400;
  const H = 260;
  const x0 = 200;
  const y0 = 220;
  const sx = 34;
  const sy = 160;
  const curve = (t) => {
    const pts = [];
    for (let x = -5.5; x <= 5.5; x += 0.1) {
      const u = Math.exp(-(x * x) / (4 * t)) / Math.sqrt(4 * Math.PI * t);
      pts.push([x0 + x * sx, y0 - u * sy * 2.6]);
    }
    return "M" + pts.map(pt).join(" L");
  };
  const ticks = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]
    .map((x) => `<line x1="${x0 + x * sx}" y1="${y0 - 3}" x2="${x0 + x * sx}" y2="${y0 + 3}"/>`)
    .join("");
  return `<svg class="tikz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${lang === "fr" ? "Solution de l'équation de la chaleur à trois instants" : "Solution of the heat equation at three times"}">
  <g class="tikz-axes"><path class="draw ink-thin" data-step="0" d="M14 ${y0} L${W - 10} ${y0} M${W - 18} ${y0 - 5} L${W - 10} ${y0} L${W - 18} ${y0 + 5}"/><path class="draw ink-thin" data-step="0" d="M${x0} ${H - 14} L${x0} 12 M${x0 - 5} 20 L${x0} 12 L${x0 + 5} 20"/>${ticks}</g>
  <path class="draw ink-violet" data-step="1" d="${curve(0.5)}"/>
  <path class="draw ink" data-step="2" d="${curve(1.5)}"/>
  <path class="draw ink-red" data-step="3" d="${curve(4)}"/>
  <text class="tikz-label" x="${W - 22}" y="${y0 + 22}">x</text>
  <text class="tikz-label" x="${x0 + 10}" y="22">u</text>
  <text class="tikz-hand violet" x="${x0 + 44}" y="52">t = 0,5</text>
  <text class="tikz-hand" x="${x0 + 92}" y="140">t = 1,5</text>
  <text class="tikz-hand red" x="${x0 + 122}" y="196">t = 4</text>
</svg>`;
}

/** A wing as a cubic Bezier curve: its control points, then the curve. */
export function bezier(lang) {
  const P = [
    [40, 200],
    [110, 40],
    [290, 30],
    [360, 170],
  ];
  const label = (p, i, dx, dy) => `<text class="tikz-label" x="${p[0] + dx}" y="${p[1] + dy}">P<tspan baseline-shift="sub" font-size="70%">${i}</tspan></text>`;
  return `<svg class="tikz" viewBox="0 0 400 240" role="img" aria-label="${lang === "fr" ? "Une courbe de Bézier cubique et ses points de contrôle" : "A cubic Bézier curve and its control points"}">
  <path class="draw ink-thin dashed" data-step="0" d="M${P.map(pt).join(" L")}"/>
  ${P.map((p, i) => `<circle class="tikz-dot hollow" data-step="0" cx="${p[0]}" cy="${p[1]}" r="4.5"/>`).join("")}
  <path class="draw ink-violet thick" data-step="1" d="M${pt(P[0])} C${pt(P[1])} ${pt(P[2])} ${pt(P[3])}"/>
  ${label(P[0], 0, -26, 6)}${label(P[1], 1, -8, -12)}${label(P[2], 2, 4, -12)}${label(P[3], 3, 10, 6)}
</svg>`;
}

/** The ray of the logo, sketched (its outline) then inked. */
export function ray(cls = "") {
  return `<svg class="ray-sketch ${cls}" viewBox="0 0 1000 1000" aria-hidden="true">
  <path class="ray-light" d="${RAY.light}" fill-rule="evenodd"/>
  <path class="ray-dark" d="${RAY.dark}" fill-rule="evenodd"/>
</svg>`;
}

/** The drawing of the opening of the site (site.js plays it): first the
 *  construction (grid, axis of symmetry, compass circles, the kite that
 *  holds the ray, the guides to the wing tips and their angle, a Bézier
 *  curve on each wing, the tail, the dimensions), then two pencil passes
 *  over the outline (the sketch), then the ray in ink. */
export function introDrawing(lang) {
  const fr = lang === "fr";
  const grid = Array.from({ length: 11 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="1000"/><line x1="0" y1="${i * 100}" x2="1000" y2="${i * 100}"/>`).join("");
  // A stroke that traces itself: its delay and duration after the page is up.
  const line = (d, delay, dur = 0.6, cls = "thin") => `<path class="intro-stroke ${cls}" style="--delay: ${delay}s; --dur: ${dur}s" d="${d}"/>`;
  const circle = (cx, cy, r, delay, dur = 0.7, cls = "thin") => `<circle class="intro-stroke ${cls}" style="--delay: ${delay}s; --dur: ${dur}s" cx="${cx}" cy="${cy}" r="${r}"/>`;
  const dashed = (d, delay) => `<path class="intro-stroke thin dashed" style="--delay: ${delay}s" d="${d}"/>`;
  let k = 0;
  const dot = ([x, y], hollow = false) => `<circle class="intro-dot${hollow ? " hollow" : ""}" style="--k: ${k++}" cx="${x}" cy="${y}" r="${hollow ? 9 : 7}"/>`;
  let j = 0;
  const label = (x, y, text, cls = "intro-label") => `<text class="${cls}" style="--k: ${j++}" x="${x}" y="${y}">${text}</text>`;
  const sub = (name, i) => `${name}<tspan baseline-shift="sub" font-size="65%">${i}</tspan>`;

  // The right wing as a Bézier curve, and its mirror.
  const P = [
    [520, 330],
    [690, 170],
    [905, 250],
    [975, 560],
  ];
  const Q = P.map(([x, y]) => [1000 - x, y]);
  const poly = (pts) => `M${pts.map((p) => p.join(" ")).join(" L")}`;
  const bez = (pts) => `M${pts[0].join(" ")} C${pts[1].join(" ")} ${pts[2].join(" ")} ${pts[3].join(" ")}`;
  const head = [500, 60];
  const tail = [505, 948];
  const tipR = [990, 590];
  const tipL = [10, 590];
  // The angle of the wing guide with the horizontal axis.
  const theta = Math.atan2(tipR[1] - 500, tipR[0] - 500);
  const arc = (r) => `M${500 + r} 500 A${r} ${r} 0 0 1 ${(500 + r * Math.cos(theta)).toFixed(1)} ${(500 + r * Math.sin(theta)).toFixed(1)}`;
  const deg = Math.round((theta * 180) / Math.PI);

  return `<svg class="intro-geo" viewBox="-40 -60 1100 1100" aria-hidden="true">
  <g class="intro-grid">${grid}</g>
  ${circle(500, 500, 480, 0, 1.1)}
  ${line("M-20 500 H1020", 0.15, 0.5)}
  ${line("M500 -30 V1030", 0.2, 0.5, "thin axis")}
  ${line(`M${head.join(" ")} L${tipR.join(" ")} L${tail.join(" ")} L${tipL.join(" ")} Z`, 0.35, 0.9)}
  ${line(`M500 500 L${tipR.join(" ")} M500 500 L${tipL.join(" ")}`, 0.55, 0.45)}
  ${circle(500, 500, 165, 0.6, 0.6)}
  ${circle(438, 150, 46, 0.8, 0.4)}
  ${circle(562, 150, 46, 0.85, 0.4)}
  ${line(arc(120), 1.15, 0.35, "thin violet")}
  ${line("M10 -22 H990 M10 -34 V-10 M990 -34 V-10 M10 -22 l16 -7 M10 -22 l16 7 M990 -22 l-16 -7 M990 -22 l-16 7", 0.7, 0.6)}
  ${line("M1035 54 V946 M1023 54 H1047 M1023 946 H1047 M1035 54 l-7 16 M1035 54 l7 16 M1035 946 l-7 -16 M1035 946 l7 -16", 0.8, 0.6)}
  ${dashed(poly(P), 0.9)}
  ${dashed(poly(Q), 0.95)}
  ${line(bez(P), 1.0, 0.7, "red")}
  ${line(bez(Q), 1.05, 0.7, "red")}
  ${line("M500 640 C 545 720, 455 830, 505 945", 1.1, 0.6, "red")}
  ${[...P, ...Q].map((p) => dot(p, true)).join("")}
  ${[head, tipR, tail, tipL, [500, 500]].map((p) => dot(p)).join("")}
  <g class="intro-labels">
    ${label(P[0][0] - 58, P[0][1] + 10, sub("P", 0))}${label(P[1][0] - 20, P[1][1] - 26, sub("P", 1))}${label(P[2][0] + 10, P[2][1] - 24, sub("P", 2))}${label(P[3][0] + 22, P[3][1] + 10, sub("P", 3))}
    ${label(512, 545, "O")}${label(tipR[0] - 10, tipR[1] + 50, "A")}${label(tipL[0] - 10, tipL[1] + 50, "A′")}${label(head[0] + 14, head[1] - 10, "S")}${label(tail[0] + 16, tail[1] + 6, "T")}
    ${label(30, 70, "r = 480", "intro-hand")}
    ${label(420, -40, fr ? "envergure 980" : "span 980", "intro-hand")}
    ${label(1058, 520, "h", "intro-hand")}
    ${label(515, 1028, fr ? "axe de symétrie" : "axis of symmetry", "intro-hand")}
    ${label(700, 690, fr ? "C¹ partout" : "C¹ everywhere", "intro-hand red")}
    ${label(645, 556, `θ ≈ ${deg}°`, "intro-hand violet")}
  </g>
  <g class="intro-pencil"><path d="${RAY.light}" fill-rule="evenodd"/><path d="${RAY.dark}" fill-rule="evenodd"/></g>
  <g class="intro-pencil second" transform="translate(4 -3) rotate(0.5 500 500)"><path d="${RAY.light}" fill-rule="evenodd"/></g>
  <g class="intro-ray">
    <path class="ray-light" d="${RAY.light}" fill-rule="evenodd"/>
    <path class="ray-dark" d="${RAY.dark}" fill-rule="evenodd"/>
  </g>
</svg>`;
}
