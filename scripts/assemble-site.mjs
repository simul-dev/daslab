import { access, copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { demos } from "./demo-manifest.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const outputRoot = join(projectRoot, "dist");
const seenBases = new Set();
const seenSources = new Set();
const buildOutputs = demos.map((demo) => {
  if (!/^demos\/[a-z0-9-]+$/.test(demo.source) ||
      !/^\/demo\/(?:[a-z0-9-]+\/)+$/.test(demo.base)) {
    throw new Error(`Invalid demo source or public path: ${demo.id}`);
  }
  if (seenBases.has(demo.base) || seenSources.has(demo.source) ||
      [...seenBases].some(base => base.startsWith(demo.base) || demo.base.startsWith(base))) {
    throw new Error(`Duplicate or overlapping demo paths: ${demo.id}`);
  }
  seenBases.add(demo.base);
  seenSources.add(demo.source);
  const source = resolve(projectRoot, demo.source, "dist");
  const output = resolve(outputRoot, demo.base.slice(1));
  if (!source.startsWith(resolve(projectRoot, "demos") + sep) ||
      !output.startsWith(resolve(outputRoot, "demo") + sep)) {
    throw new Error(`Demo path escapes the build directories: ${demo.id}`);
  }
  return { ...demo, source, output };
});

const homepageFiles = [
  "index.html",
  "index_en.html",
  "resource.html",
  "resource_en.html",
  "demo.html",
  "demo_en.html",
  "CNAME",
];

async function requirePath(path, label) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`${label} is missing or unreadable: ${path}`);
  }
}

for (const file of homepageFiles) {
  await requirePath(join(projectRoot, file), `Homepage file ${file}`);
}
await requirePath(join(projectRoot, "static"), "Homepage static directory");
// Validate every build before replacing the previous assembled output.
for (const demo of buildOutputs) {
  const indexPath = join(demo.source, "index.html");
  await requirePath(indexPath, `Demo ${demo.id} build (run pnpm build:demos first)`);
  const html = await readFile(indexPath, "utf8");
  if (!html.includes(demo.base)) {
    throw new Error(`Demo ${demo.id} must reference base ${demo.base}`);
  }
  if (/(?:src|href)=["']\/(?:assets\/|favicon\.svg(?:["'?#]))/i.test(html)) {
    throw new Error(`Demo ${demo.id} references an asset outside its public base`);
  }
}

if (resolve(outputRoot) !== resolve(projectRoot, "dist")) {
  throw new Error("Unexpected site output directory");
}
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const file of homepageFiles) {
  await copyFile(join(projectRoot, file), join(outputRoot, file));
}

await cp(join(projectRoot, "static"), join(outputRoot, "static"), {
  recursive: true,
  dereference: true,
});

for (const demo of buildOutputs) {
  await mkdir(demo.output, { recursive: true });
  await cp(demo.source, demo.output, { recursive: true, dereference: true });
  console.log(`Demo ${demo.id}: ${demo.base}`);
}

console.log(`Assembled static site: ${outputRoot}`);
