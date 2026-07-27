import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDemonToNode,
  connectionExists,
  createDemonFromTemplate,
  createNode,
  deleteNodeAndConnections,
  duplicateNode,
  isValidPosition,
  normalizeNetwork,
  persistDemonToNode,
  sanitizeNetworkForPlayers,
} from "../scripts/network-console/network-model.mjs";

function legacyNetwork(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "network-1",
    name: "Legacy",
    nodes: [{
      id: "node-1",
      name: "Archive",
      type: "databank",
      revealed: true,
      datafiles: "Payroll archive",
      demons: "Mastiff patrol",
      watchdogs: "Veteran tech",
    }],
    connections: [],
    ...overrides,
  };
}

test("legacy node gains a safe position", () => {
  const node = normalizeNetwork(legacyNetwork()).nodes[0];
  assert.equal(isValidPosition(node.position), true);
  assert.ok(node.position.x >= 0);
  assert.ok(node.position.y >= 0);
});

test("legacy datafile string is preserved", () => {
  assert.equal(normalizeNetwork(legacyNetwork()).nodes[0].datafiles[0].name, "Payroll archive");
});

test("legacy Demon string is preserved", () => {
  assert.equal(normalizeNetwork(legacyNetwork()).nodes[0].demons[0].name, "Mastiff patrol");
});

test("legacy Watchdog string is preserved", () => {
  assert.equal(normalizeNetwork(legacyNetwork()).nodes[0].watchdogs[0].name, "Veteran tech");
});

test("migration is idempotent", () => {
  const once = normalizeNetwork(legacyNetwork());
  assert.deepEqual(normalizeNetwork(once), once);
});

test("hidden datafiles are absent from player projection", () => {
  const network = normalizeNetwork(legacyNetwork());
  network.nodes[0].datafiles[0].revealed = false;
  assert.deepEqual(sanitizeNetworkForPlayers(network).nodes[0].datafiles, []);
});

test("revealed datafiles retain safe fields only", () => {
  const network = normalizeNetwork(legacyNetwork());
  Object.assign(network.nodes[0].datafiles[0], {
    revealed: true,
    gmNotes: "secret",
    unexpected: "secret",
  });
  assert.deepEqual(
    Object.keys(sanitizeNetworkForPlayers(network).nodes[0].datafiles[0]).sort(),
    ["copied", "description", "id", "name", "revealed", "value"],
  );
});

test("hidden Demons are absent from player projection", () => {
  const network = normalizeNetwork(legacyNetwork());
  network.nodes[0].demons[0].revealed = false;
  assert.deepEqual(sanitizeNetworkForPlayers(network).nodes[0].demons, []);
});

test("revealed Demons expose only safe fields", () => {
  const network = normalizeNetwork(legacyNetwork());
  network.nodes[0].demons[0].revealed = true;
  assert.deepEqual(
    Object.keys(sanitizeNetworkForPlayers(network).nodes[0].demons[0]).sort(),
    ["id", "isFragged", "name", "revealed"],
  );
});

test("Demon notes, commands, and programs do not leak", () => {
  const network = normalizeNetwork(legacyNetwork());
  Object.assign(network.nodes[0].demons[0], {
    revealed: true,
    notes: "secret",
    commands: [{ id: "command", text: "secret" }],
    currentVerb: "Stun",
    currentSubject: "Avatar",
  });
  const demon = sanitizeNetworkForPlayers(network).nodes[0].demons[0];
  assert.equal("notes" in demon, false);
  assert.equal("commands" in demon, false);
  assert.equal("currentVerb" in demon, false);
  assert.equal("currentSubject" in demon, false);
});

test("hidden nodes suppress their Demons and datafiles", () => {
  const network = normalizeNetwork(legacyNetwork());
  network.nodes[0].revealed = false;
  network.nodes[0].datafiles[0].revealed = true;
  network.nodes[0].demons[0].revealed = true;
  assert.deepEqual(sanitizeNetworkForPlayers(network).nodes, []);
});

test("new node position is clamped and valid", () => {
  const node = createNode({
    id: "node-2",
    position: { x: -1000, y: 9000 },
  });
  assert.deepEqual(node.position, { x: 32, y: 9000 });
  assert.equal(isValidPosition(node.position), true);
});

