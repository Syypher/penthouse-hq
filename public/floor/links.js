// Gold arcs from a session's desk to the desk of the job agent it delegated to, drawn while the
// delegation runs. A light travels each arc from the session to the agent; with reduced motion it rests mid-arc.
import * as THREE from 'three';
import { scene, REDUCED } from './core.js';
import { DESKS } from './rooms.js';

const GOLD = '#d6b25e';
const LINE = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: .6 });
const DOT_MAT = new THREE.MeshBasicMaterial({ color: GOLD });
const DOT = new THREE.SphereGeometry(.07, 12, 8);
const arcs = new Map(); // "sessionId>agentId" -> { line, dot, curve }

export function setLinks(links, deskOfSession) {
  const want = new Set();
  for (const l of links) {
    const from = deskOfSession(l.from), to = DESKS.find((D) => D.key === 'desk:' + l.to);
    if (!from || !to) continue; // a session past the 4 live seats has no desk to draw from
    const key = l.from + '>' + l.to;
    want.add(key);
    if (arcs.has(key)) continue;
    const a = new THREE.Vector3(from.x, 1.3, from.z), b = new THREE.Vector3(to.x, 1.3, to.z);
    const mid = a.clone().add(b).multiplyScalar(.5);
    mid.y = 1.3 + Math.min(4, a.distanceTo(b) * .25);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), LINE);
    const dot = new THREE.Mesh(DOT, DOT_MAT);
    curve.getPoint(.5, dot.position);
    scene.add(line, dot);
    arcs.set(key, { line, dot, curve });
  }
  for (const [key, A] of arcs)
    if (!want.has(key)) {
      scene.remove(A.line, A.dot);
      A.line.geometry.dispose();
      arcs.delete(key);
    }
}

export function tickLinks(t) {
  if (REDUCED) return;
  for (const A of arcs.values()) A.curve.getPoint((t * .35) % 1, A.dot.position);
}

export const linkCount = () => arcs.size;
