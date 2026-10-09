// The lounge (couches, bar, pool, the high-top, the war room) and the game room (arcade, simulators, the half court, coffee). Mockup lines 1198-1443.
import * as THREE from 'three';
import {
  V3, rand, scene, canvasTex, cached, leather, BRASS, CHROME, BLACK, GLASSWARE, WHISKEY, MUG, glow, woodTex,
  marbleTex, rod, sideExtrude, add
} from './core.js';
import { G } from './person.js';
import { FLOOR } from './building.js';
import { walnut, walnutDark, CHAIR, pendant, textPlane, CARBON, MATTE } from './furniture.js';

// ============================================================================
// LOUNGE: where agents hang out when they are not in a session
// ============================================================================
export const oxblood = new THREE.MeshPhysicalMaterial({ map: canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3a1710'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) { const gr = g.createRadialGradient(x, y, 1, x, y, 18); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 18, y - 18, 36, 36); }
}, [3, 1]), roughness: .4, clearcoat: .5, clearcoatRoughness: .3 });
export function couch(x, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  add(new THREE.BoxGeometry(2.1, .28, .88), oxblood, [0, .2, 0], null, { parent: g, cast: true });
  add(new THREE.BoxGeometry(1.8, .1, .66), oxblood, [0, .37, .06], null, { parent: g });
  add(new THREE.BoxGeometry(2.1, .44, .22), oxblood, [0, .56, -.33], null, { parent: g, cast: true });
  for (const s of [1, -1]) { add(new THREE.BoxGeometry(.16, .3, .88), oxblood, [s * .97, .45, 0], null, { parent: g }); const r = new THREE.CylinderGeometry(.11, .11, .88, 20); r.rotateX(Math.PI / 2); add(r, oxblood, [s * .97, .62, 0], null, { parent: g }); }
  for (const s of [1, -1]) for (const t of [1, -1]) add(new THREE.CylinderGeometry(.03, .022, .06, 10), BRASS, [s * .95, .03, t * .38], null, { parent: g });
}
// rug + couches + coffee table
add(new THREE.PlaneGeometry(4.6, 4.2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#14100d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a6a34'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40); g.lineWidth = 2; g.strokeRect(36, 36, w - 72, h - 72); }), roughness: .95 }), [15.4, .005, -3.8], [-Math.PI / 2, 0, 0]);
couch(15.4, -5.0, 0); couch(15.4, -2.6, Math.PI);
add(new THREE.BoxGeometry(1.4, .05, .7), new THREE.MeshStandardMaterial({ map: marbleTex('#0b0b0d', '200,195,185'), roughness: .1 }), [15.4, .42, -3.8], null, { cast: true });
for (const s of [1, -1]) for (const t of [1, -1]) add(new THREE.BoxGeometry(.03, .4, .03), BRASS, [15.4 + s * .62, .2, -3.8 + t * .28]);
add(new THREE.CylinderGeometry(.05, .07, .22, 16), new THREE.MeshPhysicalMaterial({ color: '#e8eef5', roughness: .05, transparent: true, opacity: .35 }), [15.1, .555, -3.75]);
add(new THREE.CylinderGeometry(.045, .065, .1, 16), WHISKEY, [15.1, .5, -3.75]);
// floor lamp
add(new THREE.CylinderGeometry(.012, .012, 1.6, 8), BRASS, [17.4, .8, -3.8]);
add(new THREE.CylinderGeometry(.16, .24, .3, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#d9b98a', emissive: '#ffb066', emissiveIntensity: .9, side: THREE.DoubleSide }), [17.4, 1.65, -3.8]);
{ const l = new THREE.PointLight('#ffb066', 6, 6, 2); l.position.set(17.4, 1.5, -3.8); scene.add(l); }
pendant(15.4, -3.8, 3.7, true, '#ffbd7a', 11);
// the bar
add(new THREE.BoxGeometry(6, 1.0, .5), new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#100c09'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 12) { g.fillStyle = 'rgba(200,150,80,.18)'; g.fillRect(x, 0, 2, h); } }, [6, 1]), roughness: .5 }), [15.6, .5, -9.5], null, { cast: true });
add(new THREE.BoxGeometry(6.2, .05, .8), new THREE.MeshStandardMaterial({ map: marbleTex('#0b0b0d', '200,195,185', [3, 1]), roughness: .08 }), [15.6, 1.05, -9.45], null, { cast: true });
add(new THREE.BoxGeometry(6.2, .02, .02), BRASS, [15.6, 1.03, -9.05]);
add(new THREE.BoxGeometry(6, .03, .03), BRASS, [15.6, .2, -9.22]);
// back bar: mirror, backlit shelves, bottles
add(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 1, roughness: .06 }), [15.6, 2.0, FLOOR.zMin + .03]);
add(new THREE.PlaneGeometry(6, .05), glow('#ffb066', 2.4), [15.6, 1.18, FLOOR.zMin + .04]);
export const bottleCols = ['#7a3d0e', '#2d4a1e', '#c9b48a', '#5a1010', '#9a5a14'];
for (const y of [1.25, 1.85]) {
  add(new THREE.BoxGeometry(6, .03, .3), BRASS, [15.6, y, FLOOR.zMin + .17]);
  add(new THREE.PlaneGeometry(6, .5), glow('#ff9a3a', .55), [15.6, y + .25, FLOOR.zMin + .035]);
  for (let x = 12.9; x < 18.4; x += .16 + rand() * .1) {
    const h = .22 + rand() * .12, m = new THREE.MeshPhysicalMaterial({ color: bottleCols[(rand() * bottleCols.length) | 0], roughness: .1, transparent: true, opacity: .85, emissive: '#3a1a04', emissiveIntensity: .4 });
    add(new THREE.CylinderGeometry(.035, .035, h, 12), m, [x, y + .015 + h / 2, FLOOR.zMin + .17]);
    add(new THREE.CylinderGeometry(.012, .02, .07, 8), m, [x, y + .015 + h + .035, FLOOR.zMin + .17]);
  }
}
// a downward spot, so its reflection on the polished floor stays under the bar
{ const l = new THREE.SpotLight('#ffb066', 22, 7, .75, .6, 2); l.position.set(15.6, 3.2, -9.0); l.target.position.set(15.6, 0, -9.0); scene.add(l, l.target); }
for (const x of [13.6, 14.8, 16.0]) {
  add(new THREE.CylinderGeometry(.21, .2, .07, 24), leather('#3a1710'), [x, .755, -8.65], null, { cast: true });
  add(new THREE.CylinderGeometry(.022, .022, .72, 10), CHROME, [x, .37, -8.65]);
  add(new THREE.CylinderGeometry(.2, .22, .03, 24), CHROME, [x, .015, -8.65]);
  const ring = new THREE.TorusGeometry(.17, .01, 8, 28); ring.rotateX(Math.PI / 2); add(ring, CHROME, [x, .3, -8.65]);
}
// pool table
{
  const T = new THREE.Group(); T.position.set(14.8, 0, 3.6); scene.add(T);
  add(new THREE.BoxGeometry(1.42, .06, 2.6), new THREE.MeshStandardMaterial({ color: '#0d3a33', roughness: .95 }), [0, .78, 0], null, { parent: T });
  for (const [w, d, x, z] of [[1.62, .12, 0, 1.36], [1.62, .12, 0, -1.36], [.12, 2.84, .77, 0], [.12, 2.84, -.77, 0]]) add(new THREE.BoxGeometry(w, .12, d), walnut, [x, .8, z], null, { parent: T, cast: true });
  add(new THREE.BoxGeometry(1.3, .52, 2.4), walnutDark, [0, .48, 0], null, { parent: T, cast: true });
  for (const s of [1, -1]) for (const t of [1, -1]) add(new THREE.BoxGeometry(.16, .26, .16), walnutDark, [s * .62, .12, t * 1.12], null, { parent: T });
  const ballCols = ['#f4f0e6', '#e8c22a', '#1e3fa8', '#c0201c', '#4a1a6a', '#e86a1a', '#1a6a3a', '#7a1a12', '#111'];
  ballCols.forEach((c, i) => add(new THREE.SphereGeometry(.028, 16, 12), new THREE.MeshPhysicalMaterial({ color: c, roughness: .15, clearcoat: 1 }), [(rand() - .5) * 1.1, .838, (rand() - .5) * 2.2], null, { parent: T, cast: true }));
  add(rod([-.3, .835, .9], [.25, .84, -.4], .007), cached('cue', () => new THREE.MeshStandardMaterial({ map: woodTex('#5a3a1e', [1, 6]), roughness: .4 })), null, null, { parent: T });
  add(new THREE.BoxGeometry(.3, .14, 1.9), new THREE.MeshStandardMaterial({ color: '#0f2a22', metalness: .6, roughness: .4 }), [0, 2.0, 0], null, { parent: T });
  add(new THREE.BoxGeometry(.26, .01, 1.84), glow('#fff0cf', 1.6), [0, 1.925, 0], null, { parent: T });
  for (const s of [1, -1]) add(new THREE.CylinderGeometry(.004, .004, FLOOR.h - 2.07, 6), BLACK, [0, (FLOOR.h + 2.07) / 2, s * .8], null, { parent: T });
  const l = new THREE.PointLight('#fff0cf', 7, 4, 2); l.position.set(0, 1.7, 0); T.add(l);
}
// high-top table by the window
add(new THREE.CylinderGeometry(.32, .32, .04, 28), new THREE.MeshStandardMaterial({ map: marbleTex('#0b0b0d', '200,195,185'), roughness: .1 }), [17.7, 1.06, 1.0], null, { cast: true });
add(new THREE.CylinderGeometry(.03, .03, 1.04, 10), BRASS, [17.7, .52, 1.0]);
add(new THREE.CylinderGeometry(.22, .24, .03, 24), BRASS, [17.7, .015, 1.0]);
add(G.glass, GLASSWARE, [17.62, 1.12, 1.05], [-Math.PI / 2, 0, 0]);
// war room, front right by the glass: where agent meetings will happen in Phase 2
export const WAR = [15.4, 14.2];
add(new THREE.PlaneGeometry(4.6, 7.2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 800, (g, w, h) => { g.fillStyle = '#100d0b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a6a34'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40); g.lineWidth = 2; g.strokeRect(36, 36, w - 72, h - 72); }), roughness: .95 }), [WAR[0], .005, WAR[1]], [-Math.PI / 2, 0, 0]);
add(new THREE.BoxGeometry(1.5, .05, 5.2), new THREE.MeshPhysicalMaterial({ color: '#23262d', roughness: .08, metalness: .45, clearcoat: 1 }), [WAR[0], .75, WAR[1]], null, { cast: true });
add(new THREE.BoxGeometry(1.54, .012, 5.24), BRASS, [WAR[0], .722, WAR[1]]);
for (const t of [1, -1]) add(new THREE.BoxGeometry(1.2, .72, .06), MATTE, [WAR[0], .36, WAR[1] + t * 2.2]);
for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const ch = CHAIR.clone(); ch.position.set(WAR[0] + s * 1.05, 0, WAR[1] - 1.8 + i * 1.2); ch.rotation.y = -s * Math.PI / 2; scene.add(ch); }
pendant(WAR[0], WAR[1] - 1.3, 3.9, true, '#ffcf99', 40); pendant(WAR[0], WAR[1] + 1.3, 3.9, true, '#ffcf99', 40);