test("duplicate automatic connections are detected in either direction", () => {
  const connections = [{ id: "connection", source: "a", target: "b" }];
  assert.equal(connectionExists(connections, "a", "b"), true);
  assert.equal(connectionExists(connections, "b", "a"), true);
  assert.equal(connectionExists(connections, "a", "c"), false);
});

test("node duplication creates a new ID and offset position", () => {
  const result = duplicateNode(
    legacyNetwork({ nodes: [{ id: "node-1", name: "Camera", position: { x: 40, y: 50 } }] }),
    "node-1",
    "node-copy",
  );
  assert.equal(result.node.id, "node-copy");
  assert.notDeepEqual(result.node.position, { x: 40, y: 50 });
});

test("deleting a node removes all of its connections", () => {
  const network = {
    ...legacyNetwork(),
    nodes: [
      { id: "node-1", name: "One" },
      { id: "node-2", name: "Two" },
      { id: "node-3", name: "Three" },
    ],
    connections: [
      { id: "a", source: "node-1", target: "node-2" },
      { id: "b", source: "node-2", target: "node-3" },
    ],
  };
  const result = deleteNodeAndConnections(network, "node-2");
  assert.deepEqual(result.connections, []);
  assert.deepEqual(result.nodes.map((node) => node.id), ["node-1", "node-3"]);
});

test("malformed structured arrays do not crash normalization", () => {
  const network = legacyNetwork();
  network.nodes[0].datafiles = [null, 12, { name: "Valid" }];
  network.nodes[0].demons = [{ name: "Valid", commands: [null, 12, "Patrol"] }, false];
  network.nodes[0].watchdogs = { name: "wrong container" };
  assert.doesNotThrow(() => normalizeNetwork(network));
  const normalized = normalizeNetwork(network);
  assert.equal(normalized.nodes[0].datafiles.length, 1);
  assert.equal(normalized.nodes[0].demons.length, 1);
  assert.equal(normalized.nodes[0].watchdogs.length, 0);
});

test("source-backed Demon template populates exact class statistics", () => {
  const expected = {
    Tripwire: { hp: 3, skill: 1, lines: 2, cost: 5000 },
    Mastiff: { hp: 5, skill: 2, lines: 4, cost: 10000 },
    Siren: { hp: 8, skill: 3, lines: 2, cost: 15000 },
    Cataphract: { hp: 20, skill: 3, lines: 3, cost: 25000 },
    Ogre: { hp: 25, skill: 2, lines: 4, cost: 50000 },
    Headsman: { hp: 30, skill: 3, lines: 4, cost: 100000 },
    Hydra: { hp: 40, skill: 4, lines: 7, cost: 200000 },
    Nemesis: { hp: 50, skill: 5, lines: 5, cost: 500000 },
  };
  for (const [className, stats] of Object.entries(expected)) {
    const demon = createDemonFromTemplate(className, `demon-${className}`);
    assert.deepEqual(
      {
        hp: demon.maxHp,
        current: demon.currentHp,
        skill: demon.skillBonus,
        lines: demon.lineLimit,
        cost: demon.cost,
      },
      { ...stats, current: stats.hp },
      className,
    );
  }
});

function demonNetwork() {
  return normalizeNetwork({
    schemaVersion: 3,
    id: "demon-network",
    name: "Demon Test",
    nodes: [
      { id: "node-a", name: "Alpha", demons: [] },
      { id: "node-b", name: "Beta", demons: [] },
    ],
    connections: [],
  });
}

test("a standard Demon is added to an empty node with class defaults", () => {
  const demon = createDemonFromTemplate("Tripwire", "tripwire", "Bouncer");
  const result = appendDemonToNode(demonNetwork(), "node-a", demon);
  assert.equal(result.added, true);
  assert.deepEqual(
    result.network.nodes[0].demons.map(({ id, classKey, currentHp, maxHp, skillBonus }) =>
      ({ id, classKey, currentHp, maxHp, skillBonus })),
    [{
      id: "tripwire",
      classKey: "Tripwire",
      currentHp: 3,
      maxHp: 3,
      skillBonus: 1,
    }],
  );
});

