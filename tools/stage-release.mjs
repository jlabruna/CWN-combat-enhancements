import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(moduleRoot, "release");
const stageRoot = path.join(releaseRoot, "cwn-combat-enhancements");
const browserUploadRoot = path.join(releaseRoot, "github-upload-v0.13.8");
const browserDotfilesRoot = path.join(
  releaseRoot,
  "github-dotfiles-upload-v0.13.8",
);
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
if (manifest.version !== "0.13.8") {
  throw new Error(`Expected module version 0.13.8 but found ${manifest.version}.`);
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
for (const directory of [
  "lang",
  "scripts",
  "scripts/network-console",
  "styles",
  "templates",
  "templates/network-console",
  "tests",
  "tools",
]) {
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
for (const filename of [
  "chat-card.mjs",
  "cwn-combat-enhancements-v0.13.8.mjs",
  "cwn-combat-enhancements.mjs",
  "foundry-compat.mjs",
  "magazine-reload.mjs",
  "monthly-expenses-rules.mjs",
  "monthly-expenses.mjs",
  "npc-weapon-roll-compat.mjs",
  "suppressive-fire.mjs",
  "weapon-family.mjs",
]) {
  await fs.copyFile(
    path.join(moduleRoot, "scripts", filename),
    path.join(browserUploadRoot, "scripts", filename),
  );
}
for (const filename of ["network-console.mjs", "network-geometry.mjs", "network-model.mjs", "demon-rules.mjs"]) {
  await fs.copyFile(
    path.join(moduleRoot, "scripts", "network-console", filename),
    path.join(browserUploadRoot, "scripts", "network-console", filename),
  );
}
await fs.copyFile(
  path.join(moduleRoot, "styles", "cwn-combat-enhancements.css"),
  path.join(browserUploadRoot, "styles", "cwn-combat-enhancements.css"),
);
await fs.copyFile(
  path.join(moduleRoot, "styles", "network-console.css"),
  path.join(browserUploadRoot, "styles", "network-console.css"),
);
await fs.copyFile(
  path.join(moduleRoot, "templates", "network-console", "console.hbs"),
  path.join(browserUploadRoot, "templates", "network-console", "console.hbs"),
);
await fs.copyFile(
  path.join(moduleRoot, "templates", "monthly-expenses.hbs"),
  path.join(browserUploadRoot, "templates", "monthly-expenses.hbs"),
);
for (const filename of [
  "chat-card.test.mjs",
  "foundry-compat.test.mjs",
  "network-geometry.test.mjs",
  "network-model.test.mjs",
  "demon-rules.test.mjs",
  "monthly-expenses.test.mjs",
  "npc-weapon-roll-compat.test.mjs",
  "weapon-family.test.mjs",
]) {
  await fs.copyFile(
    path.join(moduleRoot, "tests", filename),
    path.join(browserUploadRoot, "tests", filename),
  );
}
await fs.copyFile(
  path.join(moduleRoot, "tools", "stage-release.mjs"),
  path.join(browserUploadRoot, "tools", "stage-release.mjs"),
);

await fs.rm(browserDotfilesRoot, { recursive: true, force: true });
await fs.mkdir(path.join(browserDotfilesRoot, ".github", "workflows"), {
  recursive: true,
});
await fs.copyFile(
  path.join(moduleRoot, ".github", "workflows", "build-release.yml"),
  path.join(browserDotfilesRoot, ".github", "workflows", "build-release.yml"),
);
await fs.copyFile(
  path.join(moduleRoot, ".gitignore"),
  path.join(browserDotfilesRoot, ".gitignore"),
);

console.log(
  `Staged CWN Combat Enhancements ${manifest.version} at ${stageRoot}. `
  + `Browser upload files are at ${browserUploadRoot}; hidden paths are at `
  + `${browserDotfilesRoot}.`,
);
