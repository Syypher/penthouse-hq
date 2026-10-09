// Builders for transcript rows, shaped like Claude Code's JSONL (verified 2026-10-05).
let n = 0;
const T0 = Date.parse("2026-10-05T12:00:00.000Z");
const at = (sec) => new Date(T0 + sec * 1000).toISOString();
function asst({ sec = 0, id = "msg_" + ++n, model = "claude-opus-5-5", usage = {}, content = [], stop = "tool_use", sidechain = false } = {}) {
  return { type: "assistant", timestamp: at(sec), isSidechain: sidechain, message: { id, model, role: "assistant", stop_reason: stop, usage: { input_tokens: 0, output_tokens: 0, ...usage }, content } };
}
function user({ sec = 0, text = "ok", sidechain = false } = {}) {
  return { type: "user", timestamp: at(sec), isSidechain: sidechain, message: { role: "user", content: text } };
}
const tool = (name, input = {}) => ({ type: "tool_use", id: "tu_" + ++n, name, input });
const text = (t) => ({ type: "text", text: t });
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
module.exports = { T0, at, asst, user, tool, text, jsonl };
