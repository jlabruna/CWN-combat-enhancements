import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(moduleRoot, "release");
const stageRoot = path.join(releaseRoot, "cwn-combat-enhancements");
const browserUploadRoot = path.join(releaseRoot, "github-upload-v0.10.4");
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
if (manifest.version !== "0.10.4") {
  throw new Error(`Expected module version 0.10.4 but found ${manifest.version}.`);
}
if (
  !manifest.download.endsWith(
    `/v${manifest.version}/cwn-combat-enhancements-v${manifest.version}.zip`,
  )
) {
  throw new Error(`Unexpected module download URL "${manifest.download}".`);
}
for (const script of manifest.esmodules ?? []) {
  await fs.access(path.join(stageRoot, script));
}
for (const stylesheet of manifest.styles ?? []) {
  await fs.access(path.join(stageRoot, stylesheet));
}
await fs.copyFile(path.join(stageRoot, "module.json"), path.join(releaseRoot, "module.json"));

await fs.rm(browserUploadRoot, { recursive: true, force: true });
for (const directory of ["lang", "scripts", "tests", "tools"]) {
  await fs.mkdir(path.join(browserUploadRoot, directory), { recursive: true });
}
for (const filename of [
  "CHANGELOG.md",
  "MANUAL-TESTS.md",
  "README.md",
  "SWNR-CODE-PATHS.md",
  "module.json",
  "package.json",
]) {
  await fs.copyFile(
    path.join(moduleRoot, filename),
    path.join(browserUploadRoot, filename),
  );
}
for (const filename of ["en.json"]) {
  await fs.copyFile(
    path.join(moduleRoot, "lang", filename),
    path.join(browserUploadRoot, "lang", filename),
  );
}
for (const filename of ["magazine-reload.mjs", "weapon-family.mjs"]) {
  await fs.copyFile(
    path.join(moduleRoot, "scripts", filename),
    path.join(browserUploadRoot, "scripts", filename),
  );
}
await fs.copyFile(
  path.join(moduleRoot, "tests", "weapon-family.test.mjs"),
  path.join(browserUploadRoot, "tests", "weapon-family.test.mjs"),
);
await fs.copyFile(
  path.join(moduleRoot, "tools", "stage-release.mjs"),
  path.join(browserUploadRoot, "tools", "stage-release.mjs"),
);

console.log(
  `Staged CWN Combat Enhancements ${manifest.version} at ${stageRoot}. `
  + `Browser upload files are at ${browserUploadRoot}.`,
);
