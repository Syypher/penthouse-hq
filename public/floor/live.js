// Applies each /api/hq floor payload: agents turn green and walk to their desks or turn red and
// roam, sessions take and leave the live row, the ticker and the video wall count what is real.
import { CONFIG } from './data.js';
import { npcs, setWorking, addSessionPerson, removePerson } from './life.js';
import { setCounts } from './building.js';
import { addTag, refreshTag, deselectIf, refreshPanel } from './stage.js';
import { setLinks } from './links.js';

const sig = (f) => JSON.stringify([f.departments.map((d) => d.name), f.agents.map((a) => a.id + a.dept)]);
let built = null;

export function updateFloor(f) {
  if (built == null) built = sig(f);
  else if (sig(f) !== built) return location.reload(); // rooms or roster changed in the config: rebuild
  const byId = new Map(npcs.map((P) => [P.agent.id, P]));
  for (const a of f.agents) {
    const P = byId.get(a.id);
    if (!P) continue;
    if (a.status) { // a desk that follows a heartbeat or a named session: its panel lines, and its monitor names the task (masked while streaming)
      Object.assign(P.agent, { source: a.source, status: a.status, task: a.task, summary: a.summary, updatedAt: a.updatedAt });
      const title = a.task || a.name;
      if (P.term.title !== title) { P.term.title = title; P.term.draw(); }
    }
    setWorking(P, a.working, a.doing); refreshTag(P);
  }
  refreshPanel();
  // gone sessions leave first, so a swap at a full live row seats the newcomer in the same poll
  const seen = new Set(f.sessions.map((s) => 's:' + s.id));
  for (const [id, P] of byId) if (id.startsWith('s:') && !seen.has(id)) { deselectIf(P); removePerson(P); }
  for (const s of f.sessions) {
    const id = 's:' + s.id;
    let P = byId.get(id);
    if (!P) { P = addSessionPerson(s, f.sessionAvatars[s.avatar]); if (!P) continue; addTag(P); }
    setWorking(P, s.working, s.action);
    const title = s.action || s.name;
    if (P.term.title !== title) { P.term.title = title; P.term.draw(); } // the center screen names the task now, not at the next keystroke
    refreshTag(P);
  }
  const working = f.agents.filter((a) => a.working).length + f.sessions.filter((s) => s.working).length;
  setCounts(working, f.agents.length + f.sessions.length - working, CONFIG.sections.length);
  setLinks(f.links || [], (id) => { const P = npcs.find((x) => x.agent.id === 's:' + id); return P ? P.desk : null; });
}
