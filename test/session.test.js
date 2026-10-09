const test = require("node:test");
const assert = require("node:assert/strict");
const { newSession, foldSession, statusOf, actionOf, sparkOf } = require("../lib/session");
const { T0, asst, user, tool, text } = require("./helpers");
const fold = (rows) => rows.reduce((s, r) => foldSession(s, r), newSession("s1"));
const sec = (n) => T0 + n * 1000;

test("an ended turn needs you", () => {
  const s = fold([user({ sec: 0 }), asst({ sec: 5, stop: "end_turn", content: [text("Done.")] })]);
  assert.equal(statusOf(s, sec(30)), "needs-you");
});

test("a pending question needs you", () => {
  const s = fold([user({ sec: 0 }), asst({ sec: 5, content: [tool("AskUserQuestion", { questions: [] })] })]);
  assert.equal(statusOf(s, sec(20)), "needs-you");
});

test("a tool still running is working, even past 60 s", () => {
  const s = fold([user({ sec: 0 }), asst({ sec: 5, content: [tool("Bash", { description: "Build" })] })]);
  assert.equal(statusOf(s, sec(185)), "working");
});

test("a tool call in the last 60 s is working; a fresh prompt is thinking", () => {
  const s = fold([asst({ sec: 0, content: [tool("Read", { file_path: "a.js" })] }), user({ sec: 1 })]);
  assert.equal(statusOf(s, sec(30)), "working");
  const t = fold([user({ sec: 0, text: "go" })]);
  assert.equal(statusOf(t, sec(30)), "thinking");
});

test("quiet for over a minute is idle, and anything older than 2 h is idle", () => {
  assert.equal(statusOf(fold([user({ sec: 0 })]), sec(90)), "idle");
  const ended = fold([asst({ sec: 0, stop: "end_turn" })]);
  assert.equal(statusOf(ended, sec(3 * 3600)), "idle");
  const hung = fold([asst({ sec: 0, content: [tool("Bash", { description: "Build" })] })]);
  assert.equal(statusOf(hung, sec(24 * 3600)), "idle");
  assert.equal(statusOf(newSession("x"), sec(0)), "idle");
});

test("a shell command shows only its description, never the command", () => {
  const secret = "curl -H 'Authorization: Bearer sk-live-123' https://api.example.com";
  const s = fold([asst({ sec: 0, content: [tool("Bash", { command: secret, description: "Call the API" })] })]);
  assert.equal(s.events[0].label, "Call the API");
  assert.ok(!JSON.stringify(s).includes("sk-live-123"));
  assert.equal(actionOf(tool("PowerShell", { command: "Get-Secret x" })), "Running PowerShell");
});

test("labels name files by basename, URLs by host, MCP tools by server", () => {
  assert.equal(actionOf(tool("Edit", { file_path: "C:\\repo\\src\\App.tsx" })), "Editing App.tsx");
  assert.equal(actionOf(tool("WebFetch", { url: "https://docs.example.com/a?token=abc" })), "Reading docs.example.com");
  assert.equal(actionOf(tool("mcp__supabase__execute_sql", {})), "Using supabase");
  assert.equal(actionOf(tool("Agent", { description: "Audit the SEO" })), "Delegating: Audit the SEO");
});

test("titles come from ai-title rows; sidechain rows are ignored; events keep the last 30", () => {
  const rows = [{ type: "ai-title", aiTitle: "Build HQ", sessionId: "s1" }, asst({ sec: 0, sidechain: true, content: [tool("Read", {})] })];
  for (let i = 0; i < 35; i++) rows.push(asst({ sec: i + 1, content: [tool("Grep", {})] }));
  const s = fold(rows);
  assert.equal(s.title, "Build HQ");
  assert.equal(s.toolCount, 35);
  assert.equal(s.events.length, 30);
});

test("the sparkline counts actions per minute over the last 30 minutes, oldest first", () => {
  const s = fold([asst({ sec: 0, content: [tool("Read", {}), tool("Grep", {})] }), asst({ sec: 1700, content: [tool("Edit", {})] })]);
  const sp = sparkOf(s, sec(1790));
  assert.equal(sp.length, 30);
  assert.equal(sp[0], 2); // 1790 s before now: the oldest minute
  assert.equal(sp[28], 1); // 90 s before now: the minute before the newest
  assert.equal(sp.reduce((a, b) => a + b, 0), 3);
  assert.equal(sparkOf(s, sec(4000)).reduce((a, b) => a + b, 0), 0); // all older than 30 min
});
