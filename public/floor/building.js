// The room itself: the floor and its inlay, ceiling, stone wall, glass, columns, the ticker, Gotham outside and the video wall. Mockup lines 618-891 (add() lives in core.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './data.js';
import { clamp, rand, rad, scene, canvasTex, BRASS, glow, marbleTex, rod, add } from './core.js';

// ---------- room ----------
export const FLOOR = { x: 20, zMin: -12, zMax: 20, h: 5.6 };
export const GLASS_H = 4.7;
export const roomW = FLOOR.x * 2, roomD = FLOOR.zMax - FLOOR.zMin, roomZ = (FLOOR.zMax + FLOOR.zMin) / 2;
export const floorMat = new THREE.MeshStandardMaterial({ map: marbleTex('#09090b', '190,190,200', [10, 8], true), roughness: .14, metalness: 0 });
add(new THREE.PlaneGeometry(roomW, roomD), floorMat, [0, 0, roomZ], [-Math.PI / 2, 0, 0]);

// art deco sunburst inlay around the boss table
export const SEC_ANG = CONFIG.sections.map((_, i, a) => (i - (a.length - 1) / 2) * 31);
export const rays = [];
for (let i = 0; i <= SEC_ANG.length; i++) rays.push(SEC_ANG[0] - 15.5 + i * 31);
for (const a of [...rays, ...SEC_ANG]) {
  const r0 = 3.15, r1 = 4.95, g = new THREE.BoxGeometry(.035, .004, r1 - r0); g.translate(0, .003, (r0 + r1) / 2); g.rotateY(rad(a));
  add(g, BRASS, null, null, { receive: false });
}
for (const R of [3.1, 4.95]) { const g = new THREE.RingGeometry(R - .02, R + .02, 96, 1, rad(-93 - 90), rad(186)); g.rotateX(-Math.PI / 2); add(g, BRASS, [0, .003, 0]); }
export const medal = new THREE.CircleGeometry(3.05, 96); medal.rotateX(-Math.PI / 2);
add(medal, new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: .95 }), [0, .002, 0]);
for (const R of [2.95, 2.75]) { const g = new THREE.RingGeometry(R - .012, R + .012, 96); g.rotateX(-Math.PI / 2); add(g, BRASS, [0, .004, 0]); }

// ceiling and roof (hidden from above for overhead shots)
export const ceiling = new THREE.Group(); scene.add(ceiling);
add(new THREE.PlaneGeometry(roomW, roomD), new THREE.MeshStandardMaterial({ color: '#09090b', roughness: .9 }), [0, FLOOR.h, roomZ], [Math.PI / 2, 0, 0], { parent: ceiling });
add(new THREE.BoxGeometry(roomW + 1, .8, roomD + 1), new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: .8 }), [0, FLOOR.h + .4, roomZ], null, { parent: ceiling });
export const stripMat = glow('#ffe7c4', 2.0);
for (let z = -9; z <= 17; z += 4.33) add(new THREE.BoxGeometry(30, .025, .06), stripMat, [0, FLOOR.h - .02, z], null, { parent: ceiling, receive: false });

// back wall: dark stone with brass fins
export const stoneTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#121214'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rand() < .5 ? '255,255,255' : '0,0,0'},${rand() * .035})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, 0, 3, h); }
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, h / 2, w, 3);
}, [10, 1.4]);
export const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: .6 });
add(new THREE.PlaneGeometry(roomW, FLOOR.h), stoneMat, [0, FLOOR.h / 2, FLOOR.zMin]);
for (let x = -19.2; x <= 19.2; x += 1.6) {
  if (Math.abs(x) < 5.4 || Math.abs(x - 15.6) < 3.2 || Math.abs(x - 8.4) < 1.2 || Math.abs(x + 16.8) < 3.0) continue;
  add(new THREE.BoxGeometry(.05, FLOOR.h - .5, .08), BRASS, [x, FLOOR.h / 2, FLOOR.zMin + .05]);
}

