import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNpcDroneAttackDialogContent,
  callNativeAttackWithNpcPilot,
  getNpcDroneAttackContext,
  installNpcDroneAttackCompatibility,
  resolveNativeDronePilot,
  stripDroneAttackDescription,
} from "../scripts/npc-drone-attack.mjs";

function actor({ type = "drone", pilot = null, crewMembers = ["pilot-id"] } = {}) {
  return {
    id: "drone-id",
    name: "Test Drone",
    type,
    system: { pilot, crewMembers },
    getRollData() { return { ab: 0, description: "<p>Catalogue text</p>" }; },
  };
}

function npcPilot(ab = 7) {
  return { id: "pilot-id", type: "npc", system: { ab, skillBonus: 4 } };
}

test("SWNR's native drone relationship resolves NPC and character pilots", () => {
  const npc = npcPilot(8);
  assert.deepEqual(resolveNativeDronePilot(actor({ pilot: npc })), {
    kind: "npc", pilot: npc, crewId: "pilot-id",
  });
  const character = { id: "pc-id", type: "character" };
  assert.equal(resolveNativeDronePilot(actor({ pilot: character })).kind, "character");
  assert.equal(resolveNativeDronePilot(actor({ type: "npc", pilot: npc })).kind, "not-drone");
});

test("crewMembers resolves a world NPC without requiring a pilot token", () => {
  const npc = npcPilot(6);
  const gameRef = { actors: { get: (id) => id === npc.id ? npc : null } };
  const context = getNpcDroneAttackContext(
    { parent: { actor: actor({ pilot: null }) } },
    gameRef,
  );
  assert.equal(context.kind, "npc");
  assert.equal(context.pilot, npc);
  assert.equal(context.pilotBonus, 6);
});

test("missing and invalid linked pilots are rejected", () => {
  const gameRef = { actors: { get: () => null } };
  assert.equal(
    getNpcDroneAttackContext({ parent: { actor: actor({ pilot: null }) } }, gameRef).kind,
    "invalid",
  );
  assert.equal(
    getNpcDroneAttackContext({ parent: { actor: actor({ pilot: { type: "vehicle" } }) } }).kind,
    "invalid",
  );
});

test("the reduced dialog contains only Burst and manual modifier controls", () => {
  const html = buildNpcDroneAttackDialogContent({ actorId: "drone-id", canBurst: true });
  assert.match(html, /name="burstFire"/);
  assert.match(html, /name="modifier"/);
  assert.doesNotMatch(html, /name="stat"/);
  assert.doesNotMatch(html, /name="skill"/);
  assert.doesNotMatch(html, /name="remember"/);
});

test("pilot Attack Bonus replaces actor AB for To Hit but Stat and Skill stay zero", async () => {
  const drone = actor();
  const weaponModel = {
    parent: { actor: drone },
    async rollAttack(...args) {
      return { args, rollData: this.parent.actor.getRollData() };
    },
  };
  const originalGetRollData = drone.getRollData;
  const promise = callNativeAttackWithNpcPilot({
    weaponModel,
    pilotBonus: 9,
    args: [0, 0, 0, -1, true],
  });
  assert.equal(drone.getRollData, originalGetRollData);
  assert.deepEqual(await promise, {
    args: [0, 0, 0, -1, true],
    rollData: { ab: 9, meleeAb: 9, description: "<p>Catalogue text</p>" },
  });
});

test("consecutive attacks preserve native weapon, ammunition, and result handling", async () => {
  const drone = actor();
  const weaponModel = {
    ab: 2,
    ammo: { value: 5 },
    parent: { actor: drone },
    async rollAttack(damageBonus, stat, skill, modifier, burst) {
      const rollData = this.parent.actor.getRollData();
      this.ammo.value -= burst ? 3 : 1;
      return {
        attackModifiers: {
          pilot: rollData.ab,
          weapon: this.ab,
          manual: modifier,
          burst: burst ? 2 : 0,
          stat,
          skill,
        },
        damageBonus,
        ammunition: this.ammo.value,
        damage: "native-damage",
        shock: "native-shock",
        trauma: "native-trauma",
        range: "native-range",
        targetCheck: "native-target-check",
        damageControls: "native-damage-controls",
        rollMode: "native-roll-mode",
        diceSoNice: "native-dice-so-nice",
      };
    },
  };

  const first = await callNativeAttackWithNpcPilot({
    weaponModel,
    pilotBonus: 7,
    args: [0, 0, 0, -1, true],
  });
  const second = await callNativeAttackWithNpcPilot({
    weaponModel,
    pilotBonus: 7,
    args: [0, 0, 0, 2, false],
  });

  assert.deepEqual(first.attackModifiers, {
    pilot: 7, weapon: 2, manual: -1, burst: 2, stat: 0, skill: 0,
  });
  assert.deepEqual(second.attackModifiers, {
    pilot: 7, weapon: 2, manual: 2, burst: 0, stat: 0, skill: 0,
  });
  assert.equal(first.damageBonus, 0);
  assert.equal(first.ammunition, 2);
  assert.equal(second.ammunition, 1);
  for (const field of [
    "damage", "shock", "trauma", "range", "targetCheck",
    "damageControls", "rollMode", "diceSoNice",
  ]) {
    assert.equal(first[field], second[field]);
    assert.match(first[field], /^native-/);
  }
});

