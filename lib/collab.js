// Folds the rows that show sessions working together: delegations to subagents and how they ended,
// messages between sessions, background work that finished, and pull requests opened. Only short
// fields are kept (a delegation's description, a message's summary or first line, a notification's
// summary); prompts and message bodies are never stored. A background shell job is shown by its
// call's description, because a notification's summary can quote the command itself.
const { clip } = require("./session");

const MAX = 40; // per list
const MAX_SHELL = 200; // background shell calls remembered for their descriptions
const NOTE = /<task-notification>([\s\S]*?)<\/task-notification>/g;
const ENDS = { completed: "done", failed: "failed", killed: "stopped" };

function newCollab() {
  return { delegations: new Map(), shell: new Map(), sent: [], received: [], completions: [], prs: [], pipes: {}, seen: new Set() };
}

const push = (list, item) => {
  list.push(item);
  if (list.length > MAX) list.shift();
};
const tag = (s, name) => {
  const m = s.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};
const attr = (s, name) => (s.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || null;
const firstLine = (s) => (typeof s === "string" ? s.split("\n").map((l) => l.trim()).find(Boolean) || "" : "");

function end(d, status, at) {
  if (d.status !== "running") return;
  d.status = status;
  d.doneAt = at;
}

function notification(c, inner, at) {
  const id = tag(inner, "task-id");
  const status = ENDS[tag(inner, "status")];
  if (!id || !status || c.seen.has("n:" + id)) return;
  c.seen.add("n:" + id);
  const useId = tag(inner, "tool-use-id");
  const d = c.delegations.get(useId);
  if (d) return end(d, status, at);
  const summary = tag(inner, "summary") || "";
  const text = c.shell.has(useId) ? c.shell.get(useId) || "A background command" : /^Background command/.test(summary) ? "A background command" : summary || "Background work";
  push(c.completions, { at, status, text: clip(text, 100), useId }); // the id lets the session view resolve a shell launched inside a subagent
}

function received(c, text, at) {
  for (const part of text.split("<cross-session-message").slice(1)) {
    const head = part.slice(0, part.indexOf(">") + 1);
    const body = part.slice(head.length).split("</cross-session-message>")[0];
    const pipe = attr(head, "from");
    const name = attr(head, "from-name");
    const key = "m:" + (name || pipe) + "\n" + body.slice(0, 200);
    if (c.seen.has(key)) continue;
    c.seen.add(key);
    if (pipe && name) c.pipes[pipe] = name;
    push(c.received, { at, from: name || pipe || "another session", pipe, text: clip(firstLine(body) || "a message", 100) });
  }
}

function foldCollab(c, row) {
  if (row.isSidechain) return c;
  const at = Date.parse(row.timestamp);
  if (!Number.isFinite(at)) return c;
  if (row.type === "pr-link") {
    if (row.prUrl && !c.prs.some((p) => p.url === row.prUrl)) push(c.prs, { at, number: row.prNumber, url: row.prUrl, repo: row.prRepository || null });
    return c;
  }
  const content = row.message ? row.message.content : null;
  if (row.type === "assistant" && Array.isArray(content)) {
    for (const b of content) {
      if (!b || b.type !== "tool_use") continue;
      const i = b.input || {};
      if (b.name === "Agent" || b.name === "Task") {
        c.delegations.set(b.id, { id: b.id, startedAt: at, doneAt: null, status: "running", type: i.subagent_type || "general-purpose", description: clip(i.description || "a task", 100) });
        if (c.delegations.size > MAX) c.delegations.delete(c.delegations.keys().next().value);
      } else if ((b.name === "Bash" || b.name === "PowerShell") && i.run_in_background) {
        c.shell.set(b.id, i.description ? clip(i.description, 100) : null);
        if (c.shell.size > MAX_SHELL) c.shell.delete(c.shell.keys().next().value);
      } else if (b.name === "SendMessage") {
        push(c.sent, { at, to: String(i.to || i.recipient || "another session"), text: clip(i.summary || firstLine(i.message) || "a message", 100) });
      }
    }
    return c; // an assistant quoting a notification is not one
  }
  let text = "";
  if (row.type === "queue-operation" && row.operation === "enqueue" && typeof row.content === "string") text = row.content;
  if (row.type === "user") {
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || b.type !== "tool_result") continue;
        const d = c.delegations.get(b.tool_use_id);
        if (!d) continue;
        if (b.is_error) end(d, "failed", at);
        else if (row.toolUseResult && row.toolUseResult.status === "completed") end(d, "done", at);
        // "async_launched": the work goes on in the background and a notification ends it
      }
      text = content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
    }
  }
  if (!text) return c;
  for (const m of text.matchAll(NOTE)) notification(c, m[1], at);
  // A delivery is the user text itself (Claude Code prefixes it with "Another Claude session sent a
  // message:") or the queued content; a prompt quoting the tag (a compaction summary, a review) is not one.
  const head = text.trimStart();
  if (head.startsWith("Another Claude session sent a message:") || head.startsWith("<cross-session-message")) received(c, text, at);
  return c;
}

function collabView(c) {
  const newest = (list) => list.slice().reverse();
  return {
    delegations: newest([...c.delegations.values()].map((d) => ({ ...d }))),
    sent: newest(c.sent),
    received: newest(c.received),
    completions: newest(c.completions),
    prs: newest(c.prs),
    pipes: { ...c.pipes },
  };
}

module.exports = { newCollab, foldCollab, collabView };
