// The floor's engine: the renderer, scene, camera and post-processing, the shared textures, materials and geometry helpers, and add(), which puts a mesh into the scene. Mockup lines 196-379 and 621-624.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { container } from './data.js';

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const V3 = THREE.Vector3, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export let seed = 11;
export const rand = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const rad = d => d * Math.PI / 180;
// the room's clock: it stops while the room sleeps (sleptFor, from stage.js), so motion picks up where it left off
let slept = 0;
export const t0 = performance.now(), now = () => (performance.now() - t0 - slept) / 1000;
export const sleptFor = ms => { slept += ms; };

// ---------- renderer ----------
export const app = container;
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);
export const labels = new CSS2DRenderer();
labels.setSize(app.clientWidth, app.clientHeight);
labels.domElement.className = 'labels';
app.appendChild(labels.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#05060a');
scene.fog = new THREE.FogExp2('#0a0b10', 0.011);
// A program links on the driver's worker threads, but the first draw that needs it waits for that link on the main thread,
// and on a cold shader cache the first frame did exactly that for every program it met first (Task 12 fix rounds 1 and 2).
// warmPrograms(root) compiles root's materials the way they are drawn (a render target bound: any target keys a program
// with no tone mapping and linear output, as the composer's read buffer does for the first frame), plus the depth variants
// the shadow pass derives for root's casters (three.module.js getDepthMaterial: the mirrored side, map, alpha map, alpha
// test, skinning and morphs, drawn with no scene, so no fog), waits for the links, then touches each new program's first
// use (its uniform and attribute lookups, about 40 ms a program on this driver) one per animation frame. target is the
// scene whose lights and fog key the programs; the camera plays no part in a program's key.
const touched = new Set(), warmTarget = new THREE.WebGLRenderTarget(1, 1), warmCamera = new THREE.PerspectiveCamera();
const shadowSide = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
export async function warmPrograms(root, target = scene) {
  const depth = new THREE.Group(), seen = new Set();
  root.traverse(o => {
    if (!o.isMesh || !o.castShadow) return;
    for (const m of [].concat(o.material)) {
      const morph = !!o.geometry.morphAttributes.position, k = [m.side, m.shadowSide, !!m.map, !!m.alphaMap, m.alphaTest, !!o.isSkinnedMesh, morph].join();
      if (seen.has(k)) continue; seen.add(k);
      const d = new THREE.MeshDepthMaterial({ side: m.shadowSide ?? shadowSide[m.side], map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaTest });
      depth.add(o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, d) : new THREE.Mesh(o.geometry, d));
    }
  });
  renderer.setRenderTarget(warmTarget);
  const links = [renderer.compileAsync(root, warmCamera, target)];
  const fog = target.fog; target.fog = null; // compileAsync keys the programs synchronously, so the fog is back before anything draws
  links.push(renderer.compileAsync(depth, warmCamera, target));
  target.fog = fog;
  renderer.setRenderTarget(null);
  await Promise.all(links);
  // only linked programs: another call (the boss model's) may have programs still linking, and their own call touches them
  for (const p of renderer.info.programs) if (!touched.has(p) && p.isReady()) { touched.add(p); p.getUniforms(); await new Promise(requestAnimationFrame); }
}
export const pmrem = new THREE.PMREMGenerator(renderer);
// Reflections: a dark room, warm ceiling strips, and a sodium-orange city glow on three sides.
export const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: '#06070a', side: THREE.BackSide })));
for (const z of [-12, -4, 4, 12]) { const m = new THREE.Mesh(new THREE.BoxGeometry(30, .2, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.8, 2.6) })); m.position.set(0, 9, z); envScene.add(m); }
for (const [x, z, ry] of [[0, 30, 0], [30, 0, Math.PI / 2], [-30, 0, Math.PI / 2]]) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(.75, .45, .22), side: THREE.DoubleSide }));
  p.position.set(x, 1, z); p.rotation.y = ry; envScene.add(p);
}
// The reflections' own shaders (the GGX convolution above all) linked on the main thread inside fromScene, 0.6 to 1.1 s
// in the round-2 probes and the one link wait left in the build after the first frame's went (Task 12 fix round 2).
// PMREMGenerator makes them in _allocateTargets and draws them at once (vendored r186, three.module.js 2901 to 2938, a
// private method of a pinned copy), so they are allocated here first, compiled through warmPrograms on the generator's
// own plane and the glow's own materials, and only then drawn.
pmrem._setSize(256); pmrem._allocateTargets().dispose();
const pmremWarm = new THREE.Group();
for (const m of [pmrem._blurMaterial, pmrem._ggxMaterial]) pmremWarm.add(new THREE.Mesh(pmrem._lodMeshes[0].geometry, m));
await warmPrograms(pmremWarm, new THREE.Scene());
await warmPrograms(envScene, envScene);
scene.environment = pmrem.fromScene(envScene, 0.02).texture;
scene.environmentIntensity = 0.6;
// The reflections above are the costliest synchronous step of the build (close to a second on this GPU), so the page
// gets a frame back here before the rest of the room is built in the modules that follow (Task 12 fix round 1). A
// frame, not a timer: a hidden tab pauses the build like it pauses the room's own loop, instead of throttling it.
await new Promise(requestAnimationFrame);

