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

/** The points a closed curve of the logo goes through, curve by curve. */
const anchors = (d) =>
  d
    .split(/(?=M)/)
    .filter(Boolean)
    .map((sub) => {
      const n = sub.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const pts = [[n[0], n[1]]];
      for (let i = 2; i + 5 < n.length; i += 6) pts.push([n[i + 4], n[i + 5]]);
      return pts;
    });

/** The drawing of the opening of the site (site.js plays it). Everything in
 *  it is measured on the ray of the logo, so that the construction, the
 *  sketch and the ray lie on one another: first the construction (grid, the
 *  circle that holds the ray, the axis of its body from the head to the end
 *  of the tail, the line of its wings and its angle, the kite through its
 *  four ends, its dimensions), then the sketch in pencil, which site.js
 *  makes from the outline (straight strokes) and bends into the ray in ink. */
export function introDrawing(lang) {
  const fr = lang === "fr";
  const grid = Array.from({ length: 11 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="1000"/><line x1="0" y1="${i * 100}" x2="1000" y2="${i * 100}"/>`).join("");
  // A stroke that traces itself: its delay and duration after the page is up.
  const line = (d, delay, dur = 0.6, cls = "thin") => `<path class="intro-stroke ${cls}" style="--delay: ${delay}s; --dur: ${dur}s" d="${d}"/>`;
  const circle = (cx, cy, r, delay, dur = 0.7, cls = "thin") => `<circle class="intro-stroke ${cls}" style="--delay: ${delay}s; --dur: ${dur}s" cx="${cx}" cy="${cy}" r="${r}"/>`;
  let k = 0;
  const dot = ([x, y]) => `<circle class="intro-dot" style="--k: ${k++}" cx="${f(x)}" cy="${f(y)}" r="7"/>`;
  let j = 0;
  const label = (x, y, text, cls = "intro-label") => `<text class="${cls}" style="--k: ${j++}" x="${f(x)}" y="${f(y)}">${text}</text>`;

  // The four ends of the ray: its head, the end of its tail, the tips of its wings.
  const all = [...anchors(RAY.light), ...anchors(RAY.dark)].flat();
  const most = (of) => all.reduce((m, q) => (of(q) > of(m) ? q : m));
  const head = most((q) => -q[1]);
  const tail = most((q) => q[1]);
  const tipR = most((q) => q[0]);
  const tipL = most((q) => -q[0]);
  // The circle that holds it.
  const centre = [(tipL[0] + tipR[0]) / 2, (head[1] + tail[1]) / 2];
  const radius = Math.ceil(Math.max(...all.map((q) => Math.hypot(q[0] - centre[0], q[1] - centre[1]))));
  // Where the axis of the body crosses the line of the wings.
  const [ax, ay] = [tail[0] - head[0], tail[1] - head[1]];
  const [wx, wy] = [tipR[0] - tipL[0], tipR[1] - tipL[1]];
  const u = ((tipL[0] - head[0]) * wy - (tipL[1] - head[1]) * wx) / (ax * wy - ay * wx);
  const O = [head[0] + u * ax, head[1] + u * ay];
  const along = (from, [dx, dy], t) => [from[0] + dx * t, from[1] + dy * t];
  const axis = `M${pt(along(head, [ax, ay], -0.07))} L${pt(along(head, [ax, ay], 1.07))}`;
  // The angle of the wings with the horizontal.
  const theta = Math.atan2(wy, wx);
  const arc = (r) => `M${f(O[0] + r)} ${f(O[1])} A${r} ${r} 0 0 1 ${f(O[0] + r * Math.cos(theta))} ${f(O[1] + r * Math.sin(theta))}`;
  const deg = Math.round((theta * 180) / Math.PI);
  const span = Math.round(tipR[0] - tipL[0]);
  const top = f(centre[1] - radius - 36);
  const right = f(centre[0] + radius + 44);
  const [x0, x1, y0, y1] = [f(tipL[0]), f(tipR[0]), f(head[1]), f(tail[1])];

  return `<svg class="intro-geo" viewBox="-70 -110 1200 1200" aria-hidden="true">
  <g class="intro-grid">${grid}</g>
  ${circle(f(centre[0]), f(centre[1]), radius, 0, 1.1)}
  ${line(axis, 0.2, 0.5, "thin axis")}
  ${line(`M${pt(O)} H${f(O[0] + 300)}`, 0.3, 0.3)}
  ${line(`M${pt(tipL)} L${pt(tipR)}`, 0.35, 0.5)}
  ${line(`M${pt(head)} L${pt(tipR)} L${pt(tail)} L${pt(tipL)} Z`, 0.5, 0.9)}
  ${line(arc(200), 0.95, 0.35, "thin violet")}
  ${line(`M${x0} ${top} H${x1} M${x0} ${top - 12} V${top + 12} M${x1} ${top - 12} V${top + 12} M${x0} ${top} l16 -7 M${x0} ${top} l16 7 M${x1} ${top} l-16 -7 M${x1} ${top} l-16 7`, 0.7, 0.6)}
  ${line(`M${right} ${y0} V${y1} M${right - 12} ${y0} H${right + 12} M${right - 12} ${y1} H${right + 12} M${right} ${y0} l-7 16 M${right} ${y0} l7 16 M${right} ${y1} l-7 -16 M${right} ${y1} l7 -16`, 0.8, 0.6)}
  ${[head, tipR, tail, tipL, O].map((q) => dot(q)).join("")}
  <g class="intro-labels">
    ${label(O[0] - 52, O[1] + 46, "O")}${label(tipR[0] - 2, tipR[1] + 54, "A")}${label(tipL[0] - 44, tipL[1] - 22, "A′")}${label(head[0] + 22, head[1] - 4, "S")}${label(tail[0] + 20, tail[1] + 30, "T")}
    ${label(centre[0] - radius * 0.72, centre[1] - radius * 0.78, `r = ${radius}`, "intro-hand")}
    ${label(centre[0] - 110, top - 20, fr ? `envergure ${span}` : `span ${span}`, "intro-hand")}
    ${label(right + 16, centre[1] + 14, "h", "intro-hand")}
    ${label(tail[0] + 60, tail[1] + 74, fr ? "axe du corps" : "axis of the body", "intro-hand")}
    ${label(O[0] + 222, O[1] + 84, `θ ≈ ${deg}°`, "intro-hand violet")}
  </g>
  <g class="intro-pencil"><path data-sketch="0"/><path data-sketch="1"/></g>
  <g class="intro-pencil second" transform="translate(4 -3) rotate(0.5 500 500)"><path data-sketch="0"/></g>
  <g class="intro-ray">
    <path class="ray-light" d="${RAY.light}" fill-rule="evenodd"/>
    <path class="ray-dark" d="${RAY.dark}" fill-rule="evenodd"/>
  </g>
</svg>`;
}
