// Vendors Three.js 0.186.0 from the npm registry tarball (sha512 integrity checked) into
// vendor/three/, keeping only the files the page imports and the files those import.
// Refuses to run inside the 14-day cooldown or over an existing vendor/three.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const VERSION = "0.186.0";
const OUT = path.join(__dirname, "..", "vendor", "three");
const ENTRIES = [
  "build/three.module.js",
  "examples/jsm/controls/OrbitControls.js",
  "examples/jsm/loaders/GLTFLoader.js",
  "examples/jsm/exporters/GLTFExporter.js",
  "examples/jsm/postprocessing/EffectComposer.js",
  "examples/jsm/postprocessing/RenderPass.js",
  "examples/jsm/postprocessing/UnrealBloomPass.js",
  "examples/jsm/postprocessing/OutputPass.js",
  "examples/jsm/renderers/CSS2DRenderer.js",
  "examples/jsm/utils/BufferGeometryUtils.js",
];
// Anchored to line start so the JSDoc "@three_import" examples inside block comments do not count.
const IMPORT = /^\s*(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(get(res.headers.location));
        if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

(async () => {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} already exists; move it aside to re-vendor`);
  const doc = JSON.parse(await get("https://registry.npmjs.org/three"));
  const ageDays = (Date.now() - Date.parse(doc.time[VERSION])) / 864e5;
  if (ageDays < 14) throw new Error(`three ${VERSION} is ${ageDays.toFixed(1)} days old, inside the 14-day cooldown`);
  const { tarball, integrity } = doc.versions[VERSION].dist;
  const tgz = await get(tarball);
  const [algo, want] = integrity.split("-");
  const got = crypto.createHash(algo).update(tgz).digest("base64");
  if (got !== want) throw new Error(`tarball integrity mismatch: want ${want}, got ${got}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "three-"));
  fs.writeFileSync(path.join(tmp, "three.tgz"), tgz);
  execFileSync("tar", ["-xzf", "three.tgz"], { cwd: tmp });
  const pkg = path.join(tmp, "package");
  const seen = new Set();
  const queue = [...ENTRIES];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = fs.readFileSync(path.join(pkg, rel), "utf8");
    for (const [, spec] of src.matchAll(IMPORT)) {
      if (spec === "three") queue.push("build/three.module.js");
      else if (spec.startsWith(".")) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
      else throw new Error(`${rel} imports "${spec}", which the import map does not cover`);
    }
  }
  const sums = [];
  for (const rel of [...seen, "LICENSE"].sort()) {
    const dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(pkg, rel), dst);
    sums.push(`${crypto.createHash("sha256").update(fs.readFileSync(dst)).digest("hex")}  ${rel}`);
  }
  fs.writeFileSync(path.join(OUT, "SHA256SUMS"), sums.join("\n") + "\n");
  console.log(`three ${VERSION} (published ${doc.time[VERSION]}, ${ageDays.toFixed(0)} days old, integrity ok): ${seen.size} files`);
})().catch((e) => {
  console.error("FAILED", e.message);
  process.exit(1);
});