// glass on three sides: Gotham all around
// forceSinglePass on the flat transparent panes (here, the clouds, the screens, the holo, the room glass and frost): three.js
// otherwise draws a transparent double-sided material twice, re-keying its program before each pass, and for a plane the
// camera sees one side anyway, so the pixels are the same and the room stops lagging at its normal height (Task 12 fix round 2)
export const glassMat = new THREE.MeshPhysicalMaterial({ color: '#a7b4c8', transparent: true, opacity: .06, roughness: .04, metalness: .2, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
export const steel = new THREE.MeshStandardMaterial({ color: '#141518', metalness: .75, roughness: .35 });
export const header = new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: .8 });
export function glassWall(len, place) {
  const g = new THREE.Group(); place(g); scene.add(g);
  add(new THREE.PlaneGeometry(len, GLASS_H), glassMat, [0, GLASS_H / 2, 0], null, { parent: g, receive: false });
  for (let x = -len / 2; x <= len / 2 + .01; x += len / Math.round(len / 3.2)) add(new THREE.BoxGeometry(.08, GLASS_H, .14), steel, [x, GLASS_H / 2, 0], null, { parent: g });
  add(new THREE.BoxGeometry(len, .14, .3), steel, [0, .07, 0], null, { parent: g });
  add(new THREE.BoxGeometry(len, .1, .16), steel, [0, GLASS_H, 0], null, { parent: g });
  add(new THREE.BoxGeometry(len, FLOOR.h - GLASS_H, .2), header, [0, (FLOOR.h + GLASS_H) / 2, 0], null, { parent: g });
  return g;
}
glassWall(roomW, g => g.position.set(0, 0, FLOOR.zMax));
glassWall(roomD, g => { g.position.set(FLOOR.x, 0, roomZ); g.rotation.y = Math.PI / 2; });
glassWall(roomD, g => { g.position.set(-FLOOR.x, 0, roomZ); g.rotation.y = Math.PI / 2; });

// columns: black marble, brass bands
export const colMarble = new THREE.MeshStandardMaterial({ map: marbleTex('#0c0c0e', '200,195,185'), roughness: .16 });
for (const x of [-11, 11]) for (const z of [-6.5, 9.5]) {
  add(new THREE.BoxGeometry(.9, FLOOR.h, .9), colMarble, [x, FLOOR.h / 2, z], null, { cast: true });
  for (const y of [.08, 1.2, FLOOR.h - .06]) add(new THREE.BoxGeometry(.96, y === 1.2 ? .03 : .14, .96), BRASS, [x, y, z]);
}

// LED ticker above the front glass. The canvas is one text unit wide so it tiles with no seam.
export const TICKER_FONT = '700 64px ui-monospace,SFMono-Regular,Consolas,monospace';
export function tickerDraw(text) {
  return (g, w, h) => {
    g.fillStyle = '#030201'; g.fillRect(0, 0, w, h);
    g.font = TICKER_FONT; g.textBaseline = 'middle';
    g.fillStyle = '#ffb000'; g.shadowColor = '#ff8a00'; g.shadowBlur = 12;
    g.fillText(text + '   ◆   ', 0, h / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,.6)';
    for (let i = 0; i < w; i += 4) g.fillRect(i, 0, 1, h);
    for (let j = 0; j < h; j += 4) g.fillRect(0, j, w, 1);
  };
}
export const tickerWidth = text => { const g = document.createElement('canvas').getContext('2d'); g.font = TICKER_FONT; return Math.ceil(g.measureText(text + '   ◆   ').width / 4) * 4; };
// what the ticker and the video wall count: live data through setCounts(), zero until the first payload. The counts are
// padded to two characters so the text keeps one width as they change (the canvas is cut to it once) and the tile stays seamless.
export const counts = { working: 0, idle: 0, rooms: CONFIG.sections.length };
const two = n => String(n).padStart(2, ' ');
export const tickerText = () => `THE PENTHOUSE   ◆   ${two(counts.working)} WORKING   ◆   ${two(counts.idle)} IDLE   ◆   ${counts.rooms} ROOMS   ◆   ALL EYES ON THE BOSS`;
export const RALLY_TEXT = "LET'S GO   ◆   THE FLOOR IS YOURS   ◆   EVERY AGENT ON THEIR FEET";
export const TICKER_W = Math.max(tickerWidth(tickerText()), tickerWidth(RALLY_TEXT));
export const ticker = canvasTex(TICKER_W, 96, tickerDraw(tickerText()), [Math.max(1, Math.round(((roomW - .4) / .36) / (TICKER_W / 96))), 1]);
ticker.wrapT = THREE.ClampToEdgeWrapping;
add(new THREE.PlaneGeometry(roomW - .4, .36), new THREE.MeshBasicMaterial({ map: ticker, color: new THREE.Color(1.5, 1.5, 1.5) }), [0, GLASS_H + .45, FLOOR.zMax - .12], [0, Math.PI, 0]);
export function redrawTicker(text) { const c = ticker.userData.canvas; tickerDraw(text)(c.getContext('2d'), c.width, c.height); ticker.needsUpdate = true; }

