import { readdirSync, readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const baselinePath = join(root, "server-java/java-routes.json");
function walk(dir, extension) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

function baselineRoutes() {
  const routes = JSON.parse(readFileSync(baselinePath, "utf8"));
  return new Set(routes);
}

function javaRoutes() {
  const routes = new Set();
  const annotations = { Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE" };
  for (const file of walk(join(root, "server-java/src/main/java"), ".java")) {
    const source = readFileSync(file, "utf8");
    const base = [...source.matchAll(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g)].pop()?.[1] || "";
    const pattern = /@(Get|Post|Put|Patch|Delete|RequestMapping)Mapping\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g;
    for (const [, annotation, path] of source.matchAll(pattern)) {
      const method = annotations[annotation];
      if (method) {
        const fullPath = path.startsWith("/api/") ? path : `${base}${path}`;
        if (fullPath.startsWith("/api/")) routes.add(`${method} ${fullPath}`);
      }
    }
  }
  return routes;
}

const baseline = baselineRoutes();
const actual = javaRoutes();
const missing = [...baseline].filter((route) => !actual.has(route)).sort();
const baselineMissing = [...baseline].filter((route) => !actual.has(route)).sort();
const extra = [...actual].filter((route) => !baseline.has(route)).sort();

console.log(`Java routes: ${actual.size}`);
console.log(`Java baseline routes: ${baseline.size}`);
if (missing.length) console.log(`Missing:\n${missing.join("\n")}`);
if (baselineMissing.length) console.log(`Baseline missing:\n${baselineMissing.join("\n")}`);
if (extra.length) console.log(`Extra:\n${extra.join("\n")}`);
if (process.argv.includes("--write-baseline")) {
  writeFileSync(baselinePath, `${JSON.stringify([...actual].sort(), null, 2)}\n`);
  console.log(`Java route baseline written: ${baselinePath}`);
}
if (missing.length || baselineMissing.length || extra.length) process.exit(1);
