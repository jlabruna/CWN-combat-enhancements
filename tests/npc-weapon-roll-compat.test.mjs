import test from "node:test";
import assert from "node:assert/strict";

import {
  bindCharacterWeaponRollDefaults,
  findActorSkillByName,
  getContentPackNativeStat,
  installNpcWeaponRollCompatibility,
  shouldBindCharacterWeaponRollDefaults,
  shouldUseNativeNpcWeaponDialog,
} from "../scripts/npc-weapon-roll-compat.mjs";

test("only NPC weapon data uses the native NPC dialog boundary", () => {
  assert.equal(shouldUseNativeNpcWeaponDialog({ parent: { actor: { type: "npc" } } }), true);
  assert.equal(shouldUseNativeNpcWeaponDialog({ parent: { actor: { type: "character" } } }), false);
  assert.equal(shouldUseNativeNpcWeaponDialog({}), false);
});

test("NPC weapon rolls bypass inherited remembered settings while PCs stay unchanged", async () => {
  const calls = [];
  const prototype = {
    async roll(...args) {
      calls.push({ context: this, args });
      return `${this.parent.actor.type}:${args[0]}`;
    },
  };
  const config = { Item: { dataModels: { weapon: { prototype } } } };
  const gameRef = { system: { id: "swnr" } };

  assert.deepEqual(
    installNpcWeaponRollCompatibility({ gameRef, config }),
    { installed: true, alreadyInstalled: false },
  );
  assert.equal(await prototype.roll.call({ parent: { actor: { type: "npc" } } }, false), "npc:true");
  assert.equal(await prototype.roll.call({ parent: { actor: { type: "character" } } }, false), "character:false");
  assert.deepEqual(calls.map((call) => call.args), [[true], [false]]);
});

test("Content Pack character weapons bind their semantic skill and portable Stat", async () => {
  const shoot = { id: "shoot-id", type: "skill", name: "Shoot" };
  const item = {
    id: "weapon-id",
    type: "weapon",
    actor: { type: "character", itemTypes: { skill: [shoot] } },
    system: { skill: "ask", stat: "ask" },
    flags: { "harbour-city-stories": { nativeSkill: "Shoot", nativeStat: "dex" } },
    async update(change) { this.updated = change; },
  };

  assert.equal(shouldBindCharacterWeaponRollDefaults(item), true);
  assert.deepEqual(
    await bindCharacterWeaponRollDefaults(item),
    { "system.skill": "shoot-id", "system.stat": "dex" },
  );
  assert.deepEqual(item.updated, {
    "system.skill": "shoot-id",
    "system.stat": "dex",
  });
  assert.equal(findActorSkillByName(item.actor, "shoot"), shoot);
  assert.equal(getContentPackNativeStat(item), "dex");
});

test("roll-default binding does not alter NPC or untagged weapons", async () => {
  const npcItem = {
    type: "weapon", actor: { type: "npc", itemTypes: { skill: [] } },
    system: { skill: "ask", stat: "ask" },
    flags: { "harbour-city-stories": { nativeSkill: "Shoot", nativeStat: "dex" } },
  };
  const untaggedItem = {
    type: "weapon", actor: { type: "character", itemTypes: { skill: [] } },
    system: { skill: "ask", stat: "ask" }, flags: {},
  };
  assert.equal(shouldBindCharacterWeaponRollDefaults(npcItem), false);
  assert.equal(await bindCharacterWeaponRollDefaults(npcItem), null);
  assert.equal(await bindCharacterWeaponRollDefaults(untaggedItem), null);
});

test("native Stat resolves even when a matching character Skill is unavailable", async () => {
  const item = {
    type: "weapon",
    actor: { type: "character", itemTypes: { skill: [] } },
    system: { skill: "ask", stat: "ask" },
    flags: { "harbour-city-stories": { nativeSkill: "Shoot", nativeStat: "wis" } },
    async update(change) { this.updated = change; },
  };
  assert.deepEqual(
    await bindCharacterWeaponRollDefaults(item),
    { "system.stat": "wis" },
  );
  assert.deepEqual(item.updated, { "system.stat": "wis" });
});

test("installation is guarded by SWNR and applied only once", () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  const prototype = { roll() {} };
  const config = { Item: { dataModels: { weapon: { prototype } } } };

  assert.deepEqual(
    installNpcWeaponRollCompatibility({
      gameRef: { system: { id: "other" } }, config, logger,
    }),
    { installed: false, reason: "unexpected-system" },
  );
  assert.equal(warnings.length, 0);
  assert.deepEqual(
    installNpcWeaponRollCompatibility({
      gameRef: { system: { id: "swnr" } }, config, logger,
    }),
    { installed: true, alreadyInstalled: false },
  );
  assert.deepEqual(
    installNpcWeaponRollCompatibility({
      gameRef: { system: { id: "swnr" } }, config, logger,
    }),
    { installed: true, alreadyInstalled: true },
  );
});

test("a missing SWNR roll method produces one clear warning and no patch", () => {
  const warnings = [];
  const result = installNpcWeaponRollCompatibility({
    gameRef: { system: { id: "swnr" } },
    config: { Item: { dataModels: { weapon: { prototype: {} } } } },
    logger: { warn: (message) => warnings.push(message) },
  });
  assert.deepEqual(result, { installed: false, reason: "missing-roll" });
  assert.match(warnings[0], /weapon roll data model is unavailable/);
});