// ============================================================================
// GOTHAM: the city all around. One merged mesh, a custom shader for sodium haze,
// uplit crowns and lit windows. Plus sky, low clouds, searchlights and rain.
// ============================================================================
export const winTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#07080c'; g.fillRect(0, 0, w, h);
  const cols = ['#ffc46b', '#ffd89a', '#ffe9c4', '#ffb35a', '#ffd89a', '#c9d8ff'];
  for (let y = 2; y < h; y += 12) {
    const floorLit = rand() < .42;
    for (let x = 1; x < w; x += 7) if ((floorLit && rand() < .58) || rand() < .05) {
      g.globalAlpha = .3 + rand() * .6; g.fillStyle = cols[(rand() * cols.length) | 0]; g.fillRect(x, y, 5, 8);
    }
  }
  g.globalAlpha = 1;
}, [1, 1]);
export const cityParts = [];
export function cityAttrs(g, win, shade, crown, up) {
  const n = g.attributes.position.count, W = [], S = [], C = [], U = [];
  for (let k = 0; k < n; k++) { W.push(typeof win === 'function' ? win(k) : win); S.push(shade); C.push(crown); U.push(up); }
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(W, 1)); g.setAttribute('aShade', new THREE.Float32BufferAttribute(S, 1));
  g.setAttribute('aCrown', new THREE.Float32BufferAttribute(C, 1)); g.setAttribute('aUp', new THREE.Float32BufferAttribute(U, 1));
}
export function pushBox(w, h, d, x, y0, z, shade, crown, up) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, uo = rand(), vo = rand();
  for (let k = 0; k < uv.count; k++) { const f = (k / 4) | 0, ext = f < 2 ? d : w; uv.setXY(k, uv.getX(k) * ext / 48 + uo, uv.getY(k) * h / 95 + vo); }
  cityAttrs(g, k => { const f = (k / 4) | 0; return f === 2 || f === 3 ? 0 : 1; }, shade, crown, up);
  g.translate(x, y0 + h / 2, z); cityParts.push(g);
}
export function pushCone(r, h, x, y0, z, shade, up, sides = 4) {
  const g = new THREE.ConeGeometry(r, h, sides, 1); g.rotateY(Math.PI / 4); cityAttrs(g, 0, shade, y0 + h, up);
  g.translate(x, y0 + h / 2, z); cityParts.push(g);
}
export const BASE_Y = -240, tops = []; // the floor sits 240 m up: most of the city is below you
export function tower(x, z, w, d, h, hero) {
  const dist = Math.hypot(x, z), shade = clamp(1.05 - (dist - 70) / 600, .4, 1.05);
  const tiers = hero ? 3 + (rand() < .5 ? 1 : 0) : rand() < .5 ? 1 : rand() < .65 ? 2 : 3;
  const hs = []; let rem = h;
  for (let i = 0; i < tiers; i++) { const th = i === tiers - 1 ? rem : rem * (.5 + rand() * .2); hs.push(th); rem -= th; }
  const crown = BASE_Y + h, up = hero ? 1 : .28;
  let y = BASE_Y, cw = w, cd = d;
  hs.forEach(th => { pushBox(cw, th, cd, x, y, z, shade, crown, up); y += th; cw *= .72 + rand() * .1; cd *= .72 + rand() * .1; });
  let topY = y;
  if (hero) {
    const ch = 16 + rand() * 26; pushCone(Math.min(cw, cd) * .66, ch, x, y, z, shade, up); topY = y + ch;
    if (rand() < .7) { const sh = 24 + rand() * 40; pushCone(.9, sh, x, y + ch * .6, z, shade, up, 6); topY = y + ch * .6 + sh; }
    for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pushCone(.8, 10 + rand() * 8, x + fx * cw * .46, y, z + fz * cd * .46, shade, up, 4);
  } else if (rand() < .3) { const ch = 5 + rand() * 12; pushCone(Math.min(cw, cd) * .6, ch, x, y, z, shade, up); topY = y + ch; }
  tops.push({ x, z, top: topY });
}
// our own tower under the floor, seen on the intro fly-in
pushBox(roomW + 1, -BASE_Y, roomD + 1, 0, BASE_Y - .5, roomZ, 1, 0, 0);
for (let i = 0; i < 11; i++) {
  const a = (i / 11) * Math.PI * 2 + rand() * .3, d = 95 + rand() * 120;
  tower(Math.sin(a) * d, Math.cos(a) * d + roomZ, 24 + rand() * 12, 24 + rand() * 12, 200 + rand() * 150, true);
}
// near blocks stay low so the view runs over them to the far skyline
for (let i = 0; i < 460; i++) {
  const a = rand() * Math.PI * 2, d = 100 + Math.pow(rand(), .6) * 490, near = clamp((d - 90) / 260, .3, 1);
  tower(Math.sin(a) * d, Math.cos(a) * d + roomZ, 9 + rand() * 18, 9 + rand() * 18, (60 + Math.pow(rand(), 1.8) * 300) * near, false);
}
export const towerMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: winTex }, haze: { value: new THREE.Color('#4a2f18') }, hazeHigh: { value: new THREE.Color('#16141a') }, uplight: { value: new THREE.Color('#ffb36b') }, stone: { value: new THREE.Color('#121216') } },
  vertexShader: `
    attribute float aWin; attribute float aShade; attribute float aCrown; attribute float aUp;
    varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vWin; varying float vShade; varying float vCrown; varying float vUp;
    void main() {
      vUv = uv; vWin = aWin; vShade = aShade; vCrown = aCrown; vUp = aUp; vN = normal;
      vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform sampler2D map; uniform vec3 haze; uniform vec3 hazeHigh; uniform vec3 uplight; uniform vec3 stone;
    varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vWin; varying float vShade; varying float vCrown; varying float vUp;
    void main() {
      float lam = .4 + .6 * clamp(dot(normalize(vN), normalize(vec3(.25, .35, -.9))) * .5 + .5, 0., 1.);
      vec3 tex = texture2D(map, vUv).rgb;
      float lit = smoothstep(.06, .3, dot(tex, vec3(.3, .59, .11))) * vWin;
      vec3 c = mix(stone * lam, tex, lit);
      float crown = smoothstep(vCrown - 40., vCrown, vW.y) * vUp;
      c += uplight * crown * .35 * (1. - lit);
      c *= vShade;
      float d = length(vW.xz);
      float f = smoothstep(50., 540., d);
      float low = 1. - smoothstep(-240., 10., vW.y);
      c = mix(c, mix(hazeHigh, haze, low), clamp(f * .8 + low * .6, 0., .95));
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
});
add(mergeGeometries(cityParts), towerMat, null, null, { receive: false });
export const beacons = [];
tops.sort((a, b) => b.top - a.top).slice(0, 16).forEach(t => {
  const m = add(new THREE.SphereGeometry(.8, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .25, .2), fog: false }), [t.x, t.top + .6, t.z], null, { receive: false });
  m.userData.phase = rand() * 6; beacons.push(m);
});
// sky dome: dark above, sodium-orange smog at the horizon
export const skyTex = canvasTex(16, 1024, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#020306'); gr.addColorStop(.3, '#05070c'); gr.addColorStop(.44, '#121117'); gr.addColorStop(.49, '#3a2716'); gr.addColorStop(.52, '#2a1b10'); gr.addColorStop(.6, '#0d0906'); gr.addColorStop(1, '#050403');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
add(new THREE.SphereGeometry(1900, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }), [0, 0, 0], null, { receive: false });
// low cloud deck, lit from below by the city
export const cloudTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = rand() * w, y = rand() * h, r = 20 + Math.pow(rand(), 2) * 160, a = .03 + rand() * .09;
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
}, [3, 3]);
cloudTex.colorSpace = THREE.NoColorSpace;
export const clouds = add(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ color: '#7a4a28', alphaMap: cloudTex, transparent: true, opacity: .95, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true }), [0, 230, 0], [Math.PI / 2, 0, 0], { receive: false });
// searchlights sweeping the clouds (no logos, just light)
export const beamTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(.35, '#3a3a3a'); gr.addColorStop(.9, '#fff'); gr.addColorStop(1, '#888'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
beamTex.colorSpace = THREE.NoColorSpace;
export const beamGeo = (() => { const g = new THREE.CylinderGeometry(15, .8, 430, 24, 1, true); g.translate(0, 215, 0); return g; })();
export const beams = [];
for (let i = 0; i < 5; i++) {
  const a = rad(-70 + i * 35 + (rand() - .5) * 14), d = 190 + rand() * 200;
  const pivot = new THREE.Group(); pivot.position.set(Math.sin(a) * d, BASE_Y, Math.cos(a) * d + roomZ); scene.add(pivot);
  const tilt = new THREE.Group(); tilt.rotation.z = .3 + rand() * .25; pivot.add(tilt);
  add(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff1d6', alphaMap: beamTex, transparent: true, opacity: .04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), null, null, { receive: false, parent: tilt });
  // base yaw leans the beam away from the room; the sweep stays within +-0.6 rad of it
  pivot.userData = { base: a + Math.PI / 2, speed: .12 + rand() * .1, phase: rand() * 6 }; pivot.rotation.y = pivot.userData.base; beams.push(pivot);
}
// rain outside the glass
export const rainGeo = (() => {
  const P = [], O = [], Sg = [];
  let n = 0;
  while (n < 2800) {
    const x = (rand() - .5) * 170, z = roomZ + (rand() - .5) * 170;
    if (Math.abs(x) < FLOOR.x + .6 && z > FLOOR.zMin - .6 && z < FLOOR.zMax + .6) continue;
    const y = rand() * 70, o = rand() * 70;
    P.push(x, y, z, x + .06, y, z + .02); O.push(o, o); Sg.push(0, 1); n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aOff', new THREE.Float32BufferAttribute(O, 1)); g.setAttribute('aSeg', new THREE.Float32BufferAttribute(Sg, 1));
  return g;
})();
export const rainMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aOff; attribute float aSeg; uniform float uTime; varying float vA;
    void main() { vec3 p = position; float y = mod(aOff - uTime * 21., 70.) - 32.; p.y = y - aSeg * 1.1; vA = 1. - aSeg * .8;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(vec3(.55, .6, .7) * .32 * vA, 1.); }`,
});
export const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; scene.add(rainLines);

