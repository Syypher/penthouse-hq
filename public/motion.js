// One motion system for the Dashboard side. The easing and the three durations live in app.css as
// --ease, --t-fast, --t-mid and --t-slow; reduced motion zeroes the durations there, so every tween,
// transition and Web Animation reads 0 and lands at once. The math is pure (node:test covers it);
// the DOM helpers under it build on the same tokens: a frame tween, Web Animations with the shared
// easing, the digit roll, the FLIP glide for lists that reorder, and the underline that slides
// between tabs. Only transform, opacity and SVG d move here (plus color and width where the CSS says).

export const lerp = (a, b, t) => a + (b - a) * t;

// The y of a CSS cubic-bezier at x, solved the way a browser does it: Newton steps, then bisection.
export function cubicBezier(x1, y1, x2, y2) {
  const at = (t, p1, p2) => ((1 - 3 * p2 + 3 * p1) * t * t + (3 * p2 - 6 * p1) * t + 3 * p1) * t;
  const slope = (t, p1, p2) => 3 * (1 - 3 * p2 + 3 * p1) * t * t + 2 * (3 * p2 - 6 * p1) * t + 3 * p1;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = at(t, x1, x2) - x, s = slope(t, x1, x2);
      if (Math.abs(dx) < 1e-6) return at(t, y1, y2);
      if (Math.abs(s) < 1e-6) break;
      t -= dx / s;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      t = (lo + hi) / 2;
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
    }
    return at(t, y1, y2);
  };
}

// "cubic-bezier(.2,.8,.2,1)" (the --ease token) as a function; anything else is linear.
export function easingOf(css) {
  const m = /cubic-bezier\(([^)]*)\)/.exec(String(css || ""));
  const p = m ? m[1].split(",").map(Number) : [];
  return p.length === 4 && p.every(Number.isFinite) ? cubicBezier(p[0], p[1], p[2], p[3]) : (t) => t;
}

