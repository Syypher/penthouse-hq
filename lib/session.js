// Folds a session transcript's rows into what the board shows: title, status, current action,
// and a short timeline. Shell commands are never kept: only their description is.
const MIN = 60 * 1000;
const TOOL_MAX = 30 * 60 * 1000; // a tool call with no result after this long is treated as dead
const STALE = 2 * 60 * 60 * 1000; // nothing for this long reads as idle, whatever the last row says
const MAX_EVENTS = 30;
const MAX_TIMES = 600; // tool call times kept for the sparkline

function newSession(id) {
  return { id, title: null, cwd: null, branch: null, firstAt: null, lastAt: null, toolCount: 0, lastToolAt: null, toolTimes: [], events: [], last: null };
}

const VERB = { Read: "Reading", Edit: "Editing", MultiEdit: "Editing", Write: "Writing", NotebookEdit: "Editing" };
const SAY = {
  Bash: "Running a command", PowerShell: "Running PowerShell", Grep: "Searching code", Glob: "Finding files",
  WebSearch: "Searching the web", TodoWrite: "Updating the plan", AskUserQuestion: "Asking you a question", ExitPlanMode: "Presenting a plan",
};
const clip = (s, n = 80) => {
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
};
const base = (p) => String(p).split(/[\\/]/).pop();

// A short label for one tool call.
function actionOf(b) {
  const i = (b && b.input) || {};
  const name = (b && b.name) || "tool";
  const file = i.file_path || i.notebook_path;
  if (VERB[name] && file) return `${VERB[name]} ${base(file)}`;
  if ((name === "Bash" || name === "PowerShell") && i.description) return clip(i.description);
  if (name === "WebFetch") {
    try {
      return `Reading ${new URL(i.url).host}`;
    } catch {
      return "Reading a web page";
    }
  }
  if ((name === "Agent" || name === "Task") && i.description) return clip(`Delegating: ${i.description}`);
  if (name === "Skill" && i.skill) return clip(`Using ${i.skill}`);
  if (name.startsWith("mcp__")) return `Using ${name.split("__")[1]}`;
  return SAY[name] || VERB[name] || `Using ${name}`;
}

function foldSession(s, row) {
  if (row.type === "ai-title" && row.aiTitle) {
    s.title = row.aiTitle;
    return s;
  }
  if (row.isSidechain || (row.type !== "user" && row.type !== "assistant")) return s;
  const at = Date.parse(row.timestamp);
  if (!Number.isFinite(at)) return s;
  if (row.cwd) s.cwd = row.cwd;
  if (row.gitBranch) s.branch = row.gitBranch;
  if (s.firstAt == null) s.firstAt = at;
  s.lastAt = at;
  const content = row.message && Array.isArray(row.message.content) ? row.message.content : [];
  let asks = false;
  if (row.type === "assistant")
    for (const b of content) {
      if (!b || b.type !== "tool_use") continue;
      s.toolCount++;
      s.lastToolAt = at;
      s.toolTimes.push(at);
      if (s.toolTimes.length > MAX_TIMES) s.toolTimes.shift();
      if (b.name === "AskUserQuestion") asks = true;
      s.events.push({ at, tool: b.name, label: actionOf(b) });
      if (s.events.length > MAX_EVENTS) s.events.shift();
    }
  s.last = { type: row.type, at, stop: (row.message && row.message.stop_reason) || null, asks };
  return s;
}

function statusOf(s, now) {
  const L = s.last;
  if (!L || now - L.at > STALE) return "idle";
  if (L.type === "assistant" && (L.asks || L.stop === "end_turn")) return "needs-you";
  if (L.type === "assistant" && L.stop === "tool_use" && now - L.at <= TOOL_MAX) return "working"; // a tool is still running
  if (s.lastToolAt != null && now - s.lastToolAt <= MIN) return "working";
  if (now - L.at <= MIN) return "thinking";
  return "idle";
}

// Actions per `width` ms over the last n of them, oldest first; the newest bucket ends at now.
function sparkOf(s, now, n = 30, width = MIN) {
  const out = new Array(n).fill(0);
  for (const t of s.toolTimes) {
    const k = Math.floor((now - t) / width);
    if (k >= 0 && k < n) out[n - 1 - k]++;
  }
  return out;
}

module.exports = { newSession, foldSession, statusOf, actionOf, sparkOf, clip };
