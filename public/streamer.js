// Streamer mode: every name and task on the floor shows as one fixed mask, so a recording shows the
// office and its motion but leaks no session, agent or task text, not even its length. The state
// lives in sessionStorage so a reload in the middle of a recording keeps it on.
export const MASK = String.fromCharCode(8226).repeat(6);
const KEY = "hq.streamer";
let on = false;
try { on = sessionStorage.getItem(KEY) === "1"; } catch {}
const listeners = new Set();
export const streaming = () => on;
export const shown = (text) => (on ? MASK : text);
export function onStreaming(fn) { listeners.add(fn); }
export function setStreaming(value) {
  if (!!value === on) return;
  on = !!value;
  try { sessionStorage.setItem(KEY, on ? "1" : "0"); } catch {}
  for (const fn of listeners) fn(on);
}

// A name written inside free text (a task line that quotes a session, a folder path that ends in the
// project name, the conflict line) is masked in place: the text is cut into segments, each marked
// masked or not, and joining the segments' text gives the input back. Names match literally, the
// longest first, so "alpha-6e" wins over "alpha"; names under 3 characters are ignored, so a
// short word never masks half the page. A name of 6 or more characters fails closed: it masks
// wherever it sits, glued to other characters or not ("Acme_Prod_v2" never shows
// "Acme_Prod"), and whatever its capitals ("Alpha-6E" for "alpha-6e"), the text keeping
// its own spelling. A name of 3 to 5 characters stays exact and counts only as a whole word: where
// its first or last character is a letter, digit or underscore, the character beside it must not be
// one, so branch "main" masks "origin/main" but never "maintenance" or "Main Street".
const LONG = 6;
const WORD = /[\p{L}\p{N}_]/u;
const fold = (s) => { const l = s.toLowerCase(); return l.length === s.length ? l : s; }; // a case fold that would change the length is skipped
const wordAt = (text, i) => i >= 0 && i < text.length && WORD.test(text[i]);
const wholeAt = (text, n, i) =>
  n.length >= LONG
    ? fold(text.slice(i, i + n.length)) === fold(n)
    : text.startsWith(n, i) && !(WORD.test(n[0]) && wordAt(text, i - 1)) && !(WORD.test(n[n.length - 1]) && wordAt(text, i + n.length));
export function splitNames(text, names) {
  if (text == null || text === "") return [];
  text = String(text);
  const list = [...new Set((names || []).filter((n) => typeof n === "string" && n.length >= 3))].sort((a, b) => b.length - a.length);
  if (!list.length) return [{ text, masked: false }];
  const out = [];
  let i = 0, plain = "";
  while (i < text.length) {
    const hit = list.find((n) => wholeAt(text, n, i));
    if (!hit) {
      plain += text[i++];
      continue;
    }
    if (plain) out.push({ text: plain, masked: false });
    plain = "";
    out.push({ text: text.slice(i, i + hit.length), masked: true });
    i += hit.length;
  }
  if (plain) out.push({ text: plain, masked: false });
  return out;
}
