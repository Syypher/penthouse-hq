// The Financials card on the Dashboard: spend as one big number and its line, then the original usage
// dashboard's panels on the same twelve columns, restyled. Same /api/stats math. The hero is built once so a
// scrub survives the 3 s refresh; the panels are rebuilt, their headline numbers roll from what was on
// screen when they change, and a list that was scrolled stays where it was.
import { el } from "./dom.js";
import { usd, tokens, count } from "./format.js";
import { createHero } from "./hero.js";
import { roll, edge } from "./motion.js";
import { shown, streaming } from "./streamer.js";

const COLORS = ["var(--accent)", "color-mix(in srgb, var(--accent) 65%, #fff)", "color-mix(in srgb, var(--accent) 35%, #fff)", "#6b6b70", "#a1a1a6", "#d1d1d6"]; // the accent's own shades, then grays: no rainbow
const usd0 = (n) => "$" + Math.round(n || 0).toLocaleString("en-US");
const panel = (title, cls, ...kids) => el("section", { class: "panel " + (cls || "") }, el("h3", { text: title }), ...kids);
const rolled = (text, key, cls) => {
  const n = el("span", { class: cls || "" });
  roll(n, text, "fin:" + key);
  return n;
};
const kv = (k, v) => el("div", { class: "kv" }, el("span", { text: k }), rolled(v, k, "v"));
const row = (label, meta) => el("div", { class: "row" }, el("span", { class: "label" }, label), el("span", { class: "meta", text: meta }));
const scroll = (...rows) => el("div", { class: "scroll" }, ...rows);
const nodata = () => el("p", { class: "muted", text: "No data." });
let hero = null;
// Streamer mode: a project or agent label is rendered through shown() and blurred, never drawn
const name = (text, props = {}) => el("span", { ...props, class: streaming() ? "masked" : null, text: shown(text) });

export function renderFinancials(root, s) {
  if (!root.querySelector(".fin-hero")) {
    root.replaceChildren(el("div", { class: "fin-grid" }, el("section", { class: "hero fin-hero" }), el("div", { class: "fin-body" })));
    hero = createHero(root.querySelector(".fin-hero"), { label: "Spend, API-equivalent", field: "cost", format: (n) => usd(n) });
  }
  hero.update(s.activity || null);
  const body = root.querySelector(".fin-body");
  if (s.error) return body.replaceChildren(panel("Error", "full", el("pre", { class: "mono", text: s.error })));
  if (s.monthToDate === undefined) {
    const pct = s.progress && s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : 0;
    let track = body.querySelector(".prog-fill");
    if (!track) {
      body.replaceChildren(panel("Indexing your history", "full",
        el("p", { class: "muted", text: "The first run reads every transcript once, then caches it. Later launches are instant." }),
        el("div", { class: "prog-track" }, (track = el("div", { class: "prog-fill" }))),
        el("p", { class: "muted small" })));
    }
    track.style.width = pct + "%"; // kept between polls so its width transition can run
    body.querySelector(".small").textContent = s.progress ? `${s.progress.done} of ${count(s.progress.total, "file")}` : "";
    return;
  }
  const saving = s.savedVsApi;
  const cs = s.totals.cacheSaved;
  const modelTotal = s.byModel.reduce((x, m) => x + m.cost, 0) || 1;
  const a = s.active;
  const scrolled = new Map([...body.querySelectorAll(".scroll")].map((b) => [b.closest(".panel").firstChild.textContent, b.scrollTop]));
  body.replaceChildren(
    panel(`API-equivalent spend vs the $${s.plan} plan`, "",
      el("p", { class: "big" }, rolled(usd0(s.monthToDate), "month"), el("span", { class: "muted small", text: " this month" })),
      el("p", { class: "fin-chip" + (saving >= 0 ? " good" : ""), text: saving >= 0 ? `${usd0(saving)} saved vs API this month` : `${usd0(-saving)} below the $${s.plan} line so far this month` }),
      kv("Today", usd(s.today)), kv("Projected this month at the current pace", usd0(s.projMonth)), kv("All time", usd0(s.totals.cost)),
      el("p", { class: "muted small", text: "Exact weekly and monthly limits and reset times live in /usage. This is what the same work would cost at API rates." })),
    panel("Cache savings", "",
      el("p", { class: "big " + (cs < 0 ? "bad" : "good") }, rolled(cs < 0 ? "-" + usd0(-cs) : usd0(cs), "cache")),
      el("p", { class: "muted small", text: cs < 0 ? "Net cache cost: writes outweighed reads." : "Saved by prompt caching: reads bill at each model's cache-read price instead of full input, net of write premiums." })),
    panel("Live agents, current session", "", a
      ? el("div", {}, el("p", { class: "muted small" }, name(a.project), ` \u00b7 ${a.sessionId.slice(0, 8)}`),
          el("div", { class: "agents" },
            el("span", { class: "h", text: "Agent" }), el("span", { class: "h", text: "Output" }), el("span", { class: "h", text: "Tools" }), el("span", { class: "h", text: "Cost" }),
            ...a.agents.flatMap((g) => [name(g.label, { title: `fresh in ${tokens(g.fin)} \u00b7 cache read ${tokens(g.cread)} \u00b7 cache write ${tokens(g.cwrite)}` }), el("span", { text: tokens(g.out) }), el("span", { text: String(g.tools) }), el("span", { text: usd(g.cost) })]),
            el("b", { text: "Total" }), el("b", { text: tokens(a.total.out) }), el("b", { text: String(a.total.tools) }), el("b", { text: usd(a.total.cost) })))
      : el("p", { class: "muted", text: "No active session detected." })),
    panel("Cost by project", "", s.byProject.length ? scroll(...s.byProject.slice(0, 9).map((p) => row(name(p.project), `${tokens(p.tokens)} \u00b7 ${usd0(p.cost)}`))) : nodata()),
    panel("Top tools (attributed)", "half", s.byTool.length ? scroll(...s.byTool.map((t) => row(t.name.replace(/^mcp__/, ""), `\u00d7${t.count.toLocaleString("en-US")} \u00b7 ${usd(t.cost)}`))) : nodata()),
    panel("Model mix (by cost)", "half", s.byModel.length ? [
      el("div", { class: "mm" }, s.byModel.map((m, i) => el("span", { style: { width: (m.cost / modelTotal) * 100 + "%", background: COLORS[i % COLORS.length] } }))),
      scroll(...s.byModel.map((m) => row(m.model.replace("claude-", ""), `${Math.round((m.cost / modelTotal) * 100)}% \u00b7 ${usd0(m.cost)}`))),
    ] : nodata()),
  );
  for (const b of body.querySelectorAll(".scroll")) {
    b.scrollTop = scrolled.get(b.closest(".panel").firstChild.textContent) || 0;
    edge(b)();
  }
}