// ============================================================================
// GAME ROOM, the west wing: an arcade on the back wall, two racing
// simulators facing the glass, a basketball half court in the front corner
// ============================================================================
// arcade: four cabinets with live pixel screens, under a neon sign
export const ARC_Z = FLOOR.zMin + .42, ARC_X = [-18.6, -17.4, -16.2, -15.0];
export const arcadeScreens = [];
export function arcadeScreen(col, kind) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 88; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const stars = Array.from({ length: 30 }, () => [rand() * 96, rand() * 88, .3 + rand()]);
  const foes = Array.from({ length: 4 * (2 + kind % 2) }, (_, i) => [10 + (i % 4) * 20, 10 + Math.floor(i / 4) * 11]);
  let f = kind * 40;
  const draw = () => {
    f++;
    g.fillStyle = '#020108'; g.fillRect(0, 0, 96, 88);
    for (const s of stars) { s[1] = (s[1] + s[2]) % 88; g.fillStyle = '#4a4a5c'; g.fillRect(s[0] | 0, s[1] | 0, 1, 1); }
    const dx = Math.sin(f * .07) * 8, dy = (f * .05) % 6;
    g.fillStyle = col;
    for (const [x, y] of foes) { g.fillRect(x + dx, y + dy, 8, 4); g.fillRect(x + dx + 1, y + dy + 4, 2, 2); g.fillRect(x + dx + 5, y + dy + 4, 2, 2); }
    const px = 43 + Math.sin(f * .045 + kind) * 32;
    g.fillStyle = '#ffffff'; g.fillRect(px, 78, 10, 4); g.fillRect(px + 4, 75, 2, 3);
    g.fillRect(px + 4, 70 - (f * 5) % 44, 1, 4);
    g.fillStyle = col; for (let i = 0; i < 5; i++) g.fillRect(4 + i * 6, 2, 4, 3);
    tex.needsUpdate = true;
  };
  draw(); return { tex, draw };
}
{
  const cabBody = new THREE.MeshPhysicalMaterial({ color: '#0a0a0d', roughness: .25, clearcoat: 1, clearcoatRoughness: .1 });
  const cabGeo = sideExtrude([[-.34, 0], [.3, 0], [.3, .82], [.44, .92], [.4, .98], [.2, .98], [.1, 1.62], [.22, 1.68], [.22, 1.92], [-.34, 1.92]], .72, .01);
  [['Neon Run', '#ff3fa4'], ['Star Lane', '#39d7ff'], ['Turbo 99', '#ffcc33'], ['Pixel King', '#7dff6a']].forEach(([title, col], i) => {
    const g = new THREE.Group(); g.position.set(ARC_X[i], 0, ARC_Z); scene.add(g);
    add(cabGeo, cabBody, null, null, { cast: true, parent: g });
    for (const s of [1, -1]) add(new THREE.BoxGeometry(.008, 1.7, .012), glow(col, 2.4), [s * .372, .96, .2], null, { parent: g, receive: false });
    const scr = arcadeScreen(col, i); arcadeScreens.push(scr);
    add(new THREE.PlaneGeometry(.56, .52), new THREE.MeshBasicMaterial({ map: scr.tex, color: new THREE.Color(1.5, 1.5, 1.5) }), [0, 1.3, .162], [-.155, 0, 0], { parent: g, receive: false });
    const mq = textPlane(title, .64, .2, col, { size: 120, spacing: 6, border: false, bg: '#07050a', k: 1.7 }); mq.position.set(0, 1.8, .224); g.add(mq);
    add(new THREE.CylinderGeometry(.008, .008, .07, 8), CHROME, [-.17, 1.015, .3], null, { parent: g });
    add(new THREE.SphereGeometry(.022, 14, 10), glow(col, 1.2), [-.17, 1.06, .3], null, { parent: g });
    ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ff3fa4', '#ffffff'].forEach((bc, b) => add(new THREE.CylinderGeometry(.018, .018, .014, 14), glow(bc, 1.4), [.04 + (b % 3) * .07, .99, .27 + Math.floor(b / 3) * .06], null, { parent: g }));
  });
  const sign = textPlane('Arcade', 2.6, .5, '#ff3fa4', { size: 150, spacing: 40, border: false, bg: 'rgba(0,0,0,0)', k: 2.2 }); sign.position.set(-16.8, 2.75, FLOOR.zMin + .06); scene.add(sign);
  add(new THREE.BoxGeometry(2.4, .02, .02), glow('#39d7ff', 2.4), [-16.8, 2.42, FLOOR.zMin + .06], null, { receive: false });
  const l = new THREE.PointLight('#ff4fb0', 4, 7, 2); l.position.set(-16.8, 2.4, FLOOR.zMin + 1.6); scene.add(l);
  add(new THREE.PlaneGeometry(5.6, 2.6), new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#07060b'; g.fillRect(0, 0, w, h); const cols = ['#ff3fa4', '#39d7ff', '#ffcc33', '#7dff6a'];
    for (let i = 0; i < 260; i++) { g.globalAlpha = .3; g.fillStyle = cols[i % 4]; const x = rand() * w, y = rand() * h; if (i % 3) g.fillRect(x, y, 7, 2); else { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }
    g.globalAlpha = 1; g.strokeStyle = '#ff3fa4'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  }), roughness: .95 }), [-16.8, .005, FLOOR.zMin + 1.65], [-Math.PI / 2, 0, 0]);
}