test("qualifying attacks use the reduced dialog and native rollAttack pipeline", async () => {
  const pilot = npcPilot(7);
  const drone = actor({ pilot });
  const calls = [];
  const prototype = {
    ammo: { type: "ammo", burst: true, value: 10 },
    parent: { id: "weapon-id", name: "Drone Gun", actor: drone },
    async roll(...args) { calls.push({ kind: "native-roll", args }); },
    async rollAttack(...args) {
      calls.push({ kind: "attack", args, ab: this.parent.actor.getRollData().ab });
      return "attack-result";
    },
  };
  const dialogApi = {
    async wait(options) {
      assert.doesNotMatch(options.content, /name="stat"|name="skill"/);
      return options.buttons[0].callback(null, {
        form: { elements: {
          modifier: { value: "-2" },
          burstFire: { checked: true },
        } },
      });
    },
  };
  const gameRef = {
    system: { id: "swnr" },
    i18n: { format: () => "Attack", localize: () => "Roll" },
  };
  installNpcDroneAttackCompatibility({
    gameRef,
    config: { Item: { dataModels: { weapon: { prototype } } } },
    dialogApi,
  });
  assert.equal(await prototype.roll(), "attack-result");
  assert.deepEqual(calls, [{
    kind: "attack", args: [0, 0, 0, -2, true], ab: 7,
  }]);
});

test("character-piloted drones and non-drone weapons retain native roll behavior", async () => {
  const calls = [];
  const prototype = {
    parent: { actor: actor({ pilot: { type: "character" } }) },
    async roll(...args) { calls.push(args); return "native"; },
    async rollAttack() {},
  };
  installNpcDroneAttackCompatibility({
    gameRef: { system: { id: "swnr" } },
    config: { Item: { dataModels: { weapon: { prototype } } } },
  });
  assert.equal(await prototype.roll(false), "native");
  prototype.parent = { actor: actor({ type: "character", pilot: null }) };
  assert.equal(await prototype.roll(true), "native");
  assert.deepEqual(calls, [[false], [true]]);
});

test("an unlinked drone warns and does not roll", async () => {
  const warnings = [];
  const prototype = {
    parent: { actor: actor({ pilot: null, crewMembers: [] }) },
    async roll() { throw new Error("native roll must not run"); },
    async rollAttack() {},
  };
  installNpcDroneAttackCompatibility({
    gameRef: { system: { id: "swnr" } },
    config: { Item: { dataModels: { weapon: { prototype } } } },
    notifications: { warn: (message) => warnings.push(message) },
  });
  assert.equal(await prototype.roll(), undefined);
  assert.deepEqual(warnings, ["This drone has no valid NPC pilot assigned."]);
});

test("attack description field is removed without altering ordinary Item cards", () => {
  const attack = `<div class="chat-card item-card" data-actor-id="a" data-item-id="w"><h4 title="&lt;p&gt;&lt;strong&gt;Servicing&lt;/strong&gt;&lt;br&gt;Catalogue&lt;/p&gt;">Gun</h4><span>To Hit:</span></div>`;
  const cleaned = stripDroneAttackDescription(attack);
  assert.doesNotMatch(cleaned, /Servicing|Catalogue|title=|&lt;(?:br|strong|p)/);
  assert.match(cleaned, /<h4>Gun<\/h4><span>To Hit:/);

  const itemCard = `<div class="chat-card item-card"><h3>Description</h3><p>Keep me</p></div>`;
  assert.equal(stripDroneAttackDescription(itemCard), itemCard);
});

test("installation is SWNR-only, guarded, and checks both roll methods", () => {
  const prototype = { roll() {}, rollAttack() {} };
  const config = { Item: { dataModels: { weapon: { prototype } } } };
  assert.deepEqual(
    installNpcDroneAttackCompatibility({ gameRef: { system: { id: "other" } }, config }),
    { installed: false, reason: "unexpected-system" },
  );
  assert.deepEqual(
    installNpcDroneAttackCompatibility({ gameRef: { system: { id: "swnr" } }, config }),
    { installed: true, alreadyInstalled: false },
  );
  assert.deepEqual(
    installNpcDroneAttackCompatibility({ gameRef: { system: { id: "swnr" } }, config }),
    { installed: true, alreadyInstalled: true },
  );
  const warnings = [];
  assert.deepEqual(
    installNpcDroneAttackCompatibility({
      gameRef: { system: { id: "swnr" } },
      config: { Item: { dataModels: { weapon: { prototype: { roll() {} } } } } },
      logger: { warn: (message) => warnings.push(message) },
    }),
    { installed: false, reason: "missing-roll-methods" },
  );
  assert.equal(warnings.length, 1);
});
