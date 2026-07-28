import assert from "node:assert/strict";
import test from "node:test";

import {
  actionRequiresTarget,
  addCommonCommand,
  applyDemonDamage,
  canExecuteDemonAction,
  commandCapacityState,
  compatibleProgrammingProfiles,
  CWN_COMMON_COMMAND_LINES,
  CWN_DEMON_PROGRAMMING_PROFILES,
  CWN_DEMON_TEMPLATES,
  DEMON_ACTIONS,
  demonActionRollBreakdowns,
  demonClassCommandCapacity,
  demonClassView,
  isProgrammingProfileCompatible,
  isTrustedDemonDamageFlag,
  nextAlertProgress,
  profileCommandCount,
  profileCommands,
  publicDemonChatContext,
  resolveProgrammingProfileSelection,
  validDemonDestinations,
  validateActionTarget,
  validateCommandLimit,
} from "../scripts/network-console/demon-rules.mjs";
import {
  createDemonFromTemplate,
  normalizeNetwork,
  programsAreRulesCompatible,
  sanitizeNetworkForPlayers,
} from "../scripts/network-console/network-model.mjs";

function networkWithDemon(demon = {}) {
  return {
    schemaVersion: 2,
    id: "network",
    name: "Test Network",
    nodes: [{
      id: "node-a",
      name: "Alpha",
      revealed: true,
      datafiles: [],
      watchdogs: [],
      demons: [{
        id: "demon",
        class: "Mastiff",
        name: "Guard",
        currentHp: 5,
        maxHp: 5,
        skill: 2,
        commands: [],
        ...demon,
      }],
    }, {
      id: "node-b",
      name: "Beta",
      revealed: true,
      datafiles: [],
      watchdogs: [],
      demons: [],
    }],
    connections: [{
      id: "connection",
      source: "node-a",
      target: "node-b",
      oneWay: true,
      barrier: false,
    }],
  };
}

test("all standard Demon classes apply exact defaults", () => {
  for (const [classKey, expected] of Object.entries(CWN_DEMON_TEMPLATES)) {
    const demon = createDemonFromTemplate(classKey, classKey);
    assert.deepEqual(
      [demon.maxHp, demon.currentHp, demon.skillBonus, demon.lineLimit, demon.cost],
      [expected.hp, expected.hp, expected.skill, expected.lines, expected.cost],
    );
  }
});

test("custom Demon preserves entered values during normalization", () => {
  const demon = normalizeNetwork(networkWithDemon({
    classKey: "custom",
    class: undefined,
    maxHp: 17,
    currentHp: 11,
    skillBonus: 4,
  })).nodes[0].demons[0];
  assert.deepEqual(
    [demon.classKey, demon.maxHp, demon.currentHp, demon.skillBonus],
    ["custom", 17, 11, 4],
  );
});

test("standard and custom class views keep stable name structure", () => {
  assert.deepEqual(demonClassView("Mastiff"), {
    custom: false,
    showCustomStats: false,
    stableNameField: true,
  });
  assert.deepEqual(demonClassView("custom"), {
    custom: true,
    showCustomStats: true,
    stableNameField: true,
  });
});

test("every programming profile has its exact expected command keys", () => {
  assert.deepEqual(CWN_DEMON_PROGRAMMING_PROFILES, {
    Bouncer: ["stun-avatar", "alert-repelled"],
    Patroller: ["alert-sighted", "patrol-move", "pursue", "stun-avatar"],
    Gatekeeper: ["lock-barrier", "send-message"],
    Shieldbearer: ["alert-sighted", "defend-device"],
    Repairman: ["alert-sighted", "patrol-move", "reboot-device"],
    Trapper: ["pursue", "send-message", "paralyze-avatar"],
    Executioner: ["paralyze-avatar", "stun-avatar", "kill-avatar", "send-message"],
    "Custom Programming": [],
  });
});

test("profile commands have stable keys, order and action mapping", () => {
  const commands = profileCommands("Trapper", "demon");
  assert.deepEqual(commands.map(({ key, priority, actionKey }) => [key, priority, actionKey]), [
    ["pursue", 1, "pursue"],
    ["send-message", 2, "send-message"],
    ["paralyze-avatar", 3, "paralyze-avatar"],
  ]);
});

