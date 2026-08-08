import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(moduleRoot, "tests");
const tests = (await readdir(testRoot))
  .filter((filename) => filename.endsWith(".test.mjs"))
  .sort()
  .map((filename) => path.join(testRoot, filename));

if (!tests.length) throw new Error("No test files were found.");

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: moduleRoot,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
