import { access, copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const outputRoot = join(projectRoot, "dist");
const demoSource = join(
  projectRoot,
  "demos",
  "logistics-fulfillment",
  "dist",
);
const demoOutput = join(
  outputRoot,
  "demo",
  "logistics",
  "fulfillment",
);

const homepageFiles = [
  "index.html",
  "index_en.html",
  "resource.html",
  "resource_en.html",
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
await requirePath(demoSource, "Demo build output (run pnpm run build:demo first)");
await requirePath(join(demoSource, "index.html"), "Demo build index.html");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const file of homepageFiles) {
  await copyFile(join(projectRoot, file), join(outputRoot, file));
}

await cp(join(projectRoot, "static"), join(outputRoot, "static"), {
  recursive: true,
  dereference: true,
});

await mkdir(demoOutput, { recursive: true });
await cp(demoSource, demoOutput, {
  recursive: true,
  dereference: true,
});

const demoIndexPath = join(demoOutput, "index.html");
const demoIndex = await readFile(demoIndexPath, "utf8");
const publicBase = "/demo/logistics/fulfillment/";

if (!demoIndex.includes(publicBase)) {
  throw new Error(
    `The assembled demo index does not reference the required base path ${publicBase}`,
  );
}

if (/(?:src|href)=[\"']\/(?:assets\/|favicon\.svg(?:[\"'?#]))/i.test(demoIndex)) {
  throw new Error(
    "The assembled demo index contains a root-relative asset URL outside the required demo base path.",
  );
}

console.log(`Assembled static site: ${outputRoot}`);
console.log(`Demo URL path: ${publicBase}`);