test("Tripwire capacity and every profile command count use central definitions", () => {
  assert.equal(demonClassCommandCapacity("Tripwire"), 2);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(CWN_DEMON_PROGRAMMING_PROFILES)
        .map((profile) => [profile, profileCommandCount(profile)]),
    ),
    {
      Bouncer: 2,
      Patroller: 4,
      Gatekeeper: 2,
      Shieldbearer: 2,
      Repairman: 3,
      Trapper: 3,
      Executioner: 4,
      "Custom Programming": 0,
    },
  );
});

test("Tripwire accepts two-line profiles, hides larger profiles, and keeps Custom Programming", () => {
  assert.equal(isProgrammingProfileCompatible("Tripwire", "Bouncer"), true);
  assert.equal(isProgrammingProfileCompatible("Tripwire", "Patroller"), false);
  assert.deepEqual(compatibleProgrammingProfiles("Tripwire"), [
    "Bouncer",
    "Gatekeeper",
    "Shieldbearer",
    "custom",
  ]);
});

test("class changes preserve compatible profiles and safely reset incompatible profiles", () => {
  assert.deepEqual(resolveProgrammingProfileSelection("Tripwire", "Bouncer"), {
    profile: "Bouncer",
    compatible: true,
    changed: false,
  });
  assert.deepEqual(resolveProgrammingProfileSelection("Tripwire", "Patroller"), {
    profile: "custom",
    compatible: false,
    changed: true,
  });
});

test("Custom Demon uses a stored positive limit but invents no limit when configured as zero", () => {
  assert.equal(demonClassCommandCapacity("custom", 6), 6);
  assert.equal(demonClassCommandCapacity("custom", 0), null);
  assert.equal(isProgrammingProfileCompatible("custom", "Executioner", 0), true);
});

test("live capacity counts profile, additional, and custom programming lines", () => {
  assert.deepEqual(commandCapacityState({
    classKey: "Mastiff",
    programmingProfile: "Bouncer",
    additionalCount: 1,
    customCommandText: "First custom line\n\nSecond custom line",
  }), {
    count: 5,
    limit: 4,
    profileCount: 2,
    additionalCount: 1,
    customCount: 2,
    exceeded: true,
    atCapacity: false,
    canAdd: false,
    remaining: 0,
  });
});

test("at-capacity state prevents additions and reducing lines restores eligibility", () => {
  const demon = createDemonFromTemplate("Tripwire", "demon", "Bouncer");
  const full = commandCapacityState(demon);
  assert.deepEqual(
    [full.count, full.limit, full.atCapacity, full.canAdd, full.exceeded],
    [2, 2, true, false, false],
  );
  const rejected = addCommonCommand(demon, "reboot-device", "extra");
  assert.deepEqual([rejected.added, rejected.reason], [false, "capacity"]);
  const reduced = {
    ...demon,
    programmingProfile: "custom",
    profileCommandLines: [],
    customCommandLines: [{ text: "One line" }],
  };
  assert.equal(commandCapacityState(reduced).canAdd, true);
  assert.equal(addCommonCommand(reduced, "reboot-device", "extra").added, true);
});

test("additional Common Command Lines persist and duplicates are rejected", () => {
  let demon = createDemonFromTemplate("Hydra", "demon", "Bouncer");
  let result = addCommonCommand(demon, "reboot-device", "extra");
  assert.equal(result.added, true);
  demon = result.demon;
  assert.equal(demon.additionalCommandLines[0].key, "reboot-device");
  result = addCommonCommand(demon, "reboot-device", "duplicate");
  assert.deepEqual([result.added, result.reason], [false, "duplicate"]);
});

test("command limits are reported without truncating lines", () => {
  let demon = createDemonFromTemplate("Tripwire", "demon", "Bouncer");
  demon = addCommonCommand(
    demon,
    "reboot-device",
    "extra",
    { allowOverCapacity: true },
  ).demon;
  const result = validateCommandLimit(demon);
  assert.deepEqual(result, { count: 3, limit: 2, exceeded: true });
  assert.equal(demon.additionalCommandLines.length, 1);
});

test("normalization preserves existing over-capacity Demon commands without truncation", () => {
  const source = networkWithDemon({
    classKey: "Tripwire",
    programmingProfile: "Patroller",
    profileCommandLines: profileCommands("Patroller", "legacy"),
    additionalCommandLines: [{
      id: "extra",
      key: "send-message",
      priority: 5,
      text: "Preserved extra",
      actionKey: "send-message",
      sourceType: "common",
    }],
  });
  const normalized = normalizeNetwork(source).nodes[0].demons[0];
  assert.equal(normalized.profileCommandLines.length, 4);
  assert.equal(normalized.additionalCommandLines.length, 1);
  assert.equal(commandCapacityState(normalized).exceeded, true);
});

