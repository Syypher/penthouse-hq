// The department rooms fanned around the table, a desk for every agent, and the live row nearest the table. Mockup lines 1107-1197.
import * as THREE from 'three';
import { CONFIG } from './data.js';
import { V3, rad, scene, BRASS, BLACK, glow, add } from './core.js';
import { SEC_ANG, rays } from './building.js';
import {
  CHAIR, screenMat, OFF_MAT, LOCK_MAT, chartTex, rowsTex, awayTex, makeTerminal, makeDesk, pendant, textPlane
} from './furniture.js';

// ============================================================================
// ROOMS: each department works in its own glass suite, fanned around the
// boss's table: smoked glass in brass frames, a door that faces the table, its
// name lit over the door, its own carpet and cove light, a desk for every agent.
// Each room has a center aisle from its door: two narrower desks on each side
// and a head desk at the back, so an agent can walk in and sit down. Nobody is
// seated here: life.js seats and moves everyone from live data.
// ============================================================================
export const BOSS_POS = new V3(0, .78, 0), BOSS_WALK = 1.0; // m/s
export const yawTo = (x, z) => Math.atan2(BOSS_POS.x - x, BOSS_POS.z - z);
export const polar = (R, deg) => [R * Math.sin(rad(deg)), R * Math.cos(rad(deg))];
export const persons = [];
export function sector(r0, r1, a0, a1, mat, y, parent = scene) { const g = new THREE.RingGeometry(r0, r1, 48, 1, rad(a0 - 90), rad(a1 - a0)); g.rotateX(-Math.PI / 2); return add(g, mat, [0, y, 0], null, { parent }); }
// a desk and its chair facing the boss, with its light; the record says where to sit, where to stand up, and what the screens show
export const DESKS = [];
export function deskAt(key, x, z, mats, narrow = false) {
  const yawB = yawTo(x, z), ux = Math.sin(yawB), uz = Math.cos(yawB);
  const { g: desk, screens } = makeDesk(mats, narrow); desk.position.set(x, 0, z); desk.rotation.y = yawB; scene.add(desk); desk.updateMatrixWorld(true);
  const ch = CHAIR.clone(); ch.position.set(x + ux * .61, 0, z + uz * .61); ch.rotation.y = yawB + Math.PI; scene.add(ch);
  const l = new THREE.PointLight('#a9c8ff', .55, 2.2, 2); l.position.set(x + ux * .25, 1.12, z + uz * .25); scene.add(l);
  const D = { key, x, z, yaw: yawB + Math.PI, w: narrow ? 1.25 : 1.6, screens, seat: new V3(x + ux * .68, 0, z + uz * .68), stand: new V3(x + ux * 1.15, 0, z + uz * 1.15), lookPts: screens.map(s => s.getWorldPosition(new V3())) };
  DESKS.push(D); return D;
}
export const ROOM = { r0: 5.2, r1: 11.6, h: 2.85, fascia: .38, door: 7.7 }; // door = half the opening, in degrees
export const roomGlass = new THREE.MeshPhysicalMaterial({ color: '#c3cedb', transparent: true, opacity: .08, roughness: .04, metalness: .15, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
export const frostMat = new THREE.MeshBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
export const lacquer = new THREE.MeshPhysicalMaterial({ color: '#070708', roughness: .22, clearcoat: 1, clearcoatRoughness: .12 });
// a straight run between two floor points [x, z]: a box (rail, fascia) or a glass pane
export function span(p, q, h, d, mat, y, plane = false) {
  const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
  return add(plane ? new THREE.PlaneGeometry(len, h) : new THREE.BoxGeometry(len, h, d), mat, [(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2], [0, Math.atan2(-dz, dx), 0], { receive: !plane });
}
export const arcPts = (r, a0, a1, step = 1.8) => { const n = Math.max(1, Math.ceil(r * rad(Math.abs(a1 - a0)) / step)); return Array.from({ length: n + 1 }, (_, i) => polar(r, a0 + (a1 - a0) * i / n)); };
export const radialPts = (e, step = 2.2) => { const n = Math.ceil((ROOM.r1 - ROOM.r0) / step); return Array.from({ length: n + 1 }, (_, i) => polar(ROOM.r0 + (ROOM.r1 - ROOM.r0) * i / n, e)); };
// a glass wall along a polyline: panes, a frosted band, a black base, a brass head rail and mullions
export function glassRun(pts, top = ROOM.h) {
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    span(p, q, top, 0, roomGlass, top / 2, true);
    span(p, q, .06, 0, frostMat, 1.05, true);
    span(p, q, .07, .07, BLACK, .035);
    span(p, q, .035, .06, BRASS, top - .0175);
  }
  for (const p of pts) add(new THREE.BoxGeometry(.03, top, .05), BRASS, [p[0], top / 2, p[1]]);
}
export const RING = 4.85, AISLE = .45, ROOM_SPAN = CONFIG.sections.length * 31 / 2;
// [radius, side, narrow]: two front, two middle, one head desk at the back of the aisle
const LAYOUT = [[6.9, -1, true], [6.9, 1, true], [9.1, -1, true], [9.1, 1, true], [10.7, 0, false]];
CONFIG.sections.forEach((sec, si) => {
  const c = SEC_ANG[si], a0 = c - 15.5, a1 = c + 15.5, col = new THREE.Color(sec.color), dg = ROOM.door;
  // floor: a carpet in the room's color with a brass border and a brass threshold
  sector(ROOM.r0, ROOM.r1, a0, a1, new THREE.MeshStandardMaterial({ color: new THREE.Color('#0e0e11').lerp(col, .1), roughness: .97 }), .004);
  for (const R of [ROOM.r0 + .22, ROOM.r1 - .22]) sector(R - .012, R + .012, a0 + .9, a1 - .9, BRASS, .006);
  sector(ROOM.r0 - .07, ROOM.r0 + .07, c - dg, c + dg, BRASS, .006);
  // walls: glass toward the table with a door in the middle, glass toward the city behind
  glassRun(arcPts(ROOM.r0, a0, c - dg)); glassRun(arcPts(ROOM.r0, c + dg, a1)); glassRun(arcPts(ROOM.r1, a0, a1));
  const dl = polar(ROOM.r0, c - dg), dr = polar(ROOM.r0, c + dg);
  for (const p of [dl, dr]) add(new THREE.BoxGeometry(.08, ROOM.h, .1), BRASS, [p[0], ROOM.h / 2, p[1]]);
  span(dl, dr, ROOM.h - 2.35, 0, roomGlass, (ROOM.h + 2.35) / 2, true); span(dl, dr, .04, .07, BRASS, 2.35); // transom over the door
  // fascia: a black lacquer band, a lit strip in the room's color, the name over the door
  const inner = [...arcPts(ROOM.r0, a0, c - dg), ...arcPts(ROOM.r0, c + dg, a1)], outer = arcPts(ROOM.r1, a0, a1);
  for (const pts of [inner, outer]) for (let i = 0; i < pts.length - 1; i++) span(pts[i], pts[i + 1], ROOM.fascia, .1, lacquer, ROOM.h + ROOM.fascia / 2);
  const stripMat = glow(sec.color, 1.6), sp = arcPts(ROOM.r0 - .065, a0, a1, .6);
  for (let i = 0; i < sp.length - 1; i++) span(sp[i], sp[i + 1], .022, .02, stripMat, ROOM.h + .02);
  const sign = textPlane(sec.name, 1.9, .28, sec.color, { size: 120, spacing: 34, border: false, bg: 'rgba(0,0,0,0)', k: 1.3 });
  const [sx, sz] = polar(ROOM.r0 * Math.cos(rad(dg)) - .1, c); sign.position.set(sx, ROOM.h + ROOM.fascia / 2 + .01, sz); sign.rotation.y = rad(c) + Math.PI; scene.add(sign);
  // open to the double-height hall above; a cove of the room's color along the back glass, and the room's own light
  const cove = arcPts(ROOM.r1 - .08, a0 + .5, a1 - .5, .6), coveMat = glow(sec.color, 1.2);
  for (let i = 0; i < cove.length - 1; i++) span(cove[i], cove[i + 1], .025, .025, coveMat, ROOM.h - .05);
  const [lx, lz] = polar(8.4, c), light = new THREE.PointLight(new THREE.Color('#ffe0bd').lerp(col, .32), 7, 8, 2);
  light.position.set(lx, ROOM.h - .35, lz); scene.add(light);
  // desks along the aisle, every one facing the boss through the glass; a desk's center sits side * (AISLE + w / 2) off the room's center line
  const team = CONFIG.roster.filter(a => a.dept === sec.name);
  const chart = screenMat(chartTex(sec.name, sec.color)), rows = screenMat(rowsTex('queue', sec.color));
  LAYOUT.forEach(([R, side, narrow], k) => {
    const a = team[k], w = narrow ? 1.25 : 1.6, off = side * (AISLE + w / 2);
    const [cx, cz] = polar(R, c), x = cx + Math.cos(rad(c)) * off, z = cz - Math.sin(rad(c)) * off;
    if (!a) return deskAt('empty:' + sec.name + k, x, z, [OFF_MAT, OFF_MAT, OFF_MAT], narrow);
    const T = makeTerminal(a.name, sec.color);
    const D = deskAt('desk:' + a.id, x, z, [LOCK_MAT, screenMat(awayTex(a.name, sec.color)), LOCK_MAT], narrow);
    Object.assign(D, { room: c, standR: Math.hypot(D.stand.x, D.stand.z), term: T, workMats: [chart, T.mat, rows], awayMats: D.screens.map(s => s.material) });
  });
});
// the walls between rooms, and the two ends, with the fascia on top
for (const e of rays) { glassRun(radialPts(e)); span(polar(ROOM.r0, e), polar(ROOM.r1, e), ROOM.fascia, .1, lacquer, ROOM.h + ROOM.fascia / 2); }
// the live row: four fixed seats nearest the table that start empty; sessions take them at runtime (life.js addSessionPerson)
export const LIVE_SLOTS = [-14, 14, -40, 40].map((deg, i) => {
  const [x, z] = polar(3.75, deg), off = screenMat(awayTex('Open seat', '#30d158', false));
  const D = deskAt('live:' + i, x, z, [OFF_MAT, off, OFF_MAT]);
  return Object.assign(D, { live: deg, awayMats: D.screens.map(s => s.material), owner: null });
});
pendant(0, 3.6, 3.9, true, '#ffcf99', 10);
// routes into a room and into the live row; both end where the spot's `stand` begins
// from the open floor beside the rooms, along the ring in front of the doors, in at the door, up the aisle
export function roomRoute(D, fromX) {
  const s = D.room > 0 ? 1 : D.room < 0 ? -1 : (fromX < 0 ? -1 : 1), end = s * (ROOM_SPAN + 8.5);
  const pts = [polar(RING, end)];
  for (let a = end - s * 8; s * a > s * D.room; a -= s * 8) pts.push(polar(RING, a));
  pts.push(polar(RING, D.room), polar(5.6, D.room));
  if (D.standR > 6.5) pts.push(polar(D.standR, D.room));
  return pts;
}
// around the outside of the live row and in between the table and the desks
export function liveRoute(D) {
  const s = D.live < 0 ? -1 : 1;
  return [polar(RING, s * (ROOM_SPAN + 8.5)), polar(RING, s * 60), polar(2.45, s * 60), ...arcPts(2.45, s * 60, D.live, .8).slice(1)];
}
