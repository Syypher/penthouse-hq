// What the floor is built from: the container to draw in, the first /api/hq floor payload in the
// mockup's CONFIG shape, and the page's hooks. Set once by main.js before the scene modules load.
export let container = null;
export let CONFIG = null;
export let hooks = {};
export function setInitial(el, floor, h = {}) {
  container = el;
  hooks = h;
  CONFIG = toConfig(floor);
}
export function toConfig(f) {
  return {
    owner: { id: "owner", name: f.owner.name, dept: "Owner", pose: "boss", look: f.owner.look, avatar: f.owner.avatar },
    sections: f.departments,
    roster: f.agents.map((a) => ({ ...a, inSession: a.working })),
  };
}