test("legacy Verb and Subject migrate to a preserved legacy command", () => {
  const demon = normalizeNetwork(networkWithDemon({
    currentVerb: "Stun",
    currentSubject: "Avatar",
  })).nodes[0].demons[0];
  assert.match(demon.customCommandLines.at(-1).text, /Stun Avatar/);
  assert.equal(demon.customCommandLines.at(-1).sourceType, "legacy");
});

test("legacy command text is preserved", () => {
  const demon = normalizeNetwork(networkWithDemon({
    commands: ["Patrol the archive"],
  })).nodes[0].demons[0];
  assert.equal(demon.customCommandLines[0].text, "Patrol the archive");
});

test("schema migration is idempotent", () => {
  const once = normalizeNetwork(networkWithDemon());
  assert.deepEqual(normalizeNetwork(once), once);
});

test("hidden and revealed Demon projections remain sanitized", () => {
  const hidden = normalizeNetwork(networkWithDemon({ revealed: false }));
  assert.deepEqual(sanitizeNetworkForPlayers(hidden).nodes[0].demons, []);
  hidden.nodes[0].demons[0].revealed = true;
  const projected = sanitizeNetworkForPlayers(hidden).nodes[0].demons[0];
  assert.deepEqual(Object.keys(projected).sort(), ["id", "isFragged", "name", "revealed"]);
  for (const key of ["currentHp", "maxHp", "skillBonus", "notes", "profileCommandLines"]) {
    assert.equal(key in projected, false);
  }
});

test("Fragged Demon and player cannot execute actions", () => {
  const demon = createDemonFromTemplate("Mastiff", "demon");
  assert.deepEqual(canExecuteDemonAction({ ...demon, currentHp: 0, state: "fragged" }, "stun-avatar"), {
    allowed: false,
    reason: "fragged",
  });
  assert.deepEqual(canExecuteDemonAction(demon, "stun-avatar", false), {
    allowed: false,
    reason: "gm-only",
  });
});

test("action registry distinguishes opposed, no-roll and manual actions", () => {
  assert.equal(DEMON_ACTIONS["stun-avatar"].resolution, "opposed");
  assert.equal(DEMON_ACTIONS["alert-network"].resolution, "no-roll");
  assert.equal(DEMON_ACTIONS.pursue.resolution, "manual");
  assert.equal(actionRequiresTarget("stun-avatar"), true);
  assert.equal(actionRequiresTarget("send-message"), false);
});

test("opposed Demon commands use the exact CWN modifiers and damage formulas", () => {
  assert.deepEqual(
    [
      DEMON_ACTIONS["stun-avatar"].rollFormula,
      DEMON_ACTIONS["stun-avatar"].checkModifier,
      DEMON_ACTIONS["stun-avatar"].damageFormula,
    ],
    ["2d6 + @skillBonus + 1", 1, "max(1, @skillBonus)d10"],
  );
  assert.deepEqual(
    [
      DEMON_ACTIONS["paralyze-avatar"].rollFormula,
      DEMON_ACTIONS["paralyze-avatar"].checkModifier,
    ],
    ["2d6 + @skillBonus - 1", -1],
  );
  assert.deepEqual(
    [
      DEMON_ACTIONS["kill-avatar"].rollFormula,
      DEMON_ACTIONS["kill-avatar"].checkModifier,
      DEMON_ACTIONS["kill-avatar"].damageFormula,
    ],
    ["2d6 + @skillBonus", 0, "max(1, @skillBonus)d10"],
  );
});

test("Demon roll breakdowns identify skill, action modifier, and damage dice", () => {
  const stun = demonActionRollBreakdowns(
    { skillBonus: 3 },
    DEMON_ACTIONS["stun-avatar"],
  );
  assert.deepEqual(stun.check.map(({ label, value, total }) => ({
    label,
    value,
    total: Boolean(total),
  })), [
    {
      label: "CWNCE.Breakdown.DemonSkillBonus",
      value: 3,
      total: false,
    },
    {
      label: "Stun Avatar modifier",
      value: 1,
      total: false,
    },
    {
      label: "CWNCE.Breakdown.TotalModifier",
      value: 4,
      total: true,
    },
  ]);
  assert.deepEqual(stun.damage.map(({ label, value, total }) => ({
    label,
    value,
    total: Boolean(total),
  })), [
    {
      label: "CWNCE.Breakdown.DemonSkillBonus",
      value: 3,
      total: false,
    },
    {
      label: "CWNCE.Breakdown.DamageDiceFromSkill",
      value: "3d10",
      total: true,
    },
  ]);

  const paralyze = demonActionRollBreakdowns(
    { skillBonus: 5 },
    DEMON_ACTIONS["paralyze-avatar"],
  );
  assert.equal(paralyze.check.at(-1).value, 4);
  assert.deepEqual(paralyze.damage, []);
});