// video wall behind the boss's desk
export const wallCanvasTex = canvasTex(2048, 728, () => {});
export function drawVideoWall(rally) {
  const c = wallCanvasTex.userData.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
  const gr = g.createRadialGradient(w * .3, h * .45, 40, w * .3, h * .45, w * .8);
  gr.addColorStop(0, '#0d1424'); gr.addColorStop(1, '#030409'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
  g.font = `200 ${rally ? 210 : 280}px -apple-system,"Segoe UI",Inter,sans-serif`;
  g.fillText(rally ? "LET'S GO" : 'HQ', 110, 400);
  g.fillStyle = '#d6b25e'; g.font = '600 44px -apple-system,"Segoe UI",Inter,sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '12px';
  g.fillText(rally ? 'THE FLOOR IS YOURS' : 'ALL HANDS ON DECK', 118, 500);
  if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
  const stats = [[counts.working, 'WORKING'], [counts.idle, 'IDLE'], [counts.rooms, 'ROOMS']];
  stats.forEach(([n, l], i) => {
    const x = 1180 + i * 290;
    g.fillStyle = '#ffffff'; g.font = '200 150px -apple-system,"Segoe UI",Inter,sans-serif'; g.fillText(String(n), x, 400);
    g.fillStyle = '#9a9aa3'; g.font = '600 26px -apple-system,"Segoe UI",Inter,sans-serif'; g.fillText(l, x + 4, 450);
  });
  wallCanvasTex.needsUpdate = true;
}
drawVideoWall(false);
add(new THREE.BoxGeometry(9.3, 3.5, .1), BRASS, [0, 2.75, FLOOR.zMin + .06]);
add(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshBasicMaterial({ map: wallCanvasTex, color: new THREE.Color(1.2, 1.2, 1.2) }), [0, 2.75, FLOOR.zMin + .12]);
for (let i = 0; i <= 12; i++) { const a = rad(-60 + i * 10); add(rod([Math.sin(a) * .3, 4.55 + Math.cos(a) * .3, FLOOR.zMin + .08], [Math.sin(a) * 1.0, 4.55 + Math.cos(a) * 1.0, FLOOR.zMin + .08], .012, 6), BRASS); }
// the rally takes the ticker and the wall for its run; counts that arrive meanwhile show when it ends
let rallying = false;
export function setRally(on) { rallying = on; drawVideoWall(on); redrawTicker(on ? RALLY_TEXT : tickerText()); }
export function setCounts(working, idle, rooms) {
  if (counts.working === working && counts.idle === idle && counts.rooms === rooms) return;
  Object.assign(counts, { working, idle, rooms });
  if (rallying) return;
  redrawTicker(tickerText()); drawVideoWall(false);
}
