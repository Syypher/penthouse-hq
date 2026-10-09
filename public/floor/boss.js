// The boss: the built-in figure, its walk between the table and the throne, and the rigged model that rides it, fetched from /assets/boss.glb. Mockup lines 1618-1704, except bossGo (stage.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './data.js';
import { V3, smooth, wrapAngle, scene, warmPrograms } from './core.js';
import { HIP_Y, SEATS, buildPerson, setPose } from './person.js';
import { DAIS_H, JET_Z } from './furniture.js';
import { BOSS_POS, BOSS_WALK, persons } from './rooms.js';
import { walkAlong } from './life.js';

export const boss = buildPerson(CONFIG.owner); setPose(boss, 'boss');
boss.root.position.copy(BOSS_POS); boss.root.scale.setScalar(1.03); scene.add(boss.root); persons.push(boss);
boss.where = 'Standing on the table';
Object.assign(boss, { state: 'stage', goal: 'stage', yaw: 0, sitW: 0, walkW: 0, stride: 0, seat: null, fixedLook: new V3() });
export const THRONE_SEAT = new V3(0, DAIS_H, JET_Z - 1.36), THRONE_STAND = new V3(0, DAIS_H, JET_Z - .92), DESK_GAZE = new V3(0, 1.3, 6);
export const TO_DESK = [[0, -.68, .78], [0, -1.08, 0], [2.65, -2.75, 0], [2.65, -3.6, DAIS_H], [2.65, JET_Z - .92, DAIS_H], [0, JET_Z - .92, DAIS_H]];
export const TO_STAGE = [[2.65, JET_Z - .92, DAIS_H], [2.65, -3.6, DAIS_H], [2.65, -2.75, 0], [0, -1.08, 0], [0, -.68, .78], [0, 0, .78]];
export function bossUpdate(dt) {
  const B = boss;
  if (B.state === 'rise') {
    B.sitW = Math.max(0, B.sitW - dt * 1.3); B.root.position.lerpVectors(THRONE_STAND, THRONE_SEAT, smooth(B.sitW));
    if (!B.sitW) { B.seat = null; B.path = TO_STAGE; B.pi = 0; B.segLen = 0; B.state = 'walk'; setPose(B, 'walk'); }
  } else if (B.state === 'walk') { if (walkAlong(B, dt, BOSS_WALK)) B.state = 'turn'; }
  else if (B.state === 'turn') {
    const d = wrapAngle(-B.yaw); B.yaw += d * Math.min(1, dt * 6);
    if (Math.abs(d) < .03) {
      B.yaw = 0;
      if (B.goal === 'desk') { B.state = 'sit'; B.seat = SEATS.throne; setPose(B, 'throne'); }
      else { B.state = 'stage'; setPose(B, 'boss'); B.where = 'Standing on the table'; }
    }
  } else if (B.state === 'sit') {
    B.sitW = Math.min(1, B.sitW + dt * 1.3); B.root.position.lerpVectors(THRONE_STAND, THRONE_SEAT, smooth(B.sitW));
    if (B.sitW === 1) { B.state = 'desk'; B.where = 'At your desk'; }
  }
  B.walkW = B.state === 'walk' ? Math.min(1, B.walkW + dt * 4) : Math.max(0, B.walkW - dt * 5);
  B.root.rotation.y = B.yaw;
  if (B.state === 'walk') B.fixedLook.set(B.root.position.x + Math.sin(B.yaw) * 3, 1.5 + B.root.position.y, B.root.position.z + Math.cos(B.yaw) * 3);
}

