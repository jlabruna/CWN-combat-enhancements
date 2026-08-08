import assert from "node:assert/strict";
import test from "node:test";

import {
  PROGRAM_REQUEST_TTL_MS,
  programRequestIsFresh,
  programResourceState,
  programRollContext,
  runningProgramSource,
} from "../scripts/network-console/network-program-rules.mjs";

function character(overrides = {}) {
  return {
    type: "character",
    system: { access: { value: 8 }, stats: { int: { mod: 2 } }, ...overrides.system },
    items: [{ type: "skill", name: "Program", system: { pool: "2d6", rank: 1 } }],
    ...overrides,
  };
}

function cyberdeck(overrides = {}) {
  return {
    system: {
      bonusAccess: 0,
      cpu: { value: 2 },
      skillCheckMod: 1,
      crownPenalty: false,
      ...overrides,
    },
  };
}

const verb = {
  name: "Stun",
  img: "stun.webp",
  system: { type: "verb", accessCost: 3, selfTerminating: true, skillCheckMod: 1, cost: 2 },
};
const subject = {
  name: "Avatar",
  system: { type: "subject", target: "avatar", skillCheckMod: -1 },
};

test("program requests expire after five minutes", () => {
  const now = 1_000_000;
  assert.equal(programRequestIsFresh(now - PROGRAM_REQUEST_TTL_MS, now), true);
  assert.equal(programRequestIsFresh(now - PROGRAM_REQUEST_TTL_MS - 1, now), false);
  assert.equal(programRequestIsFresh(0, now), false);
});

test("Access validation includes bonus Access but spends the hacker's Access", () => {
  const state = programResourceState({
    hacker: character({ system: { access: { value: 2 }, stats: { int: { mod: 2 } } } }),
    cyberdeck: cyberdeck({ bonusAccess: 2 }),
    accessCost: 3,
    selfTerminating: true,
  });
  assert.equal(state.valid, true);
  assert.equal(state.availableAccess, 4);
  assert.equal(state.accessAfter, -1);
  assert.equal(state.availableAfter, 1);
});

test("program execution rejects insufficient Access", () => {
  const state = programResourceState({
    hacker: character({ system: { access: { value: 1 }, stats: { int: { mod: 2 } } } }),
    cyberdeck: cyberdeck(),
    accessCost: 3,
    selfTerminating: true,
  });
  assert.equal(state.valid, false);
  assert.equal(state.reason, "insufficient-access");
});

test("persistent programs require CPU while self-terminating programs do not", () => {
  const deck = cyberdeck({ cpu: { value: 0 } });
  assert.equal(programResourceState({ hacker: character(), cyberdeck: deck, accessCost: 1 }).reason, "insufficient-cpu");
  assert.equal(programResourceState({ hacker: character(), cyberdeck: deck, accessCost: 1, selfTerminating: true }).valid, true);
});

test("character program rolls use Program, Intelligence, deck, Crown, and session wireless context", () => {
  const context = programRollContext({
    hacker: character(),
    cyberdeck: cyberdeck({ crownPenalty: true }),
    verb,
    subject,
    wirelessPenalty: -2,
  });
  assert.deepEqual(context.data, {
    skillRoll: "2d6",
    skillMod: 1,
    programMod: 0,
    deckMod: 1,
    attrMod: 2,
    crownPenalty: -1,
    wirelessPenalty: -2,
  });
});

test("NPC program rolls use the NPC skill bonus and no attribute", () => {
  const context = programRollContext({
    hacker: { type: "npc", system: { skillBonus: 3 } },
    cyberdeck: cyberdeck(),
    verb,
    subject,
  });
  assert.equal(context.data.skillMod, 3);
  assert.equal(context.data.attrMod, 0);
  assert.equal(context.breakdown.some((entry) => entry.label === "Intelligence modifier"), false);
});

test("wireless penalty is either zero or the RAW -2", () => {
  const base = { hacker: character(), cyberdeck: cyberdeck(), verb, subject };
  assert.equal(programRollContext({ ...base, wirelessPenalty: 0 }).data.wirelessPenalty, 0);
  assert.equal(programRollContext({ ...base, wirelessPenalty: -9 }).data.wirelessPenalty, -2);
});

test("running program source records execution provenance", () => {
  const source = runningProgramSource({
    verb,
    subject,
    networkId: "network",
    nodeId: "node",
    sessionId: "session",
    requestId: "request",
  });
  assert.equal(source.name, "Stun Avatar");
  assert.equal(source.type, "program");
  assert.equal(source.system.type, "running");
  assert.equal(source.system.selfTerminating, true);
  assert.deepEqual(source.flags["cwn-combat-enhancements"].networkProgramExecution, {
    networkId: "network",
    nodeId: "node",
    sessionId: "session",
    requestId: "request",
  });
});
