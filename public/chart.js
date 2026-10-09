// A Robinhood-style line: one stroke, no axes, a dotted line at the starting value, and a scrubber
// that reports the point under the pointer so the headline number can follow it. The line draws in
// once; after that a new series morphs into place (both resampled to one point count, mixed frame
// by frame) unless the owner is scrubbing, when it lands at once.
import { el, svg } from "./dom.js";
import { resample, mix, lerp, same, tween, ms } from "./motion.js";

const PAD = 8;
const DRAW = 700; // the one-time reveal, longer than the tokens on purpose; skipped when they are 0
function scaleOf(values, h) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return (v) => (max === min ? h / 2 : PAD + (1 - (v - min) / span) * (h - 2 * PAD));
}
export function pathFor(values, w, h) {
  if (!values || !values.length) return "";
  const y = scaleOf(values, h);
  const x = (i) => (values.length === 1 ? w / 2 : (i * w) / (values.length - 1));
  return values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
}
// A path through y values spread evenly across the width: one frame of a morph.
export const pathFromYs = (ys, w) => ys.map((y, i) => `${i ? "L" : "M"}${((i * w) / (ys.length - 1)).toFixed(2)},${y.toFixed(2)}`).join("");
export const yOf = (values, h, v) => (values.length ? scaleOf(values, h)(v) : h / 2);
export const sparkPath = (values, w, h) => pathFor(values || [], w, h);
export const cumulative = (a) => {
  let s = 0;
  return a.map((v) => (s += v));
};
export const nearestIndex = (px, width, n) => Math.max(0, Math.min(n - 1, Math.round((px / Math.max(1, width)) * (n - 1))));

export function lineChart(root, { values, onScrub = null, animate = true }) {
  const W = 1000, H = 200; // viewBox units; the SVG stretches to the box, the stroke does not
  let vals = values, cb = onScrub, active = false, stop = null, shownYs = null, shownBase = H / 2;
  const clipId = "clip" + Math.random().toString(36).slice(2);
  const reveal = svg("rect", { x: "-10", y: "-10", width: "0", height: String(H + 20) });
  const base = svg("line", { class: "base", x1: "0", x2: String(W) });
  const line = svg("path", { "clip-path": `url(#${clipId})` });
  const box = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" }, svg("defs", {}, svg("clipPath", { id: clipId }, reveal)), base, line);
  const hair = el("div", { class: "hair", hidden: true });
  const knob = el("div", { class: "knob", hidden: true });
  root.replaceChildren(box, hair, knob);
  function setBase(y) {
    base.setAttribute("y1", String(y));
    base.setAttribute("y2", String(y));
  }
  function draw() {
    line.setAttribute("d", pathFor(vals, W, H));
    shownYs = vals.length ? vals.map(scaleOf(vals, H)) : null;
    shownBase = yOf(vals, H, vals.length ? vals[0] : 0);
    setBase(shownBase);
  }
  // From the line as it is on screen (mid-morph included) to the new series.
  function morph(to) {
    const n = Math.max(shownYs.length, to.length);
    const a = resample(shownYs, n), b = resample(to.map(scaleOf(to, H)), n);
    const b0 = shownBase, b1 = yOf(to, H, to[0]);
    stop = tween(ms("slow"), (f) => {
      shownYs = mix(a, b, f);
      shownBase = lerp(b0, b1, f);
      line.setAttribute("d", pathFromYs(shownYs, W));
      setBase(shownBase);
    }, () => {
      stop = null;
      draw();
    });
  }
  draw();
  if (animate && ms("slow") > 0) {
    const t0 = performance.now();
    const step = (t) => {
      const f = Math.min(1, Math.max(0, (t - t0) / DRAW)); // a frame's timestamp can precede t0
      reveal.setAttribute("width", String((W + 20) * (1 - Math.pow(1 - f, 3))));
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else reveal.setAttribute("width", String(W + 20));
  function move(e) {
    if (!vals.length || !cb) return;
    const r = root.getBoundingClientRect();
    const i = nearestIndex(e.clientX - r.left, r.width, vals.length);
    const x = vals.length === 1 ? r.width / 2 : (i / (vals.length - 1)) * r.width;
    hair.style.left = x + "px";
    knob.style.left = x + "px";
    knob.style.top = (yOf(vals, H, vals[i]) / H) * r.height + "px";
    hair.hidden = knob.hidden = false;
    active = true;
    cb(i);
  }
  function leave() {
    hair.hidden = knob.hidden = true;
    active = false;
    if (cb) cb(null);
  }
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerdown", move);
  root.addEventListener("pointerleave", leave);
  root.addEventListener("pointercancel", leave);
  return {
    update(v, scrub) {
      if (scrub) cb = scrub;
      if (same(v, vals)) return; // an unchanged poll moves nothing
      const canMorph = !active && shownYs && shownYs.length > 1 && v.length > 1;
      vals = v;
      if (stop) stop();
      if (canMorph) morph(v);
      else draw();
    },
    scrubbing: () => active,
    destroy() {
      if (stop) stop();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointercancel", leave);
      root.replaceChildren();
    },
  };
}
