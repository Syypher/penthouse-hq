// A person: the shared body geometry, the arm poses and seats, buildPerson() and setPose(). Mockup lines 380-617.
import * as THREE from 'three';
import {
  V3, lerp, clamp, rand, canvasTex, cached, fabric, velvet, silk, skinMat, hairMat, leather, GOLD, CHROME, BLACK,
  GLOSS, WHITE, GLASSWARE, WHISKEY, EYE, MUG, COFFEE, glow, stripes, woodTex, DEPTH, TORSO, JACKET, JACKET_S, VEST,
  HIPS, rAt, frontZ, shell, ribbon, rod
} from './core.js';

// ---------- shared person geometry ----------
export const HIP_Y = .93, THIGH = .43, SHIN = .43;
export const suitGap = y => y < 1.03 ? lerp(.40, .05, clamp((y - .74) / .29, 0, 1)) : lerp(.05, .80, clamp((y - 1.03) / .42, 0, 1));
export const dbGap = y => y < 1.0 ? lerp(.30, .03, clamp((y - .74) / .26, 0, 1)) : lerp(.03, .62, clamp((y - 1.0) / .45, 0, 1));
export const openGap = y => lerp(.62, .92, clamp((y - .74) / .78, 0, 1));
export const vestGap = y => y < 1.06 ? .05 : lerp(.05, .70, clamp((y - 1.06) / .34, 0, 1));
export const tieSamples = [];
for (const y of [1.0, 1.035, 1.07, 1.1, 1.14, 1.18, 1.22, 1.26, 1.3, 1.34, 1.38, 1.415, 1.445]) {
  const w = y < 1.035 ? lerp(0, .086, (y - 1.0) / .035) : lerp(.086, .044, (y - 1.035) / .41);
  tieSamples.push({ x: 0, y, z: frontZ(y) + .004, w });
}
export const strap = (x0, x1, y0, y1, w, pad) => {
  const s = []; for (let i = 0; i <= 12; i++) { const f = i / 12, y = lerp(y0, y1, f), x = lerp(x0, x1, f); s.push({ x, y, z: frontZ(y, x) + pad, w }); } return s;
};
export const capGeo = (r, th) => new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, th);
export const blobTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(.55, '#777'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
export const BLOB = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: blobTex, transparent: true, opacity: .6, depthWrite: false });
export const G = {
  thigh: (() => { const g = new THREE.CylinderGeometry(.088, .07, THIGH, 24); g.translate(0, -THIGH / 2, 0); return g; })(),
  kneeCap: new THREE.SphereGeometry(.069, 20, 14),
  shin: (() => { const g = new THREE.CylinderGeometry(.066, .05, SHIN, 22); g.translate(0, -SHIN / 2, 0); return g; })(),
  shoe: (() => { const g = new THREE.CapsuleGeometry(.047, .16, 6, 16); g.rotateX(Math.PI / 2); g.scale(1, .62, 1); return g; })(),
  hips: shell(HIPS, null), torso: shell(TORSO, null), vest: shell(VEST, vestGap),
  jacket: shell(JACKET, suitGap), jacketDB: shell(JACKET, dbGap), jacketOpen: shell(JACKET, openGap),
  jacketS: shell(JACKET_S, suitGap), jacketDBS: shell(JACKET_S, dbGap), jacketOpenS: shell(JACKET_S, openGap),
  belt: (() => { const g = new THREE.CylinderGeometry(.165, .165, .042, 48, 1, true); g.scale(1, 1, DEPTH); g.translate(0, .965, 0); return g; })(),
  buckle: new THREE.BoxGeometry(.046, .032, .008),
  tie: ribbon(tieSamples), knot: new THREE.BoxGeometry(.044, .04, .026),
  suspL: ribbon(strap(.072, .072, .965, 1.44, .022, .004)), suspR: ribbon(strap(-.072, -.072, .965, 1.44, .022, .004)),
  lanL: ribbon(strap(.012, .062, 1.24, 1.47, .012, .008)), lanR: ribbon(strap(-.012, -.062, 1.24, 1.47, .012, .008)),
  card: new THREE.BoxGeometry(.056, .084, .004), cardBand: new THREE.BoxGeometry(.056, .016, .005),
  collar: new THREE.CylinderGeometry(.064, .074, .05, 32, 1, true), turtle: new THREE.CylinderGeometry(.062, .072, .1, 32, 1, true),
  neck: new THREE.CylinderGeometry(.05, .056, .16, 24),
  skull: new THREE.SphereGeometry(.1, 44, 30), jaw: new THREE.SphereGeometry(.082, 32, 20),
  nose: new THREE.SphereGeometry(.02, 16, 12), ear: new THREE.SphereGeometry(.026, 16, 12),
  eye: new THREE.SphereGeometry(.012, 16, 12), brow: new THREE.BoxGeometry(.03, .0065, .008),
  shoulder: new THREE.SphereGeometry(.066, 24, 16), elbow: new THREE.SphereGeometry(.052, 20, 14),
  upper: (() => { const g = new THREE.CylinderGeometry(.06, .052, .3, 22); g.translate(0, -.15, 0); return g; })(),
  fore: (() => { const g = new THREE.CylinderGeometry(.052, .044, .26, 22); g.translate(0, -.13, 0); return g; })(),
  hand: new THREE.SphereGeometry(.046, 20, 14), cuff: new THREE.CylinderGeometry(.047, .047, .028, 22, 1, true),
  roll: new THREE.TorusGeometry(.056, .013, 10, 28), garter: new THREE.TorusGeometry(.061, .006, 8, 28), watch: new THREE.TorusGeometry(.048, .008, 10, 28),
  button: new THREE.SphereGeometry(.009, 10, 8),
  pocketSq: (() => { const s = new THREE.Shape(); s.moveTo(-.026, 0); s.lineTo(.026, 0); s.lineTo(.012, .03); s.lineTo(-.004, .02); s.lineTo(-.018, .032); s.closePath(); return new THREE.ShapeGeometry(s); })(),
  ring: new THREE.TorusGeometry(.024, .0035, 8, 28), lens: (() => { const g = new THREE.CylinderGeometry(.027, .027, .006, 24); g.rotateX(Math.PI / 2); return g; })(),
  band: new THREE.TorusGeometry(.126, .007, 8, 40, Math.PI), earcup: (() => { const g = new THREE.CylinderGeometry(.034, .034, .026, 24); g.rotateZ(Math.PI / 2); return g; })(),
  visorBand: new THREE.CylinderGeometry(.107, .107, .034, 32, 1, true, -1.3, 2.6),
  visorBrim: (() => { const g = new THREE.RingGeometry(.09, .2, 32, 1, Math.PI * 1.5 - 1.05, 2.1); g.rotateX(-Math.PI / 2); return g; })(),
  curl: new THREE.SphereGeometry(.027, 12, 10), bun: new THREE.SphereGeometry(.043, 20, 14),
  longHair: (() => { const g = new THREE.CapsuleGeometry(.07, .17, 8, 20); g.scale(1.3, 1, .6); return g; })(),
  mic: (() => { const h = new THREE.CylinderGeometry(.013, .017, .17, 16); h.rotateX(Math.PI / 2); h.translate(0, 0, .06); return h; })(),
  micHead: new THREE.SphereGeometry(.03, 20, 14), phone: new THREE.BoxGeometry(.072, .145, .009),
  glass: (() => { const g = new THREE.CylinderGeometry(.036, .031, .085, 20); g.rotateX(Math.PI / 2); return g; })(),
  liquid: (() => { const g = new THREE.CylinderGeometry(.031, .029, .04, 20); g.rotateX(Math.PI / 2); g.translate(0, 0, -.018); return g; })(),
  cue: (() => { const g = new THREE.CylinderGeometry(.007, .014, 1.46, 10); g.translate(0, -.62, 0); return g; })(),
  mug: (() => { const g = new THREE.CylinderGeometry(.04, .036, .095, 22); g.rotateX(Math.PI / 2); return g; })(),
  mugHandle: (() => { const g = new THREE.TorusGeometry(.026, .007, 8, 16, Math.PI); g.rotateZ(-Math.PI / 2); g.rotateX(Math.PI / 2); g.translate(.038, 0, 0); return g; })(),
  coffee: (() => { const g = new THREE.CircleGeometry(.035, 22); g.translate(0, 0, .04); return g; })(),
  blob: (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; })(),
};
export const CAPS = { slick: [1.56, -.4, .106], short: [1.5, -.3, .106], buzz: [1.46, -.28, .103], bun: [1.52, -.36, .105], long: [1.66, -.3, .107], curly: [1.42, -.26, .106] };
export const CAP_GEO = Object.fromEntries(Object.entries(CAPS).map(([k, [th, , r]]) => [k, capGeo(r, th)]));

