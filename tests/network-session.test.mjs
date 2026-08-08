import assert from "node:assert/strict";
import test from "node:test";

import {
  addHackerSession,
  createHackerSession,
  deleteNodeAndConnections,
  endHackerSession,
  moveHackerSession,
  normalizeNetwork,
  sanitizeNetworkForPlayers,
  sessionsForUser,
  validateHackerMove,
} from "../scripts/network-console/network-model.mjs";

function network(overrides = {}) {
  return normalizeNetwork({
    schemaVersion: 3,
    id: "network-1",
    name: "Test Network",
    nodes: [
      { id: "entry", name: "Entry", revealed: true },
      { id: "middle", name: "Middle", revealed: true },
      { id: "hidden", name: "Hidden", revealed: false },
    ],
    connections: [
      { id: "forward", source: "entry", target: "middle", revealed: true },
      { id: "secret", source: "middle", target: "hidden", revealed: false },
    ],
    ...overrides,
  });
}

function session(overrides = {}) {
  return createHackerSession({
    id: "session-1",
    networkId: "network-1",
    journalUuid: "JournalEntry.network-journal",
    userId: "user-1",
    hackerUuid: "Actor.hacker",
    hackerName: "Xen0n",
    cyberdeckUuid: "Actor.deck",
    cyberdeckName: "Black ICE",
    nodeId: "entry",
    timestamp: 100,
    ...overrides,
  });
}

test("schema-v3 networks migrate to schema v4 with an empty session list", () => {
  const migrated = network();
  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.sessions, []);
  assert.deepEqual(normalizeNetwork(migrated), migrated);
});

test("a durable active session is added without duplication", () => {
  const first = addHackerSession(network(), session());
  assert.equal(first.added, true);
  assert.equal(first.network.sessions[0].currentNodeId, "entry");
  assert.equal(addHackerSession(first.network, session()).reason, "duplicate-session");
});

test("the shared player network projection never contains sessions", () => {
  const canonical = addHackerSession(network(), session()).network;
  assert.equal("sessions" in sanitizeNetworkForPlayers(canonical), false);
});

test("targeted session projections expose only the requesting user's safe fields", () => {
  let canonical = addHackerSession(network(), session()).network;
  canonical = addHackerSession(canonical, session({ id: "session-2", userId: "user-2" })).network;
  const projected = sessionsForUser(canonical, "user-1");
  assert.equal(projected.length, 1);
  assert.deepEqual(Object.keys(projected[0]).sort(), [
    "connectionType", "currentNodeId", "cyberdeckName", "hackerName", "id",
    "jackedIn", "networkId", "userId", "wirelessPenalty",
  ]);
  assert.equal(JSON.stringify(projected).includes("Actor."), false);
});

test("targeted projections do not identify a hidden current node", () => {
  const hidden = session({ nodeId: "hidden" });
  const canonical = addHackerSession(network(), hidden).network;
  assert.equal(sessionsForUser(canonical, "user-1")[0].currentNodeId, "");
});

test("physical sessions can move one hop in either direction on a normal connection", () => {
  let canonical = addHackerSession(network(), session()).network;
  let result = moveHackerSession(canonical, "session-1", "middle", "user-1", 200);
  assert.equal(result.moved, true);
  assert.equal(result.network.sessions[0].currentNodeId, "middle");
  result = moveHackerSession(result.network, "session-1", "entry", "user-1", 300);
  assert.equal(result.moved, true);
  assert.equal(result.network.sessions[0].updatedAt, 300);
});

test("one-way connections permit only source-to-target movement", () => {
  const oneWay = network({
    connections: [{ id: "forward", source: "entry", target: "middle", revealed: true, oneWay: true }],
  });
  let canonical = addHackerSession(oneWay, session()).network;
  canonical = moveHackerSession(canonical, "session-1", "middle", "user-1").network;
  assert.equal(validateHackerMove(canonical, "session-1", "entry", "user-1").reason, "not-adjacent");
});

test("wireless sessions cannot move nodes", () => {
  const canonical = addHackerSession(network(), session({ connectionType: "wireless" })).network;
  assert.equal(validateHackerMove(canonical, "session-1", "middle", "user-1").reason, "wireless");
  assert.equal(sessionsForUser(canonical, "user-1")[0].wirelessPenalty, -2);
});

test("locked barriers, hidden routes, non-adjacent nodes, and wrong users are rejected", () => {
  const locked = network({
    connections: [{
      id: "forward", source: "entry", target: "middle", revealed: true,
      barrier: true, barrierLocked: true,
    }],
  });
  const canonical = addHackerSession(locked, session()).network;
  assert.equal(validateHackerMove(canonical, "session-1", "middle", "user-1").reason, "locked-barrier");
  assert.equal(validateHackerMove(canonical, "session-1", "hidden", "user-1").reason, "hidden-destination");
  assert.equal(validateHackerMove(canonical, "session-1", "middle", "user-2").reason, "wrong-user");
});

test("ending a session removes only that session and enforces ownership", () => {
  let canonical = addHackerSession(network(), session()).network;
  canonical = addHackerSession(canonical, session({ id: "session-2", userId: "user-2" })).network;
  assert.equal(endHackerSession(canonical, "session-1", "user-2").reason, "wrong-user");
  const ended = endHackerSession(canonical, "session-1", "user-1");
  assert.equal(ended.ended, true);
  assert.deepEqual(ended.network.sessions.map((entry) => entry.id), ["session-2"]);
});

test("deleting a session node also removes the bound session", () => {
  const canonical = addHackerSession(network(), session()).network;
  assert.deepEqual(deleteNodeAndConnections(canonical, "entry").sessions, []);
});
