import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(moduleRoot, "release");
const stageRoot = path.join(releaseRoot, "cwn-combat-enhancements");
const files = [
  "CHANGELOG.md",
  "LICENSE",
  "MANUAL-TESTS.md",
  "README.md",
  "SWNR-CODE-PATHS.md",
  "module.json",
];
const directories = ["lang", "scripts", "styles", "templates"];

await fs.rm(stageRoot, { recursive: true, force: true });
await fs.mkdir(stageRoot, { recursive: true });

for (const filename of files) {
  await fs.copyFile(path.join(moduleRoot, filename), path.join(stageRoot, filename));
}
for (const directory of directories) {
  await fs.cp(path.join(moduleRoot, directory), path.join(stageRoot, directory), {
    recursive: true,
  });
}

const manifest = JSON.parse(
  await fs.readFile(path.join(stageRoot, "module.json"), "utf8"),
);
if (manifest.version !== "0.10.1") {
  throw new Error(`Expected module version 0.10.1 but found ${manifest.version}.`);
}
for (const script of manifest.esmodules ?? []) {
  await fs.access(path.join(stageRoot, script));
}
for (const stylesheet of manifest.styles ?? []) {
  await fs.access(path.join(stageRoot, stylesheet));
}
await fs.copyFile(path.join(stageRoot, "module.json"), path.join(releaseRoot, "module.json"));

console.log(`Staged CWN Combat Enhancements ${manifest.version} at ${stageRoot}`);