// racing simulators: a bucket seat, a wheel and pedals on an aluminum rig, three screens
export const road = (() => {
  const c = document.createElement('canvas'); c.width = 384; c.height = 128; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const hz = 54;
  const draw = (t) => {
    const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#05060c'); sky.addColorStop(1, '#4a2a14'); g.fillStyle = sky; g.fillRect(0, 0, 384, hz);
    g.fillStyle = '#0b0b10'; for (let i = 0; i < 26; i++) { const w = 10 + (i * 37) % 23, h = 8 + (i * 53) % 30; g.fillRect(((i * 16 - t * 6) % 416 + 416) % 416 - 16, hz - h, w, h); }
    g.fillStyle = '#0d0f0c'; g.fillRect(0, hz, 384, 128 - hz);
    const curve = Math.sin(t * .4) * 46;
    for (let y = hz; y < 128; y += 2) {
      const k = (y - hz) / (128 - hz), half = 8 + k * 200, cx = 192 + curve * (1 - k) * (1 - k), band = Math.floor(3 / (k + .05) + t * 14) % 2;
      g.fillStyle = '#26272b'; g.fillRect(cx - half, y, half * 2, 2);
      g.fillStyle = band ? '#c8202a' : '#e8e8e8'; g.fillRect(cx - half - k * 14, y, k * 14, 2); g.fillRect(cx + half, y, k * 14, 2);
      if (band) { g.fillStyle = '#f2f2f2'; g.fillRect(cx - k * 3, y, k * 6, 2); }
    }
    tex.needsUpdate = true;
  };
  draw(0); return { tex, draw };
})();
export const simRigs = [];
{
  const ALU = new THREE.MeshStandardMaterial({ color: '#1a1b1f', metalness: .8, roughness: .35 }), RED = glow('#e8242c', 1.6);
  const simMat = new THREE.MeshBasicMaterial({ map: road.tex, color: new THREE.Color(1.4, 1.4, 1.4) });
  const seatGeo = sideExtrude([[.2, .28], [.2, .4], [-.2, .36], [-.42, 1.02], [-.36, 1.12], [-.5, 1.1], [-.46, .3], [-.3, .22]], .5, .02);
  for (const [i, z] of [[0, -2.4], [1, 1.0]]) {
    const g = new THREE.Group(); g.position.set(-16.4, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
    for (const s of [1, -1]) { add(new THREE.BoxGeometry(.06, .06, 1.8), ALU, [s * .3, .03, .4], null, { parent: g }); add(new THREE.BoxGeometry(.006, .006, 1.7), RED, [s * .334, .03, .4], null, { parent: g, receive: false }); }
    for (const zz of [-.35, .55, 1.2]) add(new THREE.BoxGeometry(.66, .05, .06), ALU, [0, .03, zz], null, { parent: g });
    add(new THREE.BoxGeometry(.06, .3, .06), ALU, [0, .18, -.05], null, { parent: g });
    add(seatGeo, leather('#101012'), null, null, { cast: true, parent: g });
    for (const s of [1, -1]) add(rod([s * .24, .42, -.21], [s * .24, 1.04, -.42], .008, 6), RED, null, null, { parent: g });
    add(new THREE.BoxGeometry(.08, .62, .08), ALU, [0, .31, .7], [-.35, 0, 0], { parent: g });
    const wheel = new THREE.Group(); wheel.position.set(0, .78, .5); wheel.rotation.x = -.35; g.add(wheel);
    add(new THREE.TorusGeometry(.16, .016, 10, 36), leather('#141416'), null, null, { parent: wheel });
    add(new THREE.CylinderGeometry(.045, .045, .04, 20), CARBON, null, [Math.PI / 2, 0, 0], { parent: wheel });
    for (const a of [0, 2.3, -2.3]) add(rod([0, 0, 0], [Math.sin(a) * .155, -Math.cos(a) * .155, 0], .012, 6), ALU, null, null, { parent: wheel });
    add(new THREE.BoxGeometry(.04, .012, .02), RED, [0, .16, 0], null, { parent: wheel });
    for (const x of [-.1, 0, .1]) add(new THREE.BoxGeometry(.06, .1, .015), ALU, [x, .14, .98], [-.5, 0, 0], { parent: g });
    add(new THREE.BoxGeometry(.06, 1.0, .06), ALU, [0, .5, 1.42], null, { parent: g });
    add(new THREE.BoxGeometry(1.5, .05, .05), ALU, [0, 1.0, 1.38], null, { parent: g });
    for (const [x, zz, ry] of [[-.66, 1.12, Math.PI - .62], [0, 1.32, Math.PI], [.66, 1.12, Math.PI + .62]]) {
      const m = new THREE.Group(); m.position.set(x, 1.0, zz); m.rotation.y = ry; g.add(m);
      add(new THREE.BoxGeometry(.7, .42, .03), BLACK, [0, 0, -.016], null, { parent: m });
      add(new THREE.PlaneGeometry(.66, .38), simMat, [0, 0, .001], null, { parent: m, receive: false });
    }
    simRigs.push({ wheel, spot: 'sim-' + (i + 1) });
  }
  const l = new THREE.PointLight('#ffd2a8', 18, 8, 2); l.position.set(-16.6, 3.0, -.7); scene.add(l);
}

// basketball half court: ebony planks, gold lines, a glass backboard against the city
export const COURT = { x0: -19.5, x1: -11.9, z0: 9.6, z1: 19.5 }, HOOP = new V3(-15.7, 3.05, 18.22), FT_Z = 14.05;
{
  const W = COURT.x1 - COURT.x0, D = COURT.z1 - COURT.z0, px = 100;
  const X = x => (x - COURT.x0) * px, Z = z => (z - COURT.z0) * px;
  const tex = canvasTex(Math.round(W * px), Math.round(D * px), (g, w, h) => {
    g.fillStyle = '#24170e'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = `hsl(24,38%,${11 + rand() * 6}%)`; g.fillRect(x, 0, 7, h); for (let y = rand() * 180; y < h; y += 120 + rand() * 140) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 7, 1); } }
    const hx = X(HOOP.x), hz = Z(HOOP.z), base = Z(COURT.z1 - .1), ft = Z(FT_Z);
    g.fillStyle = 'rgba(214,178,94,.08)'; g.fillRect(X(HOOP.x - 1.8), ft, 3.6 * px, base - ft);
    g.strokeStyle = '#d6b25e'; g.lineWidth = 5;
    g.strokeRect(X(COURT.x0 + .1), Z(COURT.z0 + .1), (W - .2) * px, (D - .2) * px);
    g.strokeRect(X(HOOP.x - 1.8), ft, 3.6 * px, base - ft);
    g.beginPath(); g.arc(hx, ft, 1.2 * px, Math.PI, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(hx, hz, 1.25 * px, Math.PI, Math.PI * 2); g.stroke();
    const cz = Math.sqrt(5.4 * 5.4 - 3.4 * 3.4);
    g.beginPath(); g.moveTo(X(HOOP.x - 3.4), base); g.lineTo(X(HOOP.x - 3.4), Z(HOOP.z - cz)); g.arc(hx, hz, 5.4 * px, Math.atan2(-cz, -3.4), Math.atan2(-cz, 3.4)); g.lineTo(X(HOOP.x + 3.4), base); g.stroke();
    g.beginPath(); g.arc(hx, Z(COURT.z0 + .1), 1.8 * px, 0, Math.PI); g.stroke();
    // the HQ mark at midcourt, upright for a player facing the hoop
    g.save(); g.translate(hx, Z(COURT.z0 + 1.0)); g.rotate(Math.PI); g.fillStyle = 'rgba(214,178,94,.85)'; g.font = '700 84px -apple-system,"Segoe UI",Inter,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HQ', 0, 0); g.restore();
  });
  add(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, roughness: .38 }), [(COURT.x0 + COURT.x1) / 2, .006, (COURT.z0 + COURT.z1) / 2], [-Math.PI / 2, 0, 0]);
  const post = [HOOP.x, 19.3], frame = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: .5 }), ORANGE = new THREE.MeshStandardMaterial({ color: '#e8571c', metalness: .5, roughness: .35 });
  add(new THREE.BoxGeometry(.6, .5, .5), BLACK, [post[0], .25, post[1]], null, { cast: true });
  add(new THREE.CylinderGeometry(.06, .07, 3.45, 16), BLACK, [post[0], 1.72, post[1]], null, { cast: true });
  add(rod([post[0], 3.35, post[1]], [post[0], 3.35, 18.66], .045, 10), BLACK);
  add(new THREE.BoxGeometry(1.8, 1.05, .025), new THREE.MeshPhysicalMaterial({ color: '#dfe8f0', transparent: true, opacity: .18, roughness: .05, depthWrite: false }), [HOOP.x, 3.42, 18.62], null, { receive: false });
  for (const [w, h, x, y] of [[1.8, .04, 0, .505], [1.8, .04, 0, -.505], [.04, 1.05, .88, 0], [.04, 1.05, -.88, 0], [.59, .03, 0, .08], [.59, .03, 0, -.37], [.03, .45, .295, -.145], [.03, .45, -.295, -.145]]) add(new THREE.BoxGeometry(w, h, .03), frame, [HOOP.x + x, 3.42 + y, 18.6]);
  const rim = new THREE.TorusGeometry(.23, .012, 10, 40); rim.rotateX(Math.PI / 2); add(rim, ORANGE, [HOOP.x, HOOP.y, HOOP.z]);
  add(new THREE.BoxGeometry(.06, .04, .16), ORANGE, [HOOP.x, HOOP.y - .01, 18.53]);
  const netTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 2; for (let x = -h; x < w + h; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); } });
  netTex.colorSpace = THREE.NoColorSpace;
  add(new THREE.CylinderGeometry(.23, .14, .42, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#e8e8e8', alphaMap: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }), [HOOP.x, HOOP.y - .21, HOOP.z], null, { receive: false });
  const l = new THREE.SpotLight('#ffe6c4', 150, 16, .95, .7, 2); l.position.set(HOOP.x, FLOOR.h - .1, 14.4); l.target.position.set(HOOP.x, 0, 14.6); scene.add(l, l.target);
}
export const ball = add(new THREE.SphereGeometry(.12, 28, 18), new THREE.MeshStandardMaterial({ roughness: .7, map: canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#c9541c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(rand() * w, rand() * h, 1, 1); }
  g.strokeStyle = '#1a0d06'; g.lineWidth = 3;
  for (const x of [0, w / 4, w / 2, w * 3 / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
}) }), null, null, { cast: true });
export const BALL_REST = new V3(-14.9, .12, 17.6); ball.position.copy(BALL_REST);
{ const l = new THREE.PointLight('#ffcf99', 50, 18, 2); l.position.set(-15.4, 4.4, 5.2); scene.add(l); } // warm fill down the games wing

// coffee station on the back wall
{
  const cx = 8.4, cz = FLOOR.zMin + .3;
  add(new THREE.BoxGeometry(1.6, .9, .55), walnutDark, [cx, .45, cz], null, { cast: true });
  add(new THREE.BoxGeometry(1.66, .04, .6), new THREE.MeshStandardMaterial({ map: marbleTex('#0b0b0d', '200,195,185'), roughness: .1 }), [cx, .92, cz]);
  add(new THREE.BoxGeometry(1.6, .02, .02), BRASS, [cx, .9, cz + .29]);
  add(new THREE.BoxGeometry(.56, .42, .4), CHROME, [cx - .25, 1.15, cz - .04], null, { cast: true });
  add(new THREE.BoxGeometry(.58, .05, .42), BLACK, [cx - .25, 1.385, cz - .04]);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(.03, .026, .07, 14), BLACK, [cx - .25 + s * .12, 1.0, cz + .2]);
  add(new THREE.BoxGeometry(.1, .018, .004), glow('#ffad42', 2.2), [cx - .25, 1.29, cz + .162]);
  for (let i = 0; i < 4; i++) add(G.mug, MUG, [cx + .28 + (i % 2) * .1, .99 + Math.floor(i / 2) * .1, cz - .05], [-Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(.07, .08, .32, 18), BLACK, [cx + .6, 1.1, cz - .06]);
  add(new THREE.PlaneGeometry(1.5, .04), glow('#ffb066', 1.4), [cx, 1.6, cz - .26]);
  const l = new THREE.PointLight('#ffc78a', 3.5, 4, 2); l.position.set(cx, 2.1, cz + .9); scene.add(l);
}
