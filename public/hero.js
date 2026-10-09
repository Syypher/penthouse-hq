// The headline number with its chart and range buttons. The number follows the pointer while it
// scrubs the chart (instantly) and returns to the total when the pointer leaves; a new total from a
// poll or a range switch rolls in digit by digit while the line morphs and the underline slides.
import { el } from "./dom.js";
import { lineChart, cumulative } from "./chart.js";
import { slotLabel, dayLabel } from "./format.js";
import { roll, underline } from "./motion.js";

const RANGES = { "1D": "past 24 hours", "1W": "past week", "1M": "past 30 days" };
const RECENT = { "1D": ["past hour", 4], "1W": ["past day", 96], "1M": ["today", 1] };

// 15-minute slots for 1D (the last 96) and 1W (all 672); days for 1M.
export function bucketsFor(activity, range, field) {
  if (range === "1M") return activity.days.map((d) => ({ n: d[field] || 0, label: dayLabel(d.date), unit: "day" }));
  const slots = range === "1D" ? activity.slots.slice(-96) : activity.slots;
  return slots.map((s) => ({ n: s[field] || 0, label: slotLabel(s.t), unit: "slot" }));
}

export function createHero(root, { label, field, format }) {
  let range = "1D";
  let chart = null;
  let activity = null;
  const key = "hero:" + label;
  const num = el("p", { class: "hero-num roll" });
  const delta = el("p", { class: "hero-delta" });
  const wrap = el("div", { class: "chart-wrap" });
  const group = el("div", { class: "ranges", role: "group", "aria-label": "Range" });
  const line = underline(group);
  const buttons = Object.keys(RANGES).map((k) =>
    el("button", {
      type: "button", "aria-pressed": String(k === range), text: k,
      onclick: () => {
        if (k === range) return;
        range = k;
        for (const b of buttons) b.setAttribute("aria-pressed", String(b.textContent === k));
        line.to(buttons[Object.keys(RANGES).indexOf(k)]);
        draw();
      },
    }),
  );
  group.append(...buttons);
  root.replaceChildren(el("p", { class: "hero-label", text: label }), num, delta, wrap, group);
  line.to(buttons[0]);
  function draw() {
    if (!activity) {
      num.classList.add("is-empty");
      roll(num, "-", key, { instant: true });
      delta.textContent = "Indexing your history";
      return;
    }
    num.classList.remove("is-empty");
    line.place(); // a hero built while its tab was hidden measured nothing
    const b = bucketsFor(activity, range, field);
    const values = cumulative(b.map((x) => x.n));
    const total = values.length ? values[values.length - 1] : 0;
    const [recentLabel, k] = RECENT[range];
    const recent = b.slice(-k).reduce((s, x) => s + x.n, 0);
    const rest = (instant) => {
      roll(num, format(total), key, { instant, enter: true });
      delta.replaceChildren(el("b", { text: "+" + format(recent) }), ` ${recentLabel} \u00b7 ${RANGES[range]}`);
    };
    const scrub = (i) => {
      if (i == null) return rest(true);
      roll(num, format(values[i]), key, { instant: true });
      delta.replaceChildren(el("b", { text: "+" + format(b[i].n) }), b[i].unit === "day" ? ` on ${b[i].label}` : ` in the 15 min from ${b[i].label}`);
    };
    if (!chart) chart = lineChart(wrap, { values, onScrub: scrub });
    else chart.update(values, scrub);
    if (!chart.scrubbing()) rest(false);
  }
  return {
    update(a) {
      activity = a;
      draw();
    },
  };
}