export const camera = new THREE.PerspectiveCamera(42, app.clientWidth / app.clientHeight, 0.05, 2600);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 1.2; controls.maxDistance = 42; controls.maxPolarAngle = 1.55;

export const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(app.clientWidth, app.clientHeight), 0.6, 0.6, 0.78);
composer.addPass(bloom);
export const output = new OutputPass();
composer.addPass(output);

// ---------- textures + materials ----------
export const ANISO = renderer.capabilities.getMaxAnisotropy();
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.canvas = c;
  return t;
}
export const cache = new Map();
export const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
export const tint = (hex, to, k) => new THREE.Color(hex).lerp(new THREE.Color(to), k);
export const fabric = (hex, o = {}) => cached(`fab${hex}${o.rough}${o.sheen}`, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: o.rough ?? .8, sheen: o.sheen ?? .55, sheenRoughness: .6, sheenColor: tint(hex, '#ffffff', .32), side: THREE.DoubleSide }));
export const velvet = hex => cached('vel' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: .92, sheen: 1, sheenRoughness: .32, sheenColor: tint(hex, '#ff9fb4', .5), side: THREE.DoubleSide }));
export const silk = hex => cached('silk' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: .3, sheen: .9, sheenRoughness: .22, sheenColor: tint(hex, '#ffffff', .55), side: THREE.DoubleSide }));
export const skinMat = hex => cached('skin' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: .46, sheen: .35, sheenRoughness: .5, sheenColor: new THREE.Color('#ffd9c7'), clearcoat: .1, clearcoatRoughness: .5 }));
export const hairMat = (hex, slick) => cached(`hair${hex}${slick}`, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: slick ? .34 : .85, clearcoat: slick ? .8 : 0, clearcoatRoughness: .28, sheen: slick ? 0 : .5, sheenColor: tint(hex, '#ffffff', .25) }));
export const leather = hex => cached('lea' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: .42, clearcoat: .45, clearcoatRoughness: .3 }));
export const GOLD = new THREE.MeshStandardMaterial({ color: '#dcb562', metalness: 1, roughness: .22 });
export const BRASS = new THREE.MeshStandardMaterial({ color: '#b8904a', metalness: 1, roughness: .3 });
export const CHROME = new THREE.MeshStandardMaterial({ color: '#d4d8de', metalness: 1, roughness: .16 });
export const BLACK = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: .42 });
export const GLOSS = new THREE.MeshPhysicalMaterial({ color: '#050507', roughness: .06, metalness: .5, clearcoat: 1 });
export const WHITE = new THREE.MeshStandardMaterial({ color: '#c4bfb4', roughness: .85 });
export const GLASSWARE = new THREE.MeshPhysicalMaterial({ color: '#e8eef5', roughness: .05, metalness: 0, transparent: true, opacity: .32, clearcoat: 1, depthWrite: false });
export const WHISKEY = new THREE.MeshPhysicalMaterial({ color: '#b5651d', roughness: .1, transparent: true, opacity: .85, emissive: '#4a1e05', emissiveIntensity: .6 });
export const EYE = new THREE.MeshPhysicalMaterial({ color: '#0b0806', roughness: .15, clearcoat: 1 });
export const MUG = new THREE.MeshPhysicalMaterial({ color: '#e9e4da', roughness: .3, clearcoat: .6, side: THREE.DoubleSide });
export const COFFEE = new THREE.MeshStandardMaterial({ color: '#2a150a', roughness: .2, side: THREE.DoubleSide });
export const glow = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
export function stripes(hex, rep) {
  return cached(`str${hex}${rep}`, () => {
    const map = canvasTex(64, 8, (g, w, h) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, 0, 2, h); }, [rep, 1]);
    return new THREE.MeshPhysicalMaterial({ map, roughness: .8, sheen: .55, sheenRoughness: .6, sheenColor: tint(hex, '#ffffff', .32), side: THREE.DoubleSide });
  });
}
export function woodTex(base, rep, dark = false) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rows = 8, ph = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 300;
      while (x < w) {
        const pw = 360 + rand() * 440, l = (dark ? 6 : 9) + rand() * 5;
        g.fillStyle = `hsl(${18 + rand() * 9},${32 + rand() * 14}%,${l}%)`; g.fillRect(x, r * ph, pw, ph);
        for (let k = 0; k < 30; k++) {
          const y = r * ph + rand() * ph;
          g.strokeStyle = `rgba(0,0,0,${.05 + rand() * .14})`; g.lineWidth = .8 + rand() * 1.6;
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + pw * .3, y + (rand() - .5) * 9, x + pw * .6, y + (rand() - .5) * 9, x + pw, y + (rand() - .5) * 7); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, r * ph, 2, ph);
        x += pw;
      }
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, r * ph, w, 2);
    }
  }, rep);
}
export function marbleTex(base = '#0a0a0c', vein = '205,200,190', rep, seams = false) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const gold = rand() < .22;
      g.strokeStyle = `rgba(${gold ? '200,160,95' : vein},${.025 + rand() * .07})`; g.lineWidth = .5 + rand() * 2;
      let x = rand() * w, y = rand() * h; const a = rand() * Math.PI * 2; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) { x += Math.cos(a) * 55 + (rand() - .5) * 60; y += Math.sin(a) * 55 + (rand() - .5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    if (seams) { g.fillStyle = 'rgba(0,0,0,.85)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); }
  }, rep);
}