test("a Custom Demon preserves entered encounter values when added", () => {
  const result = appendDemonToNode(demonNetwork(), "node-a", {
    id: "custom",
    classKey: "custom",
    name: "Glass Spider",
    currentHp: 7,
    maxHp: 11,
    skillBonus: 4,
    programmingProfile: "custom",
    profileCommandLines: [],
    additionalCommandLines: [],
    customCommandLines: [{
      id: "custom-line",
      priority: 1,
      text: "Guard the archive.",
      sourceType: "custom",
    }],
    revealed: true,
    notes: "Private",
  });
  assert.equal(result.added, true);
  assert.deepEqual(
    {
      name: result.demon.name,
      currentHp: result.demon.currentHp,
      maxHp: result.demon.maxHp,
      skillBonus: result.demon.skillBonus,
      revealed: result.demon.revealed,
      notes: result.demon.notes,
    },
    {
      name: "Glass Spider",
      currentHp: 7,
      maxHp: 11,
      skillBonus: 4,
      revealed: true,
      notes: "Private",
    },
  );
});

test("adding a second Demon retains the first", () => {
  const first = appendDemonToNode(
    demonNetwork(),
    "node-a",
    createDemonFromTemplate("Tripwire", "first", "Bouncer"),
  );
  const second = appendDemonToNode(
    first.network,
    "node-a",
    createDemonFromTemplate("Mastiff", "second", "Gatekeeper"),
  );
  assert.deepEqual(second.network.nodes[0].demons.map((demon) => demon.id), ["first", "second"]);
});

test("Demons are added only to their canonical node IDs", () => {
  let network = appendDemonToNode(
    demonNetwork(),
    "node-a",
    createDemonFromTemplate("Tripwire", "first", "Bouncer"),
  ).network;
  network = appendDemonToNode(
    network,
    "node-b",
    createDemonFromTemplate("Mastiff", "second", "Gatekeeper"),
  ).network;
  assert.deepEqual(network.nodes.map((node) => node.demons.map((demon) => demon.id)), [
    ["first"],
    ["second"],
  ]);
});

test("profile and additional command lines survive added-Demon normalization", () => {
  const demon = createDemonFromTemplate("Hydra", "hydra", "Bouncer");
  demon.additionalCommandLines.push({
    id: "additional",
    key: "reboot-device",
    priority: 3,
    text: "Reboot a deactivated device on this node and message the Watchdogs.",
    actionKey: "reboot-device",
    sourceType: "common",
  });
  const result = appendDemonToNode(demonNetwork(), "node-a", demon);
  assert.equal(result.demon.programmingProfile, "Bouncer");
  assert.deepEqual(result.demon.profileCommandLines.map((line) => line.key), [
    "stun-avatar",
    "alert-repelled",
  ]);
  assert.deepEqual(result.demon.additionalCommandLines.map((line) => line.key), [
    "reboot-device",
  ]);
});

test("save failure rejects instead of reporting a successful Demon submission", async () => {
  let saveAttempts = 0;
  await assert.rejects(
    persistDemonToNode({
      loadNetwork: () => demonNetwork(),
      saveNetwork: async () => {
        saveAttempts += 1;
        throw new Error("Journal update failed");
      },
      nodeId: "node-a",
      demon: createDemonFromTemplate("Tripwire", "tripwire", "Bouncer"),
    }),
    /Journal update failed/,
  );
  assert.equal(saveAttempts, 1);
});

test("repeated submission of the same Demon ID cannot create a duplicate", async () => {
  let stored = demonNetwork();
  let saves = 0;
  const demon = createDemonFromTemplate("Tripwire", "stable-id", "Bouncer");
  const options = {
    loadNetwork: () => stored,
    saveNetwork: async (network) => {
      stored = network;
      saves += 1;
    },
    nodeId: "node-a",
    demon,
  };
  await persistDemonToNode(options);
  await assert.rejects(persistDemonToNode(options), /duplicate-demon/);
  assert.equal(stored.nodes[0].demons.length, 1);
  assert.equal(saves, 1);
});

test("legacy network normalization retains newly added schema-v3 Demons", () => {
  const network = legacyNetwork({
    nodes: [{
      id: "node-1",
      name: "Archive",
      demons: [createDemonFromTemplate("Mastiff", "schema-v3-demon", "Gatekeeper")],
    }],
  });
  const demon = normalizeNetwork(network).nodes[0].demons[0];
  assert.deepEqual(
    [demon.id, demon.classKey, demon.programmingProfile],
    ["schema-v3-demon", "Mastiff", "Gatekeeper"],
  );
});
