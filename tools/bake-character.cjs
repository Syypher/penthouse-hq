// Authoring step, run once per character: bakes extra clips onto the walk model's skeleton
// (per bone, the world-space change from the source rest pose applied to the target rest pose),
// pins the walk in place, shrinks textures to 1024 px and writes one GLB with every clip.
// Usage: node tools/bake-character.cjs --dir <folder> --walk walk.glb --clip talk=talk.glb --clip sit=sit.glb --out boss.glb
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.HQ_PLAYWRIGHT || "playwright-core");
const BROWSER = process.env.HQ_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const VENDOR = path.join(__dirname, "..", "vendor");

const args = { clip: [] };
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "");
  if (k === "clip") args.clip.push(process.argv[i + 1]);
  else args[k] = process.argv[i + 1];
}
if (!args.dir || !args.walk || !args.out || !args.clip.length) {
  console.error("usage: --dir <folder> --walk walk.glb --clip name=file.glb [--clip ...] --out out.glb");
  process.exit(2);
}
const clips = args.clip.map((c) => c.split("="));

const PAGE = `<!doctype html><html><body><script type="importmap">{ "imports": {
  "three": "/vendor/three/build/three.module.js",
  "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const load = u => new GLTFLoader().loadAsync(u);
const bonesOf = root => { const m = {}; root.traverse(o => { if (o.isBone) m[o.name] = o; }); return m; };
window.bake = async (walkFile, clips) => {
  const A = await load('/in/' + walkFile), srcs = await Promise.all(clips.map(([, f]) => load('/in/' + f)));
  const BA = bonesOf(A.scene), log = [], names = Object.keys(BA);
  A.scene.updateMatrixWorld(true);
  const restWA = {}, restPosA = BA.Hips.position.clone();
  for (const n of names) restWA[n] = BA[n].getWorldQuaternion(new THREE.Quaternion());
  function retarget(src, clip, label, fps = 30) {
    const BS = bonesOf(src.scene); src.scene.updateMatrixWorld(true);
    const restWS = {}; for (const n of names) restWS[n] = BS[n].getWorldQuaternion(new THREE.Quaternion());
    const restPosS = BS.Hips.position.clone();
    const mixer = new THREE.AnimationMixer(src.scene); mixer.clipAction(clip).play();
    const frames = Math.round(clip.duration * fps) + 1, times = [], q = {}, hip = [];
    for (const n of names) q[n] = [];
    const wA = {}, wS = new THREE.Quaternion(), inv = new THREE.Quaternion();
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / fps); times.push(t);
      mixer.setTime(t); src.scene.updateMatrixWorld(true);
      for (const n of names) {
        BS[n].getWorldQuaternion(wS);
        const d = wS.clone().multiply(inv.copy(restWS[n]).invert());
        wA[n] = d.multiply(restWA[n]);
        const par = BA[n].parent, pw = par && par.isBone ? wA[par.name] : par.getWorldQuaternion(new THREE.Quaternion());
        const local = inv.copy(pw).invert().multiply(wA[n]);
        q[n].push(local.x, local.y, local.z, local.w);
      }
      const p = BS.Hips.position; hip.push(restPosA.x + p.x - restPosS.x, restPosA.y + p.y - restPosS.y, restPosA.z + p.z - restPosS.z);
    }
    const tracks = names.map(n => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, q[n]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hip));
    log.push(label + ': ' + frames + ' frames, ' + clip.duration.toFixed(2) + ' s');
    return new THREE.AnimationClip(label, clip.duration, tracks);
  }
  const baked = clips.map(([label], i) => retarget(srcs[i], srcs[i].animations[0], label));
  const w0 = A.animations[0], wt = w0.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'Hips.position');
  const v = wt.find(t => t.name === 'Hips.position').values, n3 = v.length / 3;
  const dist = Math.hypot(v[(n3 - 1) * 3] - v[0], v[(n3 - 1) * 3 + 2] - v[2]);
  for (let i = 0; i < n3; i++) { v[i * 3] = restPosA.x; v[i * 3 + 2] = restPosA.z; }
  const walk = new THREE.AnimationClip('walk', w0.duration, wt);
  log.push('walk: ' + w0.duration.toFixed(2) + ' s, root moves ' + (dist / 100).toFixed(2) + ' m per loop (' + (dist / 100 / w0.duration).toFixed(3) + ' m/s)');
  A.scene.traverse(o => { if (o.isMesh && o.material.normalMap) o.material.normalMap.userData.mimeType = 'image/jpeg'; });
  const glb = await new GLTFExporter().parseAsync(A.scene, { binary: true, animations: [walk, ...baked], maxTextureSize: 1024 });
  let s = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { log, b64: btoa(s) };
};
window.ready = true;
</script></body></html>`;

const server = http
  .createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    if (u === "/bake.html") return res.writeHead(200, { "content-type": "text/html" }), res.end(PAGE);
    const fp = u.startsWith("/in/") ? path.join(args.dir, path.basename(u)) : u.startsWith("/vendor/") ? path.join(VENDOR, path.normalize(u.slice(8))) : null;
    if (!fp || !fs.existsSync(fp)) return res.writeHead(404), res.end();
    res.writeHead(200, { "content-type": fp.endsWith(".js") ? "text/javascript" : "model/gltf-binary" });
    fs.createReadStream(fp).pipe(res);
  })
  .listen(0, "127.0.0.1", async () => {
    const browser = await chromium.launch({ executablePath: BROWSER, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.log("[pageerror]", e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/bake.html`);
      await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
      const r = await page.evaluate(([w, c]) => window.bake(w, c), [args.walk, clips]);
      r.log.forEach((l) => console.log(l));
      const buf = Buffer.from(r.b64, "base64");
      fs.writeFileSync(path.resolve(args.out), buf);
      console.log(`${args.out}: ${buf.length} bytes`);
    } catch (e) {
      console.error("FAILED", e);
      process.exitCode = 1;
    }
    await browser.close();
    server.close();
  });