// arm pose = [swing (neg = forward), inward, spread (out), elbow (neg = bend)]
export const POSES = {
  down: { L: [.04, 0, .1, -.14], R: [.04, 0, .1, -.14] },
  pockets: { L: [.3, 0, .085, -.66], R: [.3, 0, .085, -.66], hideHands: true },
  crossed: { L: [-.42, .9, .16, -1.18], R: [-.34, .9, .16, -1.28] },
  clasped: { L: [-.22, .7, .05, -.72], R: [-.22, .7, .05, -.72] },
  phone: { L: [.04, 0, .1, -.14], R: [-.9, .5, .62, -2.45], prop: 'phone' },
  boss: { L: [-1.72, .22, .18, -.12], R: [-.6, .6, .38, -2.2], prop: 'mic' },
  type: { L: [-.5, .34, .1, -1.38], R: [-.5, .34, .1, -1.38] },
  drink: { L: [.06, 0, .1, -.22], R: [-.38, .42, .16, -1.6], prop: 'glass' },
  talkDrink: { L: [-.32, .32, .22, -1.15], R: [-.38, .42, .16, -1.6], prop: 'glass', talk: true },
  talkSeat: { L: [-.46, .4, .14, -1.15], R: [-.42, .3, .12, -1.0], talk: true },
  cue: { L: [-.16, .34, .08, -.7], R: [-.3, .3, .1, -1.0], prop: 'cue' },
  talk: { L: [-.32, .32, .22, -1.15], R: [.06, 0, .1, -.3], talk: true },
  walk: { L: [.03, 0, .09, -.28], R: [.03, 0, .09, -.28] },
  coffee: { L: [.04, 0, .1, -.16], R: [-.38, .42, .16, -1.6], prop: 'mug' },
  mugTalk: { L: [-.32, .32, .22, -1.15], R: [-.38, .42, .16, -1.6], prop: 'mug', talk: true },
  sleep: { L: [-.42, .66, .04, -.95], R: [-.42, .66, .04, -.95], sleep: true },
  throne: { L: [-.62, .08, .2, -.78], R: [-.62, .08, .2, -.78] },
  drive: { L: [-1.2, .32, .06, -.62], R: [-1.2, .32, .06, -.62] },
  arcade: { L: [-.92, .3, .08, -.55], R: [-.92, .3, .08, -.55] },
  shoot: { L: [.04, 0, .1, -.14], R: [.04, 0, .1, -.14] },
};
export const REACH = [-1.1, .22, .1, -.3];
export const SIP = [-.72, .6, .22, -2.3];
export const SHOT_SET = [-2.5, .42, .1, -1.55], SHOT_REL = [-2.9, .22, .08, -.15]; // ball over the forehead, then the release
// seated stance: body drop, hip and knee angles, torso lean (positive = forward)
export const SEATS = {
  desk: { off: -.435, hip: -1.53, knee: 1.38, lean: .12 },
  couch: { off: -.455, hip: -1.57, knee: 1.45, lean: -.2 },
  stool: { off: -.065, hip: -1.35, knee: 1.6, lean: .05 },
  throne: { off: -.41, hip: -1.5, knee: 1.42, lean: -.06 },
  sim: { off: -.45, hip: -1.35, knee: .45, lean: -.22 },
};