// The boss model: a rigged scan with three clips (walk, talk, sit) baked onto one skeleton.
// It rides the built-in figure, which stays hidden underneath as the click target. If the
// model is missing, or fails anywhere on the way in, the built-in figure simply shows.
export const fig = { mixer: null, acts: {}, cur: null, sitOff: new V3() };
export const FIG_H = 1.8, WALK_RATE = BOSS_WALK / .686; // the walk clip covers .686 m/s at normal speed (measured from its planted foot)
export function playFig(name, fade) {
  const a = fig.acts[name]; if (!a || fig.cur === a) return;
  a.reset().play(); if (fig.cur) a.crossFadeFrom(fig.cur, fade, false); fig.cur = a;
}
const modelFailed = e => console.warn('HQ: boss model failed to load, keeping the built-in figure', e);
// the model is optional: the server says whether assets/boss.glb exists, and without one the built-in figure stays, quietly
fetch('/api/assets').then(r => r.json()).then(a => a.boss ? fetch('/assets/boss.glb') : null).then(r => { if (!r) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(buf => buf && new GLTFLoader().parse(buf, '', async g => {
  // async, so a throw after the await below is a rejection nothing awaits: the try keeps it on the same warning as
  // the loader's own error path, and the figure takes the model only once nothing is left to throw
  try {
    const m = g.scene; m.updateMatrixWorld(true);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(m), s = FIG_H / (box.max.y - box.min.y);
    m.scale.multiplyScalar(s); m.position.y = -box.min.y * s;
    // the model lands after the room's own compile, so its skinned programs (and the shadow pass's skinned depth variant)
    // are compiled and linked before it joins the scene; drawn uncompiled, they were the first frame's longest link wait
    // in the round-2 profile (Task 12 fix round 2)
    await warmPrograms(m);
    const base = m.position.clone(), mixer = new THREE.AnimationMixer(m), bones = {}, acts = {};
    m.traverse(o => { if (o.isBone) bones[o.name] = o; });
    for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
    // seated, the clip's hips land where the built-in figure's hips sit on the throne
    const hips = m.getObjectByName('Hips'), hp = g.animations.find(c => c.name === 'sit').tracks.find(k => k.name === 'Hips.position').values;
    const hipW = new V3(hp[0], hp[1], hp[2]).applyMatrix4(hips.parent.matrixWorld).multiplyScalar(s).add(base);
    fig.sitOff.set(-hipW.x, HIP_Y + SEATS.throne.off - hipW.y, -hipW.z);
    Object.assign(fig, { model: m, base, mixer, bones, acts });
    boss.root.add(m); boss.body.visible = false;
    playFig(boss.state === 'stage' ? 'talk' : 'sit', 0);
  } catch (e) { modelFailed(e); }
}, modelFailed)).catch(modelFailed);
export function figUpdate(dt) {
  if (!fig.mixer) return;
  const st = boss.state;
  playFig(st === 'walk' || st === 'turn' ? 'walk' : st === 'stage' ? 'talk' : 'sit', st === 'sit' ? .8 : .45);
  fig.acts.walk.timeScale = WALK_RATE;
  fig.mixer.update(dt);
  const sit = fig.acts.sit, w = sit.isRunning() ? sit.getEffectiveWeight() : 0; // a clip that never played still reports full weight
  fig.model.position.copy(fig.base).addScaledVector(fig.sitOff, w);
  if (w) sitBack(w);
}
// The stock seated clip slouches over its knees; a boss sits back. After the clip poses him,
// tip the spine back and lift the head about his own left-right axis, by how seated he is.
export const SIT_BACK = [['Spine02', -.28], ['Spine01', -.24], ['Spine', -.18], ['neck', -.08], ['Head', -.1], ['LeftArm', .3], ['LeftForeArm', .4]];
export const qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), sideAx = new V3();
export function sitBack(w) {
  sideAx.set(Math.cos(boss.yaw), 0, -Math.sin(boss.yaw));
  for (const [n, a] of SIT_BACK) {
    const b = fig.bones[n]; b.parent.getWorldQuaternion(qp); qa.setFromAxisAngle(sideAx, a * w);
    b.quaternion.premultiply(qp).premultiply(qa).premultiply(qp.invert()); // a world-space turn, written back as local
  }
}
