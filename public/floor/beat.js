// The room panel's lines for an agent whose desk follows a heartbeat file or a named live session: its status, its
// task, its summary lines and when it last updated. A heartbeat's task and summary come from AI answers and web pages
// and can name anyone, so the panel only ever sets them as text, and while streaming each is the mask, whole (one
// mask for all the summary lines, so not even their count shows), never a name masked in place.
import { MASK, streaming } from '../streamer.js';
import { ago } from '../format.js';

const WORD = { working: 'Working', idle: 'Idle, no task', failed: 'Failed', quiet: 'Quiet, no update for 2 h' };
export function beatLines(a, now) {
  const masked = streaming(), summary = a.summary || [];
  return {
    status: WORD[a.status] || WORD.idle,
    task: a.task ? (masked ? MASK : a.task) : null,
    summary: masked ? (summary.length ? [MASK] : []) : summary,
    updated: a.updatedAt ? 'Updated ' + ago(a.updatedAt, now) : null,
    masked,
  };
}