// A series resampled to n points by linear interpolation, so two lines can be mixed point for point.
export function resample(values, n) {
  if (!values.length) return Array(n).fill(0);
  if (values.length === 1 || n === 1) return Array(n).fill(values[values.length - 1]);
  return Array.from({ length: n }, (_, j) => {
    const p = (j * (values.length - 1)) / (n - 1), i = Math.min(values.length - 2, Math.floor(p));
    return lerp(values[i], values[i + 1], p - i);
  });
}
export const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
export const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Which characters of a formatted number change, aligned from the right so "999" -> "1,000" rolls
// every digit and grows on the left. Changed characters start from the right, 20 ms apart.
export function rollPlan(from, to) {
  const a = [...(from == null ? "" : String(from))], b = [...String(to)], shift = b.length - a.length;
  const plan = b.map((ch, j) => {
    const out = j - shift >= 0 ? a[j - shift] : "";
    return { ch, out, changed: out !== ch, delay: 0 };
  });
  let k = 0;
  for (let j = plan.length - 1; j >= 0; j--) if (plan[j].changed) plan[j].delay = 20 * k++;
  return plan;
}
export const numberOf = (s) => {
  const n = parseFloat(String(s == null ? "" : s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Where each key sat before a reorder minus where it sits now: the offset it glides from.
export function flipDeltas(before, after) {
  const out = new Map();
  for (const [k, y] of after) if (before.has(k) && before.get(k) !== y) out.set(k, before.get(k) - y);
  return out;
}

// --- browser side: everything below reads the tokens from app.css ---
const tokens = () => getComputedStyle(document.documentElement);
export const ms = (name) => parseFloat(tokens().getPropertyValue("--t-" + name)) || 0;
export const easeCss = () => tokens().getPropertyValue("--ease").trim() || "ease";
let easeFn = (t) => t, easeSrc = "";
export function ease(t) {
  const src = easeCss();
  if (src !== easeSrc) {
    easeSrc = src;
    easeFn = easingOf(src);
  }
  return easeFn(t);
}

// Calls onFrame with the eased progress every frame; a duration of 0 lands the last frame at once.
// Returns a function that stops the tween where it is.
export function tween(duration, onFrame, onDone) {
  if (!duration) {
    onFrame(1);
    if (onDone) onDone();
    return () => {};
  }
  let id = 0, t0 = null, stopped = false;
  const step = (t) => {
    if (stopped) return;
    if (t0 == null) t0 = t;
    const f = Math.min(1, (t - t0) / duration);
    onFrame(ease(f));
    if (f < 1) id = requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  id = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}

// A Web Animation with the shared easing, or null when the duration is 0 (the end state is already set).
export function animate(el, frames, duration, opts = {}) {
  if (!duration || !el.animate) return null;
  return el.animate(frames, { duration, easing: easeCss(), fill: "backwards", ...opts });
}
export const finished = (a) => (a ? a.finished.catch(() => {}) : Promise.resolve());
export const ENTER = [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }];
export const LEAVE = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }];

// The digit roll. The element shows one character per span; a changed character slides in from
// below (or above when the number fell) while the old one, drawn by ::before, slides out. The last
// text is remembered by key, so a rebuilt element still rolls from what was on screen. Nothing
// moves when the text is unchanged, when instant is set (a scrub), or when the tokens are 0.
const shown = new Map();
export function roll(el, text, key, { instant = false, enter = false } = {}) {
  const prev = shown.get(key);
  shown.set(key, text);
  if (prev === text && el.textContent === text) return;
  const d = ms("slow");
  const moving = !instant && d > 0 && prev !== text && (prev != null || enter);
  const up = prev == null || (numberOf(text) ?? 0) >= (numberOf(prev) ?? 0);
  el.classList.add("roll");
  el.replaceChildren(...rollPlan(prev, text).map((p) => {
    const s = document.createElement("span");
    const moves = moving && p.changed;
    s.className = "dg" + (moves ? (up ? " up" : " down") : "");
    s.textContent = p.ch;
    if (moves) {
      if (p.out) s.dataset.out = p.out;
      const a = animate(s, [{ transform: `translateY(${up ? "" : "-"}100%)` }, { transform: "none" }], d, { delay: p.delay });
      finished(a).then(() => {
        delete s.dataset.out;
        s.classList.remove("up", "down");
      });
    }
    return s;
  }));
}

// Measure, mutate, then glide every kept child from where it was; fresh children fade and slide in.
export function flip(list, mutate, fresh = []) {
  const before = new Map();
  for (const c of list.children) before.set(c, c.getBoundingClientRect().top);
  mutate();
  const d = ms("mid");
  if (!d) return;
  let i = 0;
  for (const c of list.children) {
    if (fresh.includes(c)) {
      animate(c, ENTER, d, { delay: 30 * Math.min(8, i++) });
      continue;
    }
    const was = before.get(c);
    const dy = was == null ? 0 : was - c.getBoundingClientRect().top;
    if (dy) animate(c, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], d);
  }
}

// A list that scrolls inside its module: while there is more below the fold, the "more" class fades
// its bottom edge (app.css). Returns the refresh to call after the list's content changes.
export function edge(box) {
  const update = () => box.classList.toggle("more", box.scrollTop + box.clientHeight < box.scrollHeight - 1);
  box.addEventListener("scroll", update, { passive: true });
  return update;
}

// One underline per group of tabs or buttons (the group is position: relative); to(btn) slides it
// under the pressed one. Place it before the first paint and it does not glide in.
export function underline(group) {
  const line = document.createElement("span");
  line.className = "ind";
  line.setAttribute("aria-hidden", "true");
  let current = null;
  const to = (btn) => {
    if (!btn) return;
    current = btn;
    line.style.width = btn.offsetWidth + "px";
    line.style.transform = `translateX(${btn.offsetLeft}px)`;
    if (!line.parentNode) group.append(line);
  };
  const place = () => to(current);
  addEventListener("resize", place);
  return { line, to, place };
}