export const pickables = [];
export function buildPerson(agent) {
  const av = agent.avatar, ex = new Set(av.extras || []);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const upper = new THREE.Group(); upper.position.y = HIP_Y; body.add(upper);
  const top = new THREE.Group(); top.position.y = -HIP_Y; upper.add(top);
  const add = (parent, geo, mat, pos, rot, scl) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scl) m.scale.set(...scl);
    m.userData.agent = agent; parent.add(m); pickables.push(m); return m;
  };
  const sk = skinMat(av.skin);
  const shirt = av.turtleneck ? fabric(av.shirt, { rough: .94, sheen: .6 }) : fabric(av.shirt, { rough: .62, sheen: .25 });
  const pants = av.pinstripe ? stripes(av.pants, 22) : fabric(av.pants);
  const hasJacket = ['suit', 'double', 'blazer'].includes(av.top);
  const jacket = hasJacket ? (av.pinstripe ? stripes(av.jacket, 18) : av.velvet ? velvet(av.jacket) : fabric(av.jacket)) : null;
  const sleeve = hasJacket ? (av.pinstripe ? stripes(av.jacket, 24) : jacket) : shirt;

  const blob = new THREE.Mesh(G.blob, BLOB); blob.scale.set(.75, 1, .6); blob.position.y = .004; root.add(blob);

  // legs: hip, knee and ankle so a figure can stand, sit at a desk, on a couch or on a stool
  const legs = {};
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(s * .088, HIP_Y, 0); body.add(hip);
    add(hip, G.thigh, pants);
    const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
    add(knee, G.kneeCap, pants, null, null, [.98, .9, 1]);
    add(knee, G.shin, pants);
    add(knee, G.shoe, leather('#100b08'), [s * .004, -SHIN - .03, .045]);
    legs[s] = { hip, knee };
  }
  add(body, G.hips, pants);
  add(body, G.belt, leather('#17110c')); add(body, G.buckle, GOLD, [0, .965, .165 * DEPTH + .005]);

  add(top, G.torso, shirt);
  add(top, av.turtleneck ? G.turtle : G.collar, shirt, [0, av.turtleneck ? 1.515 : 1.492, 0]);
  if (av.tie && !av.turtleneck) { add(top, G.tie, silk(av.tie)); add(top, G.knot, silk(av.tie), [0, 1.462, frontZ(1.462) + .012]); }
  if (ex.has('suspenders')) { const m = fabric('#1a1a1c', { rough: .5 }); add(top, G.suspL, m); add(top, G.suspR, m); }
  if (av.top === 'vest') {
    add(top, G.vest, fabric(av.vest, { rough: .7, sheen: .45 }));
    for (const y of [1.0, 1.06, 1.12]) add(top, G.button, BLACK, [0, y, DEPTH * (rAt(TORSO, y) + .012) + .003]);
  }
  let jackL = null, jackS = null;
  if (hasJacket) {
    const k = av.top === 'blazer' ? 'jacketOpen' : av.top === 'double' ? 'jacketDB' : 'jacket';
    jackL = add(top, G[k], jacket); jackS = add(top, G[k + 'S'], jacket); jackS.visible = false;
    if (av.top === 'suit') add(top, G.button, BLACK, [0, 1.0, frontZ(1.0, 0, JACKET) + .002]);
    if (av.top === 'double') for (const [x, y] of [[-.05, .99], [.05, .99], [-.05, 1.07], [.05, 1.07]]) add(top, G.button, BLACK, [x, y, frontZ(y, x, JACKET) + .002]);
    if (ex.has('pocketSquare')) add(top, G.pocketSq, fabric('#f4f4f2', { rough: .5, sheen: .2 }), [.115, 1.285, frontZ(1.285, .115, JACKET) + .003], [0, .5, 0]);
  }
  if (ex.has('lanyard')) {
    const m = fabric('#0a84ff', { rough: .5 }); add(top, G.lanL, m); add(top, G.lanR, m);
    add(top, G.card, WHITE, [0, 1.2, frontZ(1.2) + (hasJacket ? .02 : .012)]); add(top, G.cardBand, glow('#0a84ff', 1.1), [0, 1.234, frontZ(1.2) + (hasJacket ? .021 : .013)]);
  }
  add(top, G.neck, sk, [0, 1.54, 0]);

  // head
  const head = new THREE.Group(); head.position.y = 1.6; head.rotation.order = 'YXZ'; top.add(head);
  add(head, G.skull, sk, [0, .12, 0], null, [.9, 1.12, 1]);
  add(head, G.jaw, sk, [0, .058, .016], null, [.92, .78, 1]);
  add(head, G.nose, sk, [0, .105, .097], [-.25, 0, 0], [.62, 1.15, .9]);
  for (const s of [1, -1]) add(head, G.ear, sk, [s * .089, .112, -.006], null, [.42, 1, .72]);
  // eyes and brows, so a face reads as a face from across the floor
  const brow = hairMat(av.hair[1], false);
  for (const s of [1, -1]) {
    add(head, G.eye, EYE, [s * .033, .127, .089], null, [1, .62, .45]);
    add(head, G.brow, brow, [s * .034, .149, .09], [-.12, 0, s * -.1]);
  }
  const [style, hcol] = av.hair;
  if (style !== 'bald') {
    const hm = hairMat(hcol, style === 'slick');
    const hg = new THREE.Group(); hg.position.set(0, .12, -.004); hg.rotation.x = CAPS[style][1]; hg.scale.set(.9, 1.12, 1); head.add(hg);
    add(hg, CAP_GEO[style], hm);
    if (style === 'curly') for (let i = 0; i < 34; i++) {
      const th = rand() * 1.3, ph = rand() * Math.PI * 2, r = .107;
      add(hg, G.curl, hm, [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]);
    }
    if (style === 'bun') add(head, G.bun, hm, [0, .205, -.078]);
    if (style === 'long') add(head, G.longHair, hm, [0, .03, -.058]);
  }
  if (ex.has('glasses')) {
    const fm = av.frames === 'gold' ? GOLD : BLACK;
    for (const s of [1, -1]) { add(head, G.ring, fm, [s * .037, .118, .101]); add(head, rod([s * .061, .12, .097], [s * .09, .12, .0], .0028), fm); }
    add(head, rod([-.013, .122, .104], [.013, .122, .104], .003), fm);
  }
  if (ex.has('sunglasses')) {
    for (const s of [1, -1]) { add(head, G.lens, GLOSS, [s * .037, .115, .101]); add(head, rod([s * .062, .118, .097], [s * .09, .118, .0], .003), BLACK); }
    add(head, rod([-.012, .12, .105], [.012, .12, .105], .004), BLACK);
  }
  if (ex.has('headset')) {
    add(head, G.band, BLACK, [0, .12, 0]);
    for (const s of [1, -1]) add(head, G.earcup, BLACK, [s * .1, .105, 0]);
    add(head, rod([.104, .085, .02], [.045, .05, .1], .004), BLACK); add(head, G.button, glow('#30d158', 1.4), [.045, .05, .1]);
  }
  if (ex.has('visor')) {
    const vm = cached('visor', () => new THREE.MeshPhysicalMaterial({ color: '#1f8a4c', transparent: true, opacity: .78, roughness: .3, side: THREE.DoubleSide }));
    add(head, G.visorBand, vm, [0, .19, 0], null, [.92, 1, 1.02]); add(head, G.visorBrim, vm, [0, .178, .02], [.32, 0, 0]);
  }
  if (ex.has('earpiece')) {
    const em = cached('ear', () => new THREE.MeshPhysicalMaterial({ color: '#cfd6dd', transparent: true, opacity: .6, roughness: .2 }));
    add(head, G.button, em, [-.095, .108, .004]); add(head, rod([-.094, .1, 0], [-.07, -.06, -.04], .0025), em);
  }

  // arms
  const arms = {};
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(s * .215, 1.405, 0); sh.rotation.order = 'YXZ'; top.add(sh);
    add(sh, G.shoulder, sleeve, [0, 0, 0], null, hasJacket ? [1.14, .92, 1.04] : [1, .9, 1]);
    add(sh, G.upper, sleeve);
    if (av.sleeves === 'garters') add(sh, G.garter, BLACK, [0, -.11, 0], [Math.PI / 2, 0, 0]);
    const el = new THREE.Group(); el.position.y = -.3; sh.add(el);
    const rolled = av.sleeves === 'rolled';
    add(el, G.elbow, rolled ? shirt : sleeve);
    add(el, G.fore, rolled ? sk : sleeve);
    if (rolled) add(el, G.roll, shirt, [0, -.02, 0], [Math.PI / 2, 0, 0]);
    else if (hasJacket) add(el, G.cuff, shirt, [0, -.262, 0]);
    if (s === 1 && ex.has('watch')) add(el, G.watch, av.watch === 'steel' ? CHROME : GOLD, [0, -.232, 0], [Math.PI / 2, 0, 0]);
    const hand = new THREE.Group(); hand.position.y = -.275; el.add(hand);
    add(hand, G.hand, sk, [0, -.048, .004], null, [.72, 1.12, .52]);
    arms[s] = { sh, el, hand };
  }
  const s = agent.scale || (.95 + rand() * .09); root.scale.setScalar(s);
  const P = { agent, root, body, upper, head, arms, legs, jackL, jackS, props: {}, phase: rand() * Math.PI * 2, headPos: new V3(), lookT: new V3() };
  P.addProp = (kind) => {
    const h = new THREE.Group(); arms[-1].hand.add(h); P.props[kind] = h;
    if (kind === 'mic') { add(h, G.mic, BLACK, [0, -.05, .0]); add(h, G.micHead, CHROME, [0, -.05, .15]); }
    if (kind === 'phone') add(h, G.phone, GLOSS, [.02, -.06, .03]);
    if (kind === 'glass') { add(h, G.glass, GLASSWARE, [0, -.07, .045]); add(h, G.liquid, WHISKEY, [0, -.07, .045]); }
    if (kind === 'cue') { add(h, G.cue, cached('cue', () => new THREE.MeshStandardMaterial({ map: woodTex('#5a3a1e', [1, 6]), roughness: .4 })), [0, -.05, .02]); }
    if (kind === 'mug') { add(h, G.mug, MUG, [0, -.07, .05]); add(h, G.mugHandle, MUG, [0, -.07, .05]); add(h, G.coffee, COFFEE, [0, -.07, .05]); }
  };
  return P;
}
// one prop per pose: the current pose's prop shows, every other one hides
export function setPose(P, name) {
  P.pose = POSES[name] || POSES.down; P.act = name;
  const hide = !!P.pose.hideHands; P.arms[1].hand.visible = !hide; P.arms[-1].hand.visible = !hide;
  if (P.pose.prop && !P.props[P.pose.prop]) P.addProp(P.pose.prop);
  for (const k in P.props) P.props[k].visible = k === P.pose.prop;
}
