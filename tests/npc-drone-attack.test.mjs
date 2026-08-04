import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCharacterDroneAttackDialogContent,
  buildNpcDroneAttackDialogContent,
  callNativeAttackWithNpcPilot,
  getDroneAttackContext,
  getNpcDroneAttackContext,
  installNpcDroneAttackCompatibility,
  resolveCharacterPilotAttack,
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

function characterPilot({
  ab = 1,
  dex = 3,
  int = 1,
  drive = 0,
  program = 2,
  omitDrive = false,
  omitProgram = false,
} = {}) {
  const skills = [
    ...(!omitDrive ? [{ id: "drive", name: "Drive", type: "skill", system: { rank: drive } }] : []),
    ...(!omitProgram ? [{ id: "program", name: "Program", type: "skill", system: { rank: program } }] : []),
    { id: "shoot", name: "Shoot", type: "skill", system: { rank: 4 } },
  ];
  return {
    id: "pc-id",
    name: "Droney Guy",
    type: "character",
    system: { ab, stats: { dex: { mod: dex }, int: { mod: int } } },
    itemTypes: { skill: skills, cyberware: [{ type: "cyberware", name: "Remote Control Unit" }] },
  };
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

test("character pilot calculation uses AB, better attribute, and better Drive or Program", () => {
  const calculation = resolveCharacterPilotAttack(characterPilot());
  assert.equal(calculation.attackBonus, 1);
  assert.deepEqual(calculation.attribute, { key: "dex", label: "Dexterity", value: 3 });
  assert.deepEqual(calculation.skill, { key: "program", label: "Program", value: 2 });
  assert.equal(calculation.pilotTotal, 6);
  assert.equal(calculation.hasRemoteControlUnit, true);
});

test("character pilot choices are deterministic and never use Shoot", () => {
  const tied = resolveCharacterPilotAttack(characterPilot({ dex: 2, int: 2, drive: 1, program: 1 }));
  assert.equal(tied.attribute.key, "dex");
  assert.equal(tied.skill.key, "program");
  assert.equal(tied.skill.value, 1);

  const alternate = resolveCharacterPilotAttack(characterPilot({ dex: 0, int: 2, drive: 3, program: 1 }));
  assert.equal(alternate.attribute.key, "int");
  assert.equal(alternate.skill.key, "drive");
  assert.equal(alternate.pilotTotal, 6);
});

test("character pilot Skill resolution handles untrained and missing Items safely", () => {
  assert.equal(resolveCharacterPilotAttack(characterPilot({ drive: -1, program: 2 })).skill.value, 2);
  assert.equal(resolveCharacterPilotAttack(characterPilot({ drive: 1, program: -1 })).skill.value, 1);
  assert.deepEqual(
    resolveCharacterPilotAttack(characterPilot({ drive: -1, program: -1 })).skill,
    { key: "program", label: "Program", value: -1 },
  );
  assert.equal(
    resolveCharacterPilotAttack(characterPilot({ omitDrive: true, program: 0 })).skill.key,
    "program",
  );
  assert.equal(
    resolveCharacterPilotAttack(characterPilot({ drive: 0, omitProgram: true })).skill.key,
    "drive",
  );
  assert.equal(
    resolveCharacterPilotAttack(characterPilot({ omitDrive: true, omitProgram: true })),
    null,
  );
});

test("character drone context resolves from the native relationship without a Scene token", () => {
  const pilot = characterPilot();
  const context = getDroneAttackContext(
    { parent: { actor: actor({ pilot: null, crewMembers: [pilot.id] }) } },
    { actors: { get: (id) => id === pilot.id ? pilot : null } },
  );
  assert.equal(context.kind, "character");
  assert.equal(context.calculation.pilotTotal, 6);
});

test("character drone dialog shows its read-only summary without Stat, Skill, or Remember controls", () => {
  const calculation = resolveCharacterPilotAttack(characterPilot());
  calculation.pilot.name = '<script>alert("pilot")</script>';
  const html = buildCharacterDroneAttackDialogContent({
    actorId: "drone-id", canBurst: true, calculation,
  });
  assert.match(html, /&lt;script&gt;alert\(&quot;pilot&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Dexterity \+3/);
  assert.match(html, /Program \+2/);
  assert.match(html, /Pilot Total<\/dt><dd>\+6/);
  assert.match(html, /name="burstFire"/);
  assert.match(html, /name="modifier"/);
  assert.doesNotMatch(html, /name="stat"|name="skill"|name="remember"/);
});

test("Remote Control Unit recognition is informational and never changes the pilot total", () => {
  const withUnit = characterPilot({ ab: 2, dex: 1, int: 3, drive: 0, program: 2 });
  const withoutUnit = structuredClone(withUnit);
  withoutUnit.itemTypes.cyberware = [];
  const recognized = resolveCharacterPilotAttack(withUnit);
  const absent = resolveCharacterPilotAttack(withoutUnit);
  assert.equal(recognized.hasRemoteControlUnit, true);
  assert.equal(absent.hasRemoteControlUnit, false);
  assert.equal(recognized.pilotTotal, 7);
  assert.equal(absent.pilotTotal, 7);
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

test("character-piloted drones use the pilot formula while non-drone weapons retain native behavior", async () => {
  const calls = [];
  const pilot = characterPilot();
  const drone = actor({ pilot });
  const prototype = {
    ammo: { type: "ammo", burst: true, value: 10 },
    parent: { actor: drone, name: "Drone Gun" },
    async roll(...args) { calls.push(args); return "native"; },
    async rollAttack(...args) {
      return { args, rollData: this.parent.actor.getRollData() };
    },
  };
  installNpcDroneAttackCompatibility({
    gameRef: {
      system: { id: "swnr" },
      i18n: { format: () => "Attack", localize: () => "Roll" },
    },
    config: { Item: { dataModels: { weapon: { prototype } } } },
    dialogApi: {
      wait: (options) => options.buttons[0].callback(null, {
        form: { elements: { modifier: { value: "1" }, burstFire: { checked: true } } },
      }),
    },
  });
  assert.deepEqual(await prototype.roll(false), {
    args: [0, 0, 0, 1, true],
    rollData: { ab: 6, meleeAb: 6, description: "<p>Catalogue text</p>" },
  });
  prototype.parent = { actor: actor({ type: "character", pilot: null }) };
  assert.equal(await prototype.roll(true), "native");
  assert.deepEqual(calls, [[true]]);
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
  assert.deepEqual(warnings, ["This drone has no valid pilot assigned."]);
});

test("malformed character pilot warns without rolling or consuming ammunition", async () => {
  const warnings = [];
  const pilot = characterPilot({ omitDrive: true, omitProgram: true });
  const prototype = {
    ammo: { type: "ammo", value: 4 },
    parent: { actor: actor({ pilot }) },
    async roll() { throw new Error("native roll must not run"); },
    async rollAttack() { throw new Error("attack must not run"); },
  };
  installNpcDroneAttackCompatibility({
    gameRef: { system: { id: "swnr" } },
    config: { Item: { dataModels: { weapon: { prototype } } } },
    notifications: { warn: (message) => warnings.push(message) },
  });
  assert.equal(await prototype.roll(), undefined);
  assert.equal(prototype.ammo.value, 4);
  assert.deepEqual(warnings, ["Unable to resolve this drone pilot's Drive or Program skill."]);
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
