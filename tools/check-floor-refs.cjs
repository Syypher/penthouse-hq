// Lists names a floor module uses without declaring or importing them, imports of names a module
// does not export, and assignments to imported bindings, using TypeScript's checker (dev only).
const fs = require("fs");
const path = require("path");
const ts = require(process.env.HQ_TS || "typescript");
const dir = path.join(__dirname, "..", "public", "floor");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f));
const program = ts.createProgram(files, {
  allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
});
// 2304/2552: cannot find name; 18004: a shorthand property ({ fig }) with no such name in scope;
// 2305/2614/2724: no such export; 2632: assignment to an import
const CODES = new Set([2304, 2552, 18004, 2305, 2614, 2724, 2632]);
const hits = ts.getPreEmitDiagnostics(program).filter((d) => CODES.has(d.code) && d.file);
for (const d of hits) {
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  console.log(`${path.basename(d.file.fileName)}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}
console.log(hits.length ? `${hits.length} problems` : "every name is declared or imported");
process.exit(hits.length ? 1 : 0);
