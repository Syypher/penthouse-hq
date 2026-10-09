// Idle life: the spots an idle agent moves between, the walkable floor and its routes, the NPCs and the ball. Mockup lines 1444-1617, except npcUpdate (stage.js).
import * as THREE from 'three';
import { CONFIG } from './data.js';
import { V3, lerp, clamp, smooth, wrapAngle, rand, rad, scene, now } from './core.js';
import { SEATS, buildPerson, setPose, pickables } from './person.js';
import { persons, DESKS, LIVE_SLOTS, ROOM_SPAN, roomRoute, liveRoute } from './rooms.js';
import { screenMat, chartTex, rowsTex, makeTerminal, terminals } from './furniture.js';
import { HOOP, ball, BALL_REST } from './wings.js';

// ============================================================================
// IDLE LIFE: an agent with no task is red and lives like an office NPC. It
// walks between spots, grabs coffee, chats, naps, shoots pool, until a task
// turns it green and it sits at its desk. Scripted motion, not AI behavior.
// ============================================================================
// spot: where it stands (pos), what it faces, an optional seat it sits into from
// `stand`, `via` points that thread it in past furniture, and the spot it talks to
export const SPOTS = {
  'coffee': { pos: [8.15, -10.95], face: [8.15, -12], act: 'coffee', with: 'coffee-chat', name: 'the coffee machine', where: 'Grabbing a coffee', dur: [9, 14] },
  'coffee-chat': { pos: [9.2, -10.45], face: [8.15, -10.95], act: 'mugTalk', with: 'coffee', name: 'the coffee machine', where: 'Coffee and small talk' },
  'chat-a': { pos: [9.0, -4.0], face: [9.9, -4.7], act: 'talk', with: 'chat-b', name: 'the floor', where: 'Chatting on the floor' },
  'chat-b': { pos: [9.9, -4.7], face: [9.0, -4.0], act: 'pockets', with: 'chat-a', name: 'the floor', where: 'Chatting on the floor' },
  'bar-stool': { pos: [14.8, -8.65], stand: [14.8, -8.0], face: [14.8, -10], seat: 'stool', act: 'drink', with: 'bar-stand', name: 'the bar', where: 'At the bar, whiskey in hand' },
  'bar-stool-2': { pos: [13.6, -8.65], stand: [13.6, -8.0], face: [13.6, -10], seat: 'stool', act: 'drink', with: 'bar-stool', name: 'the bar', where: 'At the bar' },
  'bar-stand': { pos: [16.55, -8.3], face: [14.8, -8.65], act: 'talkDrink', with: 'bar-stool', name: 'the bar', where: 'At the bar, talking' },
  'couch-a': { pos: [15.0, -5.05], stand: [15.0, -4.36], via: [[13.75, -4.36]], face: [15.0, 0], seat: 'couch', act: 'talkSeat', with: 'couch-b', name: 'the couches', where: 'On the couch, talking' },
  'couch-b': { pos: [15.85, -2.55], stand: [15.85, -3.24], via: [[16.9, -3.24]], face: [15.85, -8], seat: 'couch', act: 'crossed', with: 'couch-a', name: 'the couches', where: 'On the couch, listening' },
  'nap': { pos: [14.85, -2.55], stand: [14.85, -3.24], via: [[13.75, -3.24]], face: [14.85, -8], seat: 'couch', act: 'sleep', name: 'the couches', where: 'Napping on the couch', dur: [26, 40] },
  'window': { pos: [19.0, 7.4], face: [40, 7.4], act: 'phone', lookAt: [80, 20, 14], name: 'the window', where: 'At the window, on a call' },
  'window-gaze': { pos: [19.15, -6.2], face: [40, -6.2], act: 'pockets', lookAt: [90, 30, -20], name: 'the window', where: 'At the window, taking in the city' },
  'hightop-a': { pos: [17.7, .35], face: [17.7, 1.0], act: 'talkDrink', with: 'hightop-b', name: 'the high-top', where: 'At the high-top, talking' },
  'hightop-b': { pos: [18.4, 1.5], face: [17.7, 1.0], act: 'crossed', with: 'hightop-a', name: 'the high-top', where: 'At the high-top, listening' },
  'pool': { pos: [13.65, 2.55], face: [14.8, 3.6], act: 'cue', lookAt: [14.8, .8, 3.9], name: 'the pool table', where: 'Shooting pool' },
  'pool-watch': { pos: [16.35, 5.35], face: [13.65, 2.55], act: 'crossed', with: 'pool', name: 'the pool table', where: 'Watching the pool game' },
  // the game room: `pair` draws a second player over without turning them to face each other
  'arcade-1': { pos: [-17.4, -10.82], face: [-17.4, -12], act: 'arcade', pair: 'arcade-2', lookAt: [-17.4, 1.3, -11.42], name: 'the arcade', where: 'Playing Star Lane at the arcade' },
  'arcade-2': { pos: [-16.2, -10.82], face: [-16.2, -12], act: 'arcade', pair: 'arcade-1', lookAt: [-16.2, 1.3, -11.42], name: 'the arcade', where: 'Playing Turbo 99 at the arcade' },
  'arcade-watch': { pos: [-16.8, -9.55], face: [-16.8, -12], act: 'crossed', pair: 'arcade-1', lookAt: [-16.8, 1.3, -11.42], name: 'the arcade', where: 'Watching a game at the arcade' },
  'sim-1': { pos: [-16.4, -2.4], stand: [-16.4, -1.6], face: [-20, -2.4], seat: 'sim', act: 'drive', pair: 'sim-2', lookAt: [-17.72, 1.0, -2.4], name: 'the racing simulators', where: 'Racing on the simulator', dur: [22, 36] },
  'sim-2': { pos: [-16.4, 1.0], stand: [-16.4, 1.8], face: [-20, 1.0], seat: 'sim', act: 'drive', pair: 'sim-1', lookAt: [-17.72, 1.0, 1.0], name: 'the racing simulators', where: 'Racing on the simulator', dur: [22, 36] },
  'sim-watch': { pos: [-15.2, -.7], face: [-17.7, -.7], act: 'crossed', pair: 'sim-1', lookAt: [-17.7, 1.0, -1.1], name: 'the racing simulators', where: 'Watching the race' },
  'hoops': { pos: [-15.7, 13.7], face: [-15.7, 18.22], act: 'shoot', ball: true, pair: 'hoops-2', name: 'the court', where: 'Shooting hoops', dur: [18, 30] },
  'hoops-2': { pos: [-14.2, 17.0], face: [-15.7, 13.7], act: 'pockets', ball: true, pair: 'hoops', lookAt: [-15.7, 3.05, 18.2], name: 'the court', where: 'Under the hoop, rebounding' },
  'court-side': { pos: [-12.3, 12.6], face: [-15.7, 15.5], act: 'crossed', ball: true, pair: 'hoops', lookAt: [-15.7, 3.05, 18.2], name: 'the court', where: 'Courtside, watching' },
  'war-a': { pos: [16.52, 13.6], stand: [17.15, 13.6], face: [15.4, 13.6], seat: 'desk', act: 'talkSeat', with: 'war-b', name: 'the war room', where: 'In the war room, talking shop' },
  'war-b': { pos: [14.28, 14.8], stand: [13.65, 14.8], face: [15.4, 14.8], seat: 'desk', act: 'crossed', with: 'war-a', name: 'the war room', where: 'In the war room, listening' },
  'skyline-a': { pos: [-5.5, 19.0], face: [-5.5, 40], act: 'pockets', lookAt: [-40, 30, 160], name: 'the skyline', where: 'At the glass, on top of the world' },
  'skyline-b': { pos: [6.0, 19.0], face: [6.0, 40], act: 'phone', lookAt: [40, 20, 160], name: 'the skyline', where: 'At the glass, on a call' },
};
export function prepSpot(S) {
  S.yaw = Math.atan2(S.face[0] - S.pos[0], S.face[1] - S.pos[1]);
  S.posV = new V3(S.pos[0], 0, S.pos[1]); S.stand = S.stand || S.pos; S.standV = new V3(S.stand[0], 0, S.stand[1]);
  return S;
}
for (const S of Object.values(SPOTS)) prepSpot(S);
// a desk spot per job agent's desk and per live slot. It never times out (Infinity would make settle() compute NaN), and it
// starts with its route in as `via`, so an agent that begins the day seated walks back out the way it would have come in.
for (const D of DESKS) {
  if (!D.key.startsWith('desk:') && !D.key.startsWith('live:')) continue;
  SPOTS[D.key] = prepSpot({ pos: [D.seat.x, D.seat.z], stand: [D.stand.x, D.stand.z], face: [D.seat.x + Math.sin(D.yaw), D.seat.z + Math.cos(D.yaw)],
    seat: 'desk', act: 'type', name: 'its desk', where: 'At its desk, working', dur: [1e9, 1e9], desk: D, via: D.live != null ? liveRoute(D) : roomRoute(D, D.x) });
}
// walkable floor: everything outside the rooms, the table and the dais, minus furniture (with a body-width margin)
export const OBST = [
  [15.4, -5.0, 1.05, .44], [15.4, -2.6, 1.05, .44], [15.4, -3.8, .7, .35], [17.4, -3.8, .15, .15], [15.6, -9.5, 3.1, .45], // lounge, bar
  [13.6, -8.65, .21, .21], [14.8, -8.65, .21, .21], [16.0, -8.65, .21, .21], [14.8, 3.6, .81, 1.42], [17.7, 1.0, .32, .32], [8.4, -11.7, .83, .3],
  [15.4, 14.2, 1.15, 2.7], // war room
  [-16.8, -11.53, 2.3, .4], [-16.9, -2.4, 1.0, .5], [-16.9, 1.0, 1.0, .5], [-15.7, 19.3, .35, .3], // arcade, simulators, hoop
  [11, -6.5, .48, .48], [11, 9.5, .48, .48], [-11, -6.5, .48, .48], [-11, 9.5, .48, .48], // columns
];
export function blocked(x, z) {
  if (Math.abs(x) > 19.55 || z < -11.3 || z > 19.4) return true;
  const r = Math.hypot(x, z);
  if (r < 4.7) return true; // the table and the live desks
  if (r < 11.9 && Math.abs(Math.atan2(x, z)) < rad(ROOM_SPAN + 1.5)) return true; // the rooms
  if (Math.abs(x) < 3.65 && z < -2.8 && z > -7.85) return true; // the dais
  return OBST.some(([cx, cz, hx, hz]) => Math.abs(x - cx) < hx + .26 && Math.abs(z - cz) < hz + .26);
}
export function los(a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .12);
  for (let i = 1; i < n; i++) if (blocked(lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n))) return false;
  return true;
}
export const NAV = [
  [12.2, -7.7], [10.0, -9.6], [18.6, -7.6], [13.0, -4.0], [18.9, -2.4], [12.6, -.9], [16.4, -.6], [12.6, 3.6], [16.9, 3.4], [16.0, 6.6], [12.8, 6.8], [9.2, -5.8], [18.8, 5.4], [7.6, -8.0], // east wing
  [13.2, 10.4], [18.2, 10.4], [18.3, 18.4], [13.0, 18.4], // war room
  [4.0, -9.6], [0, -9.7], [-4.0, -9.6], // back corridor, behind the dais
  [9.0, 15.2], [4.5, 15.6], [0, 15.6], [-4.5, 15.6], [-9.0, 15.2], // front promenade along the glass
  [-7.6, -8.0], [-9.2, -5.8], [-12.2, -7.7], [-10.0, -9.6], [-16.8, -9.7], [-19.0, -7.2], [-13.0, -4.0], [-19.0, -4.4], [-14.6, -.7], [-19.0, -.6], // west wing
  [-12.6, 3.6], [-14.6, 3.0], [-12.8, 6.8], [-17.0, 7.0], [-13.0, 11.4], [-18.6, 11.4], [-15.7, 12.2], [-12.6, 16.6], [-18.8, 16.6],
];
export const navAdj = NAV.map((a, i) => NAV.map((b, j) => i !== j && los(a, b) ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0));
// shortest route from a to b through the nav points (Dijkstra)
export function navRoute(a, b) {
  if (los(a, b)) return [b];
  const n = NAV.length, dist = Array(n).fill(Infinity), prev = Array(n).fill(-1), done = Array(n).fill(false);
  NAV.forEach((p, i) => { if (los(a, p)) dist[i] = Math.hypot(a[0] - p[0], a[1] - p[1]); });
  for (;;) {
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break; done[u] = true;
    for (let v = 0; v < n; v++) if (navAdj[u][v] && dist[u] + navAdj[u][v] < dist[v]) { dist[v] = dist[u] + navAdj[u][v]; prev[v] = u; }
  }
  let best = -1, bd = Infinity;
  NAV.forEach((p, i) => { if (dist[i] < Infinity && los(p, b)) { const d = dist[i] + Math.hypot(p[0] - b[0], p[1] - b[1]); if (d < bd) { bd = d; best = i; } } });
  if (best < 0) { console.warn('HQ: no walking route', a, b); return [b]; }
  const out = [b]; for (let i = best; i >= 0; i = prev[i]) out.unshift(NAV[i]);
  return out;
}
// walk a path of [x, z, y?] points; a drop or climb over .3 m is a hop
export function walkAlong(P, dt, speed) {
  const p = P.root.position, tgt = P.path[P.pi], ty = tgt[2] ?? 0;
  const dx = tgt[0] - p.x, dz = tgt[1] - p.z, d = Math.hypot(dx, dz);
  if (!P.segLen) { P.segLen = Math.max(d, 1e-3); P.segY0 = p.y; }
  const hop = Math.abs(ty - P.segY0) > .3, v = speed * (hop ? .6 : 1) * Math.max(.35, P.walkW), step = v * dt;
  P.stride += dt * v / 1.4 * Math.PI * 2;
  if (d > .02) P.yaw += wrapAngle(Math.atan2(dx, dz) - P.yaw) * Math.min(1, dt * 7);
  if (d <= step) { p.set(tgt[0], ty, tgt[1]); P.segLen = 0; return ++P.pi >= P.path.length; }
  p.x += dx / d * step; p.z += dz / d * step;
  const f = clamp(1 - (d - step) / P.segLen, 0, 1); p.y = lerp(P.segY0, ty, f) + (hop ? .16 * Math.sin(Math.PI * f) : 0);
  return false;
}
export const occupant = {};
export const npcs = [];
export function settle(P, t) {
  const S = SPOTS[P.spot], [a, b] = S.dur || [14, 30];
  P.state = 'do'; P.timer = a + rand() * (b - a); P.actT = t; P.where = S.where;
  if (S.desk) { setScreens(P, true); P.lookPts = S.desk.lookPts; }
}
// an idle spot to wander to: never a desk, a free one, drawn toward company and away from the nap
export function pickSpot(P) {
  const opts = Object.keys(SPOTS).filter(k => !occupant[k] && k !== P.spot && !SPOTS[k].desk);
  if (!opts.length) return P.spot; // every hangout taken: stay put (a step out and back), never an undefined spot
  const w = opts.map(k => { const m = SPOTS[k].with || SPOTS[k].pair; return (m && occupant[m] ? 3 : 1) * (k === 'nap' ? .5 : 1); });
  let x = rand() * w.reduce((s, v) => s + v, 0), k = opts[0];
  for (let i = 0; i < opts.length; i++) if ((x -= w[i]) <= 0) { k = opts[i]; break; }
  return k;
}
export function go(P, k, t) {
  const from = SPOTS[P.spot]; if (occupant[P.spot] === P) occupant[P.spot] = null;
  const S = SPOTS[k]; occupant[k] = P; P.spot = k; P.seat = null; P.lookPts = null;
  if (S.desk) S.via = S.desk.live != null ? liveRoute(S.desk) : roomRoute(S.desk, P.root.position.x);
  const out = from && from.via ? [...from.via].reverse() : [], into = S.via || [];
  const start = out.length ? out[out.length - 1] : [P.root.position.x, P.root.position.z];
  P.path = [...out, ...navRoute(start, into.length ? into[0] : S.stand), ...(into.length ? [...into.slice(1), S.stand] : [])];
  P.pi = 0; P.segLen = 0; P.state = 'walk'; P.where = S.desk ? 'Heading to its desk' : `Walking to ${S.name}`;
  setPose(P, 'walk');
}
// send a person somewhere: a walker finishes its leg first, a sitter stands up first
export function sendTo(P, k, t) {
  if (P.state === 'walk' || P.state === 'turn') { P.next = k; return; }
  if (P.seat) { P.next = k; P.state = 'rise'; return; }
  go(P, k, t);
}
export function setScreens(P, on) {
  const D = P.desk; if (!D) return;
  D.screens.forEach((s, i) => { s.material = on ? D.workMats[i] : D.awayMats[i]; });
}
export function setWorking(P, on, doing) {
  P.agent.inSession = on; P.agent.doing = doing || null;
  if (P.goingToWork === on) return;
  P.goingToWork = on;
  if (!on) setScreens(P, false);
  sendTo(P, on ? P.desk.key : pickSpot(P), now());
}
// every roster agent: a working one starts seated at its desk, an idle one at its hangout (or any free spot when the config names none)
CONFIG.roster.forEach((a, i) => {
  const D = DESKS.find(D => D.key === 'desk:' + a.id), P = buildPerson(a);
  P.npc = true; P.desk = D; P.term = D.term; P.walkW = 0; P.stride = 0; P.fixedLook = new V3();
  if (a.inSession) {
    P.spot = D.key; occupant[D.key] = P;
    P.root.position.copy(D.seat); P.yaw = D.yaw; P.seat = SEATS.desk; P.sitW = 1; setPose(P, 'type');
    settle(P, 0); P.goingToWork = true;
  } else {
    const k = SPOTS[a.hangout] && !occupant[a.hangout] ? a.hangout : pickSpot(P), S = SPOTS[k];
    P.spot = k; occupant[k] = P;
    P.root.position.copy(S.seat ? S.posV : S.standV); P.yaw = S.yaw; P.seat = S.seat ? SEATS[S.seat] : null; P.sitW = S.seat ? 1 : 0; setPose(P, S.act);
    settle(P, 0); P.timer = 3 + i * 4 + rand() * 5; P.goingToWork = false; // stagger so someone is always on the move
  }
  P.root.rotation.y = P.yaw;
  scene.add(P.root); persons.push(P); npcs.push(P);
});
// a real session takes a free live seat; working, it starts there typing, idle it starts at a spot like anyone else
export function addSessionPerson(s, look) {
  const D = LIVE_SLOTS.find(d => !d.owner); if (!D) return null;
  const agent = { id: 's:' + s.id, sessionId: s.id, name: s.name, dept: 'Live session', live: true, inSession: s.working, look: look.look, avatar: look.avatar };
  const P = buildPerson(agent); P.npc = true; P.desk = D; D.owner = P; P.fixedLook = new V3(); P.walkW = 0; P.stride = 0;
  const T = makeTerminal(s.name, '#30d158'); P.term = T; D.term = T;
  D.workMats = [screenMat(chartTex('activity', '#30d158')), T.mat, screenMat(rowsTex('files claimed', '#30d158'))];
  if (s.working) { P.spot = D.key; occupant[D.key] = P; P.root.position.copy(D.seat); P.yaw = D.yaw; P.seat = SEATS.desk; P.sitW = 1; setPose(P, 'type'); settle(P, now()); setScreens(P, true); }
  else { // a newcomer has no spot to stay at: with every hangout taken it waits at its own desk, screens off
    const k = pickSpot(P) || D.key, S = SPOTS[k]; P.spot = k; occupant[k] = P; P.root.position.copy(S.seat ? S.posV : S.standV); P.yaw = S.yaw; P.seat = S.seat ? SEATS[S.seat] : null; P.sitW = S.seat ? 1 : 0; setPose(P, S.act); settle(P, now());
    if (k === D.key) { setScreens(P, false); P.where = 'At its desk, every spot taken'; }
  }
  P.goingToWork = s.working; P.root.rotation.y = P.yaw;
  scene.add(P.root); persons.push(P); npcs.push(P);
  return P;
}
export function removePerson(P) {
  if (occupant[P.spot] === P) occupant[P.spot] = null;
  if (P.desk) {
    setScreens(P, false); P.desk.owner = null;
    // a live seat's three screens (chart, terminal, rows) are the session's own: free their textures and materials; a roster desk keeps its set
    if (P.desk.live != null && P.desk.workMats) { for (const m of P.desk.workMats) { m.map.dispose(); m.dispose(); } P.desk.workMats = P.desk.term = null; }
  }
  const ti = terminals.indexOf(P.term); if (ti >= 0) terminals.splice(ti, 1); // stop redrawing a gone session's screen
  const mine = new Set(); P.root.traverse(o => mine.add(o)); // and stop a click where it stood from picking it
  for (let i = pickables.length - 1; i >= 0; i--) if (mine.has(pickables[i])) pickables.splice(i, 1);
  scene.remove(P.root);
  const pi = persons.indexOf(P); if (pi >= 0) persons.splice(pi, 1);
  const ni = npcs.indexOf(P); if (ni >= 0) npcs.splice(ni, 1);
}

