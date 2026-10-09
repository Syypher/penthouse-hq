// Furniture: the chair, desks and their screens, pendants and signs, then the boss's table, the dais, the jet desk and the throne. Mockup lines 892-1106.
import * as THREE from 'three';
import {
  clamp, rand, scene, ANISO, canvasTex, leather, BRASS, CHROME, BLACK, WHITE, glow, woodTex, marbleTex, rod, slab,
  poly, sideExtrude, add
} from './core.js';
import { FLOOR, ceiling } from './building.js';
import { shown, streaming, onStreaming } from '../streamer.js';

// ============================================================================
// FURNITURE
// ============================================================================
export const walnut = new THREE.MeshStandardMaterial({ map: woodTex('#1f120a', [1, 1], true), roughness: .28 });
export const walnutDark = new THREE.MeshStandardMaterial({ color: '#140c08', roughness: .5 });
export const shadowAll = g => { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
export function protoChair() {
  const g = new THREE.Group(), lea = leather('#0d0d10');
  const seat = new THREE.Mesh(slab(.5, .5, .08, .08, .02), lea); seat.rotation.x = -Math.PI / 2; seat.position.y = .36; g.add(seat);
  const back = new THREE.Mesh(slab(.46, .62, .07, .1, .02), lea); back.position.set(0, .78, -.26); back.rotation.x = -.1; g.add(back);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.022, .026, .26, 12), CHROME).translateY(.19));
  for (let i = 0; i < 5; i++) { const a = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .3), CHROME); a.rotation.y = i * Math.PI * 2 / 5; a.position.set(Math.sin(a.rotation.y) * .15, .05, Math.cos(a.rotation.y) * .15); g.add(a); }
  return shadowAll(g);
}
export const CHAIR = protoChair();
export const SCREEN_OFF = canvasTex(384, 240, (g, w, h) => { g.fillStyle = '#050607'; g.fillRect(0, 0, w, h); g.fillStyle = '#34373e'; g.font = '600 20px ui-monospace,Consolas,monospace'; g.fillText('OPEN SEAT', 20, 40); });
export const LOCKED = canvasTex(384, 240, (g, w, h) => { g.fillStyle = '#040506'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1c21'; g.fillRect(20, h - 30, w - 40, 2); });
export const screenMat = tex => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.4) });
export const OFF_MAT = new THREE.MeshBasicMaterial({ map: SCREEN_OFF, color: new THREE.Color(.9, .9, .9) });
export const LOCK_MAT = new THREE.MeshBasicMaterial({ map: LOCKED });
export function chartTex(title, accent) {
  return canvasTex(384, 240, (g, w, h) => {
    g.fillStyle = '#020605'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; for (let y = 70; y < h; y += 34) { g.beginPath(); g.moveTo(16, y); g.lineTo(w - 16, y); g.stroke(); }
    g.fillStyle = accent; g.font = '700 20px ui-monospace,SFMono-Regular,Consolas,monospace'; g.fillText(title.toUpperCase(), 18, 34);
    g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); let y = 170;
    for (let x = 18; x < w - 14; x += 8) { y = clamp(y + (rand() - .48) * 22, 80, 225); x === 18 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  });
}
export function rowsTex(title, accent) {
  return canvasTex(384, 240, (g, w, h) => {
    g.fillStyle = '#020605'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.font = '700 20px ui-monospace,SFMono-Regular,Consolas,monospace'; g.fillText(title.toUpperCase(), 18, 34);
    for (let r = 0; r < 6; r++) { const y = 62 + r * 28; g.globalAlpha = .55; g.fillRect(18, y, 50 + rand() * 140, 12); g.globalAlpha = .25; g.fillRect(230, y, 30 + rand() * 90, 12); }
    g.globalAlpha = 1;
  });
}
// An idle agent's "Away" screen. Its name obeys Streamer like a terminal title: drawn through shown() with
// the blur and redrawn when the mode flips. A label that is not a name (the live row's "Open seat") is drawn as is.
export const awayScreens = [];
export function awayTex(name, accent, isName = true) {
  const tex = canvasTex(384, 240, () => {}), c = tex.userData.canvas, g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#040506'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8e8ec'; g.font = '200 64px -apple-system,"Segoe UI",Inter,sans-serif'; g.fillText('Away', 22, 120);
    g.font = '600 18px -apple-system,"Segoe UI",Inter,sans-serif';
    g.save(); if (isName && streaming()) g.filter = 'blur(6px)'; g.fillStyle = accent; g.fillText(isName ? shown(name) : name, 24, 156); g.restore();
    g.fillStyle = '#ff453a'; g.fillText('Idle, no task', 24, 184);
    tex.needsUpdate = true;
  };
  draw(); if (isName) awayScreens.push(draw); return tex;
}
// A live terminal: rows of code-shaped blocks that scroll while the agent types. Its title line (an agent's
// name, a session's task) is drawn through shown() with the blur, so Streamer masks it.
export const terminals = [];
export function makeTerminal(title, accent) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 240; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = ANISO;
  const lines = [], line = () => { const ind = (rand() * 4) | 0, toks = []; let x = 16 + ind * 18; const n = 2 + (rand() * 4) | 0; for (let i = 0; i < n; i++) { const w = 14 + rand() * 60; toks.push([x, w, rand()]); x += w + 7; } return toks; };
  for (let i = 0; i < 12; i++) lines.push(line());
  const draw = () => {
    g.fillStyle = '#030605'; g.fillRect(0, 0, 384, 240);
    g.fillStyle = accent; g.font = '700 17px ui-monospace,SFMono-Regular,Consolas,monospace';
    g.save(); if (streaming()) g.filter = 'blur(6px)'; g.fillText(shown(T.title).toUpperCase(), 16, 26); g.restore();
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(16, 36, 352, 1);
    lines.forEach((toks, r) => toks.forEach(([x, w, k]) => { g.fillStyle = k < .35 ? accent : k < .75 ? 'rgba(235,235,240,.72)' : 'rgba(150,150,160,.45)'; g.fillRect(x, 48 + r * 15, Math.min(w, 368 - x), 8); }));
    const cy = 48 + 11 * 15; g.fillStyle = accent; g.fillRect(16, cy + 10, 9, 3);
    tex.needsUpdate = true;
  };
  const T = { title, mat: new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.4) }), next: 0, draw, step() { lines.shift(); lines.push(line()); draw(); } };
  draw(); // after T: draw reads T.title
  terminals.push(T); return T;
}
onStreaming(() => { terminals.forEach(T => T.draw()); awayScreens.forEach(d => d()); });
export function protoDesk(w) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, .05, .8), walnut); top.position.y = .745; g.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w, .014, .014), BRASS); edge.position.set(0, .745, .4); g.add(edge);
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.05, .72, .76), walnutDark); p.position.set(s * (w / 2 - .02), .36, 0); g.add(p); }
  const mod = new THREE.Mesh(new THREE.BoxGeometry(w - .08, .5, .03), walnutDark); mod.position.set(0, .45, -.3); g.add(mod);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(.44, .016, .14), BLACK); kb.position.set(0, .778, .2); g.add(kb);
  const ph = new THREE.Mesh(new THREE.BoxGeometry(.18, .07, .2), BLACK); ph.position.set(w / 2 - .2, .805, .08); g.add(ph);
  return shadowAll(g);
}
export const DESK = protoDesk(1.6), DESK_NARROW = protoDesk(1.25);
export const BEZEL = slab(.58, .36, .03, .016, .006), SCREEN = new THREE.PlaneGeometry(.54, .32);
export const BEZEL_N = slab(.42, .27, .03, .016, .006), SCREEN_N = new THREE.PlaneGeometry(.39, .24);
export function makeDesk(mats, narrow = false) {
  const g = (narrow ? DESK_NARROW : DESK).clone(), screens = [], pitch = narrow ? .4 : .56, turn = narrow ? .38 : .3;
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Group(); m.position.set((i - 1) * pitch, .77, -.24); m.rotation.y = -(i - 1) * turn;
    const b = new THREE.Mesh(narrow ? BEZEL_N : BEZEL, BLACK); b.position.y = .3; b.castShadow = true; m.add(b);
    const sc = new THREE.Mesh(narrow ? SCREEN_N : SCREEN, mats[i]); sc.position.set(0, .3, .022); m.add(sc); screens.push(sc);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .16, 8), CHROME); st.position.y = .08; m.add(st);
    g.add(m);
  }
  for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(.21, .002, .297), WHITE); p.position.set(-.5 + rand() * .3 + i * .7, .772 + i * .002, .12 + rand() * .1); p.rotation.y = (rand() - .5) * .8; p.receiveShadow = true; g.add(p); }
  return { g, screens };
}
export function pendant(x, z, y = 3.7, withLight = true, color = '#ffbd7a', power = 12) {
  add(new THREE.CylinderGeometry(.006, .006, FLOOR.h - y, 6), BLACK, [x, (FLOOR.h + y) / 2, z], null, { parent: ceiling });
  add(new THREE.CylinderGeometry(.1, .32, .26, 36, 1, true), new THREE.MeshStandardMaterial({ color: '#2a2216', metalness: .9, roughness: .35, side: THREE.DoubleSide }), [x, y, z]);
  add(new THREE.CircleGeometry(.3, 32), glow('#ffd29a', 1.3), [x, y - .125, z], [Math.PI / 2, 0, 0]);
  if (withLight) { const l = new THREE.PointLight(color, power, 10, 2); l.position.set(x, y - .3, z); scene.add(l); }
}
export function textPlane(text, w, h, color, { size = 92, spacing = 22, border = true, bg = '#060504', k = 1.15 } = {}) {
  const t = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (border) { g.strokeStyle = color; g.globalAlpha = .7; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20); g.globalAlpha = 1; }
    g.fillStyle = color; g.font = `600 ${size}px -apple-system,"Segoe UI",Inter,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (g.letterSpacing !== undefined) g.letterSpacing = spacing + 'px';
    g.fillText(text.toUpperCase(), W / 2 + spacing / 2, H / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(k, k, k), side: THREE.DoubleSide, transparent: !border, forceSinglePass: true }));
}

// ============================================================================
// THE BOSS: table in the middle; behind it, on a dais, the stealth-jet desk
// ============================================================================
// click targets: the table is the stage, the jet desk and throne are the office
export const stageParts = [];
export const walnutSatin = walnut.clone(); walnutSatin.roughness = .55; // the spotlight grazes this top; gloss turned it into a hot sheen
stageParts.push(add(new THREE.BoxGeometry(4.2, .07, 1.5), walnutSatin, [0, .745, 0], null, { cast: true }));
stageParts.push(add(new THREE.BoxGeometry(4.22, .016, 1.52), BRASS, [0, .705, 0]));
for (const s of [1, -1]) stageParts.push(add(new THREE.BoxGeometry(.7, .7, 1.1), walnutDark, [s * 1.45, .355, 0], null, { cast: true }));
for (let i = 0; i < 5; i++) { const p = add(new THREE.BoxGeometry(.21, .002, .297), WHITE, [(rand() - .5) * 3.4, .782, (rand() - .5) * 1.1]); p.rotation.y = rand() * 3; }

export const DAIS_H = .14, JET_Z = -5.0;
add(new THREE.BoxGeometry(6.6, DAIS_H, 4.2), new THREE.MeshStandardMaterial({ map: marbleTex('#0b0b0d', '190,190,200', [2, 1.3]), roughness: .12 }), [0, DAIS_H / 2, JET_Z - .4], null, { receive: true });
for (const [w, d, x, z] of [[6.64, .03, 0, JET_Z + 1.7], [6.64, .03, 0, JET_Z - 2.5], [.03, 4.24, 3.3, JET_Z - .4], [.03, 4.24, -3.3, JET_Z - .4]]) add(new THREE.BoxGeometry(w, .03, d), BRASS, [x, DAIS_H, z]);

export const carbonTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#09090b'; g.fillRect(0, 0, w, h);
  const s = 16;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const k = ((x / s + y / s) % 4) < 2;
    const gr = k ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
    gr.addColorStop(0, '#08080a'); gr.addColorStop(.5, k ? '#202126' : '#16171a'); gr.addColorStop(1, '#08080a');
    g.fillStyle = gr; g.fillRect(x + .5, y + .5, s - 1, s - 1);
  }
}, [2.5, 2.5]);
export const CARBON = new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: .36, metalness: .25, clearcoat: 1, clearcoatRoughness: .05, flatShading: true });
export const MATTE = new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: .5, metalness: .45, flatShading: true });
export const AMBER = glow('#ffad42', 2.4), AMBER_SOFT = glow('#ff8a2a', 1.4);
export const hexTex = (glowOnly) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = glowOnly ? '#000' : '#0a0a0c'; g.fillRect(0, 0, w, h);
  const r = 14, dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = -1; row * dy < h + r; row++) for (let col = -1; col * dx < w + dx; col++) {
    const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); } g.closePath();
    g.fillStyle = glowOnly ? '#fff' : '#020203'; g.fill();
  }
}, [2, 2]);
export const VENT = new THREE.MeshStandardMaterial({ map: hexTex(false), emissiveMap: hexTex(true), emissive: '#ff6a1a', emissiveIntensity: 1.3, roughness: .5, metalness: .6, side: THREE.DoubleSide });

export const jet = new THREE.Group(); jet.position.set(0, DAIS_H, JET_Z); scene.add(jet);
export let strobe;
{
  // delta-wing top with a sawtooth trailing edge, chamfered so every face catches light
  const PL = [[-.34, 1.02], [.34, 1.02], [1.98, -.04], [1.84, -.52], [1.06, -.24], [.62, -.64], [-.62, -.64], [-1.06, -.24], [-1.84, -.52], [-1.98, -.04]];
  const topGeo = new THREE.ExtrudeGeometry(poly(PL.map(([x, z]) => [x, -z])), { depth: .05, bevelEnabled: true, bevelThickness: .024, bevelSize: .032, bevelSegments: 1 });
  topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, .70, 0);
  add(topGeo, CARBON, null, null, { cast: true, parent: jet });
  // amber light lines along the leading edges and the nose
  const edge = (a, b, y, off, mat, r = .006) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, sgn = (nx * (a[0] + b[0]) + nz * (a[1] + b[1])) > 0 ? 1 : -1;
    add(rod([a[0] + nx * off * sgn, y, a[1] + nz * off * sgn], [b[0] + nx * off * sgn, y, b[1] + nz * off * sgn], r, 6), mat, null, null, { receive: false, parent: jet });
  };
  edge([.34, 1.02], [1.98, -.04], .725, .045, AMBER, .011); edge([-.34, 1.02], [-1.98, -.04], .725, .045, AMBER, .011);
  edge([-.34, 1.02], [.34, 1.02], .725, .045, AMBER, .011);
  edge([1.98, -.04], [1.84, -.52], .725, .045, AMBER_SOFT, .008); edge([-1.98, -.04], [-1.84, -.52], .725, .045, AMBER_SOFT, .008);
  edge([.42, .9], [1.9, -.04], .66, -.02, AMBER_SOFT, .014); edge([-.42, .9], [-1.9, -.04], .66, -.02, AMBER_SOFT, .014);
  // Y-shaped lamps on the nose
  for (const x of [-.17, .17]) {
    add(rod([x, .69, 1.062], [x, .716, 1.062], .004, 6), AMBER, null, null, { parent: jet });
    add(rod([x, .716, 1.062], [x - .04, .748, 1.058], .004, 6), AMBER, null, null, { parent: jet });
    add(rod([x, .716, 1.062], [x + .04, .748, 1.058], .004, 6), AMBER, null, null, { parent: jet });
  }
  // canted twin tail fins as legs, with glowing hex vents
  const finGeo = (() => { const g = new THREE.ExtrudeGeometry(poly([[-.62, 0], [.5, 0], [.16, .72], [-.48, .72]]), { depth: .05, bevelEnabled: true, bevelThickness: .014, bevelSize: .014, bevelSegments: 1 }); g.translate(0, 0, -.025); g.rotateY(-Math.PI / 2); return g; })();
  for (const s of [1, -1]) {
    const fin = add(finGeo, CARBON, [s * 1.24, 0, -.02], [0, 0, s * .3], { cast: true, parent: jet });
    add(new THREE.PlaneGeometry(.52, .26), VENT, [s * .042, .3, -.08], [0, s * Math.PI / 2, 0], { parent: fin });
  }
  add(new THREE.BoxGeometry(2.2, .06, .3), MATTE, [0, .42, -.04], null, { parent: jet });
  // smoked faceted canopy, lit from inside
  const canopy = new THREE.OctahedronGeometry(1, 0); canopy.scale(.26, .07, .5);
  add(canopy, new THREE.MeshPhysicalMaterial({ color: '#170d06', roughness: .06, metalness: .3, clearcoat: 1, emissive: '#5a2a08', emissiveIntensity: .7, flatShading: true }), [0, .776, .42], null, { parent: jet });
  // wingtip nav lights and a tail strobe
  add(new THREE.SphereGeometry(.02, 10, 8), glow('#ff2a1a', 3), [1.98, .725, -.06], null, { parent: jet });
  add(new THREE.SphereGeometry(.02, 10, 8), glow('#2aff6a', 3), [-1.98, .725, -.06], null, { parent: jet });
  strobe = add(new THREE.SphereGeometry(.018, 10, 8), glow('#ffffff', 4), [0, .74, -.69], null, { parent: jet });
  // hologram display and keyboard
  const holo = canvasTex(1024, 440, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,170,70,.5)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(255,170,70,.12)'; for (let x = 0; x < w; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = '#ffb35a'; g.lineWidth = 4; g.beginPath(); let y = 300; for (let x = 30; x < w - 30; x += 14) { y = clamp(y + (rand() - .45) * 34, 90, 380); x === 30 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    g.fillStyle = 'rgba(120,220,255,.75)'; for (let i = 0; i < 14; i++) g.fillRect(40 + i * 66, h - 40 - rand() * 90, 40, 6);
  });
  holo.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(1.3, .56), new THREE.MeshBasicMaterial({ map: holo, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, color: new THREE.Color(1.3, 1.3, 1.3) }), [0, 1.13, -.16], [-.12, 0, 0], { receive: false, parent: jet });
  add(new THREE.BoxGeometry(1.3, .016, .04), AMBER, [0, .79, -.16], null, { parent: jet });
  add(new THREE.BoxGeometry(.5, .014, .16), MATTE, [0, .785, -.42], null, { parent: jet });
}
// the throne: a faceted bucket seat in hex-quilted leather with amber stitching
export const quilt = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#0e0c0c'; g.fillRect(0, 0, w, h);
  const r = 20, dx = r * Math.sqrt(3), dy = r * 1.5;
  g.strokeStyle = 'rgba(214,140,50,.55)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
  for (let row = -1; row * dy < h + r; row++) for (let col = -1; col * dx < w + dx; col++) {
    const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy; g.beginPath();
    for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke();
  }
}, [5, 5]);
export const QUILT = new THREE.MeshPhysicalMaterial({ map: quilt, roughness: .45, clearcoat: .5, clearcoatRoughness: .3, flatShading: true });
export const throne = new THREE.Group(); throne.position.set(0, DAIS_H, JET_Z - 1.4); scene.add(throne);
add(sideExtrude([[.3, .4], [.3, .52], [-.16, .5], [-.24, 1.3], [-.2, 1.52], [-.36, 1.5], [-.38, .6], [-.26, .4]], .52, .016), QUILT, null, null, { cast: true, parent: throne });
for (const s of [1, -1]) {
  const b = add(sideExtrude([[.26, .4], [.3, .66], [-.1, .63], [-.2, 1.12], [-.32, 1.16], [-.38, .58], [-.26, .4]], .08, .01), MATTE, [s * .3, 0, 0], null, { cast: true, parent: throne });
  add(sideExtrude([[-.14, 1.3], [-.08, 1.5], [-.3, 1.55], [-.36, 1.3]], .07, .008), MATTE, [s * .22, 0, 0], null, { parent: throne });
  add(rod([s * .345, .66, .3], [s * .345, .63, -.1], .005, 6), AMBER_SOFT, null, null, { parent: throne });
}
add(new THREE.CylinderGeometry(.03, .036, .34, 12), CHROME, [0, .22, -.04], null, { parent: throne });
for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; add(rod([0, .05, -.04], [Math.sin(a) * .34, .03, -.04 + Math.cos(a) * .34], .022, 6), CHROME, null, null, { parent: throne }); }
