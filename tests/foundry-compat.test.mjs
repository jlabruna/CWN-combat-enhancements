import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import {
  applyChatMessageMode,
  getChatMessageMode,
  renderHandlebarsTemplate,
} from "../scripts/foundry-compat.mjs";

test("manifest targets Foundry V14 and SWNR 2.3.1", async () => {
  const manifest = JSON.parse(
    await fs.readFile(new URL("../module.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.version, "0.13.4");
  assert.equal(manifest.compatibility.verified, "14.365");
  assert.equal(manifest.compatibility.maximum, undefined);
  const swnr = manifest.relationships.systems.find((entry) => entry.id === "swnr");
  assert.equal(swnr.compatibility.minimum, "2.3.1");
  assert.equal(swnr.compatibility.verified, "2.3.1");
});

test("Foundry V14 uses messageMode and ChatMessage.applyMode", () => {
  let applied = null;
  globalThis.game = {
    settings: {
      settings: new Map([["core.messageMode", {}]]),
      get: (scope, key) => `${scope}.${key}.value`,
    },
  };
  globalThis.getDocumentClass = () => ({
    applyMode: (data, mode) => { applied = { data, mode }; },
    applyRollMode: () => assert.fail("V14 must not use applyRollMode"),
  });

  const data = {};
  assert.equal(getChatMessageMode(), "core.messageMode.value");
  applyChatMessageMode(data);
  assert.deepEqual(applied, { data, mode: "core.messageMode.value" });
});

test("Foundry V13 falls back to rollMode and ChatMessage.applyRollMode", () => {
  let applied = null;
  globalThis.game = {
    settings: {
      settings: new Map(),
      get: (scope, key) => `${scope}.${key}.value`,
    },
  };
  globalThis.getDocumentClass = () => ({
    applyMode: () => assert.fail("V13 must not use applyMode"),
    applyRollMode: (data, mode) => { applied = { data, mode }; },
  });

  const data = {};
  assert.equal(getChatMessageMode(), "core.rollMode.value");
  applyChatMessageMode(data);
  assert.deepEqual(applied, { data, mode: "core.rollMode.value" });
});

test("template rendering prefers Foundry's namespaced V14 helper", async () => {
  globalThis.foundry = {
    applications: {
      handlebars: {
        renderTemplate: async (path, context) => `${path}:${context.value}`,
      },
    },
  };
  globalThis.renderTemplate = () => assert.fail("global fallback was not expected");

  assert.equal(await renderHandlebarsTemplate("template.hbs", { value: 14 }), "template.hbs:14");
});

test.afterEach(() => {
  delete globalThis.game;
  delete globalThis.getDocumentClass;
  delete globalThis.foundry;
  delete globalThis.renderTemplate;
});
