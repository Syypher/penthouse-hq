// Formatting for every number on the page. "-" stands for no data.
export const usd = (n, d = 2) => (n == null ? "-" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const num = (n) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
// A count and its noun agree: count(1, "subagent") is "1 subagent", count(2, "subagent") is "2 subagents"; noun() is the word alone
export const noun = (n, one, many = one + "s") => (n === 1 ? one : many);
export const count = (n, one, many) => `${num(n)} ${noun(n, one, many)}`;
export const tokens = (n) => {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
};
export function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}
export const ago = (t, now) => (t == null ? "-" : dur(now - t) + " ago");
export const clock = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const slotLabel = clock;
export const dayLabel = (date) => new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const countdown = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
export const STATUS = { working: "Working", thinking: "Thinking", "needs-you": "Needs you", idle: "Idle" };