// the shooter's loop, 5 s: the ball rolls in, a dribble, the set, the shot, through the net, back to rest
export const SHOT = 5, DRIB = 1.5 / 3.5;
export const shotPhase = (P, t) => (t - P.actT) % SHOT;
export const handL = new V3(), handR = new V3(), relPos = new V3();
export let relK = -1;
export function updateBall(t) {
  const P = occupant.hoops, b = ball.position;
  if (!P || P.state !== 'do') { b.x = lerp(b.x, BALL_REST.x, .08); b.z = lerp(b.z, BALL_REST.z, .08); b.y = lerp(b.y, BALL_REST.y, .2); return; }
  const c = shotPhase(P, t), k = Math.floor((t - P.actT) / SHOT);
  P.arms[-1].hand.getWorldPosition(handR); P.arms[1].hand.getWorldPosition(handL);
  const top = handR.y - .13;
  if (c < .9) { const f = smooth(c / .9); b.set(lerp(BALL_REST.x, handR.x, f), .12 + .4 * Math.abs(Math.sin(c / .9 * Math.PI * 2)) * (1 - c / .9), lerp(BALL_REST.z, handR.z, f)); }
  else if (c < 2.4) b.set(handR.x, .12 + (top - .12) * Math.abs(Math.sin(Math.PI * (c - .9) / DRIB)), handR.z);
  else if (c < 2.9) { const f = smooth((c - 2.4) / .5); b.set(lerp(handR.x, (handL.x + handR.x) / 2, f), lerp(top, (handL.y + handR.y) / 2 + .1, f), lerp(handR.z, (handL.z + handR.z) / 2, f)); }
  else if (c < 3.9) { if (relK !== k) { relK = k; relPos.copy(b); } const f = c - 2.9; b.lerpVectors(relPos, HOOP, f); b.y += 1.15 * 4 * f * (1 - f); }
  else if (c < 4.25) { const f = (c - 3.9) / .35; b.set(HOOP.x, HOOP.y - (HOOP.y - .12) * f * f, HOOP.z); }
  else { const f = (c - 4.25) / .75; b.set(lerp(HOOP.x, BALL_REST.x, f), .12 + .5 * Math.abs(Math.sin(f * Math.PI * 2)) * (1 - f), lerp(HOOP.z, BALL_REST.z, f)); }
  ball.rotation.x -= .08;
}