test("required targets and invalid target types are enforced", () => {
  assert.equal(validateActionTarget("stun-avatar", null), false);
  assert.equal(validateActionTarget("stun-avatar", { type: "hacker", id: "actor" }), true);
  assert.equal(validateActionTarget("stun-avatar", { type: "node", id: "node" }), false);
  assert.equal(validateActionTarget("send-message", null), true);
});

test("program compatibility still rejects invalid Verb Subject pairs", () => {
  assert.equal(programsAreRulesCompatible("Stun", "Avatar"), true);
  assert.equal(programsAreRulesCompatible("Stun", "Door"), false);
});

test("Alert progress clamps at two", () => {
  assert.equal(nextAlertProgress(-5), 1);
  assert.equal(nextAlertProgress(1), 2);
  assert.equal(nextAlertProgress(2), 2);
  assert.equal(nextAlertProgress(99), 2);
});

test("damage clamps at zero and marks the Demon Fragged", () => {
  const demon = createDemonFromTemplate("Mastiff", "demon");
  const damaged = applyDemonDamage(demon, 99);
  assert.equal(damaged.currentHp, 0);
  assert.equal(damaged.state, "fragged");
});

test("public chat context excludes HP, skill, notes and commands", () => {
  const demon = {
    ...createDemonFromTemplate("Mastiff", "demon", "Patroller"),
    revealed: false,
    notes: "secret",
  };
  const context = publicDemonChatContext({
    demon,
    networkName: "Net",
    nodeName: "Node",
    actionKey: "stun-avatar",
  });
  assert.equal(context.demonName, "Hidden Demon");
  for (const key of ["currentHp", "skillBonus", "notes", "commands"]) {
    assert.equal(key in context, false);
  }
});

test("movement validates one-way direction and locked barriers", () => {
  const network = networkWithDemon();
  assert.equal(validDemonDestinations(network, "node-a")[0].id, "node-b");
  assert.deepEqual(validDemonDestinations(network, "node-b"), []);
  network.connections[0].barrier = true;
  network.connections[0].barrierLocked = true;
  assert.equal(validDemonDestinations(network, "node-a")[0].blocked, true);
});

test("malformed Demon arrays normalize safely", () => {
  const network = networkWithDemon();
  network.nodes[0].demons = [null, false, {
    name: "Broken",
    classKey: "custom",
    maxHp: "bad",
    profileCommandLines: [null, 12],
    additionalCommandLines: {},
  }];
  assert.doesNotThrow(() => normalizeNetwork(network));
  assert.equal(normalizeNetwork(network).nodes[0].demons.length, 1);
});

test("node Description and GM Notes remain stored in schema v3", () => {
  const network = networkWithDemon();
  network.nodes[0].description = "Player-safe detail";
  network.nodes[0].gmNotes = "Private note";
  const node = normalizeNetwork(network).nodes[0];
  assert.equal(node.description, "Player-safe detail");
  assert.equal(node.gmNotes, "Private note");
});

test("structured damage flags require GM execution and complete typed data", () => {
  const valid = {
    kind: "demon-damage",
    producer: "cwn-combat-enhancements",
    damage: 7,
    networkId: "network",
    nodeId: "node",
    demonId: "demon",
  };
  assert.equal(isTrustedDemonDamageFlag(valid, false), false);
  assert.equal(isTrustedDemonDamageFlag(valid, true), true);
  assert.equal(isTrustedDemonDamageFlag({ ...valid, damage: "7" }, true), false);
  assert.equal(isTrustedDemonDamageFlag({ ...valid, producer: "user-input" }, true), false);
  assert.equal(isTrustedDemonDamageFlag(valid, true, 6), false);
});

test("Common Command Line catalog is concise and source-backed", () => {
  assert.equal(Object.values(CWN_COMMON_COMMAND_LINES).filter((entry) => !entry.profileOnly).length, 12);
});
