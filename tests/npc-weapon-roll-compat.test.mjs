import test from "node:test";
import assert from "node:assert/strict";

import {
  bindCharacterWeaponSkill,
  findActorSkillByName,
  installNpcWeaponRollCompatibility,
  shouldBindCharacterWeaponSkill,
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

test("Content Pack character weapons bind their semantic skill to the receiving actor", async () => {
  const shoot = { id: "shoot-id", type: "skill", name: "Shoot" };
  const item = {
    id: "weapon-id",
    type: "weapon",
    actor: { type: "character", itemTypes: { skill: [shoot] } },
    system: { skill: "ask" },
    flags: { "harbour-city-stories": { nativeSkill: "Shoot" } },
    async update(change) { this.updated = change; },
  };

  assert.equal(shouldBindCharacterWeaponSkill(item), true);
  assert.equal(await bindCharacterWeaponSkill(item), "shoot-id");
  assert.deepEqual(item.updated, { "system.skill": "shoot-id" });
  assert.equal(findActorSkillByName(item.actor, "shoot"), shoot);
});

test("skill binding does not alter NPC, untagged, or unmatched weapons", async () => {
  const npcItem = {
    type: "weapon", actor: { type: "npc", itemTypes: { skill: [] } },
    system: { skill: "ask" }, flags: { "harbour-city-stories": { nativeSkill: "Shoot" } },
  };
  const unmatchedItem = {
    type: "weapon", actor: { type: "character", itemTypes: { skill: [] } },
    system: { skill: "ask" }, flags: { "harbour-city-stories": { nativeSkill: "Shoot" } },
  };
  assert.equal(shouldBindCharacterWeaponSkill(npcItem), false);
  assert.equal(await bindCharacterWeaponSkill(npcItem), null);
  assert.equal(await bindCharacterWeaponSkill(unmatchedItem), null);
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