// ---------- geometry helpers ----------
export const DEPTH = .66;
export const TORSO = [[.150, .90], [.157, .97], [.164, 1.04], [.175, 1.12], [.186, 1.20], [.193, 1.28], [.196, 1.34], [.192, 1.39], [.178, 1.43], [.150, 1.46], [.110, 1.48], [.066, 1.50], [.0, 1.505]];
export const JACKET = [[.178, .74], [.176, .82], [.174, .90], [.174, .97], [.179, 1.04], [.190, 1.12], [.201, 1.20], [.208, 1.28], [.212, 1.34], [.213, 1.39], [.202, 1.43], [.172, 1.465], [.122, 1.49], [.09, 1.51], [.082, 1.535]];
export const JACKET_S = JACKET.filter(([, y]) => y >= .9);
export const VEST = TORSO.filter(([, y]) => y >= .97 && y <= 1.43).map(([r, y]) => [r + .012, y]);
export const HIPS = [[.0, .80], [.11, .805], [.150, .83], [.163, .88], [.164, .93], [.158, .975]];
export function rAt(prof, y) {
  if (y <= prof[0][1]) return prof[0][0];
  for (let i = 1; i < prof.length; i++) { const [r1, y1] = prof[i - 1], [r2, y2] = prof[i]; if (y <= y2) return lerp(r1, r2, (y - y1) / (y2 - y1)); }
  return 0;
}
export const frontZ = (y, x = 0, prof = TORSO) => { const r = rAt(prof, y); return DEPTH * Math.sqrt(Math.max(0, r * r - x * x)); };
export function shell(profile, gapAt, seg = 64) {
  const pos = [], uv = [], idx = [], w = seg + 1;
  for (const [r, y] of profile) {
    const gap = gapAt ? gapAt(y) : 0;
    for (let j = 0; j <= seg; j++) {
      const f = j / seg, phi = gapAt ? gap + (Math.PI * 2 - 2 * gap) * f : Math.PI + Math.PI * 2 * f;
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi) * DEPTH); uv.push(f * 4, y * 4);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * w + j, b = a + 1, c = a + w, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function ribbon(samples) {
  const pos = [], uv = [], idx = [], n = samples.length - 1;
  samples.forEach((s, i) => {
    pos.push(s.x - s.w / 2, s.y, s.z, s.x + s.w / 2, s.y, s.z); uv.push(0, i / n, 1, i / n);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function rod(a, b, r, seg = 10) {
  const A = new V3(...a), B = new V3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g;
}
export function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
export function slab(w, h, depth, r = .04, bev = .012) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bev, h - 2 * bev, r), { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 8 });
  g.center(); return g;
}
export function poly(points) { const s = new THREE.Shape(); points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; }
// Extrude a side profile (z forward, y up) across the x axis, centered: for faceted furniture.
export function sideExtrude(points, width, bev = .012) {
  const g = new THREE.ExtrudeGeometry(poly(points), { depth: width, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0); return g;
}


// ---------- adding to the scene ----------
export const add = (geo, mat, pos, rot, { cast = false, receive = true, parent = scene } = {}) => {
  const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
};
