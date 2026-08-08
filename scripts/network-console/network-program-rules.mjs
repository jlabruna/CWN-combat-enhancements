export const PROGRAM_REQUEST_TTL_MS = 5 * 60 * 1000;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function itemsOf(actor) {
  if (Array.isArray(actor?.items?.contents)) return actor.items.contents;
  if (actor?.items && typeof actor.items[Symbol.iterator] === "function") {
    return Array.from(actor.items);
  }
  return [];
}

export function programRequestIsFresh(requestedAt, now = Date.now()) {
  const timestamp = number(requestedAt, 0);
  return timestamp > 0 && now >= timestamp && now - timestamp <= PROGRAM_REQUEST_TTL_MS;
}

export function programResourceState({ hacker, cyberdeck, accessCost = 0, selfTerminating = false } = {}) {
  const hackerAccess = number(hacker?.system?.access?.value, 0);
  const bonusAccess = number(cyberdeck?.system?.bonusAccess, 0);
  const availableAccess = hackerAccess + bonusAccess;
  const cost = Math.max(0, number(accessCost, 0));
  const cpuAvailable = Math.max(0, number(cyberdeck?.system?.cpu?.value, 0));
  const needsCpu = !selfTerminating;

  if (availableAccess < cost) {
    return {
      valid: false,
      reason: "insufficient-access",
      hackerAccess,
      bonusAccess,
      availableAccess,
      accessCost: cost,
      accessAfter: hackerAccess,
      availableAfter: availableAccess,
      cpuAvailable,
      needsCpu,
    };
  }
  if (needsCpu && cpuAvailable < 1) {
    return {
      valid: false,
      reason: "insufficient-cpu",
      hackerAccess,
      bonusAccess,
      availableAccess,
      accessCost: cost,
      accessAfter: hackerAccess,
      availableAfter: availableAccess,
      cpuAvailable,
      needsCpu,
    };
  }

  // This mirrors SWNR 2.3.1: bonus Access increases the amount available, while
  // the actual expenditure is recorded against the linked hacker's Access.
  const accessAfter = hackerAccess - cost;
  return {
    valid: true,
    reason: "",
    hackerAccess,
    bonusAccess,
    availableAccess,
    accessCost: cost,
    accessAfter,
    availableAfter: accessAfter + bonusAccess,
    cpuAvailable,
    needsCpu,
  };
}

export function programRollContext({ hacker, cyberdeck, verb, subject, wirelessPenalty = 0 } = {}) {
  const actorType = String(hacker?.type ?? "");
  let skillDice = "2d6";
  let skillModifier = 0;
  let attributeModifier = 0;
  let skillLabel = "Program";

  if (actorType === "character") {
    const skill = itemsOf(hacker).find(
      (item) => item?.type === "skill" && String(item.name).toLowerCase() === "program",
    );
    if (skill) {
      const pool = String(skill.system?.pool ?? "").trim();
      if (pool && pool !== "ask") skillDice = pool;
      skillModifier = number(skill.system?.rank, 0);
      skillLabel = skill.name || "Program";
    }
    attributeModifier = number(hacker?.system?.stats?.int?.mod, 0);
  } else if (actorType === "npc") {
    skillModifier = number(hacker?.system?.skillBonus, 0);
    skillLabel = "NPC skill bonus";
  }

  const programModifier =
    number(verb?.system?.skillCheckMod, 0) +
    number(subject?.system?.skillCheckMod, 0);
  const deckModifier = number(cyberdeck?.system?.skillCheckMod, 0);
  const crownPenalty = cyberdeck?.system?.crownPenalty ? -1 : 0;
  const safeWirelessPenalty = number(wirelessPenalty, 0) < 0 ? -2 : 0;
  const data = {
    skillRoll: skillDice,
    skillMod: skillModifier,
    programMod: programModifier,
    deckMod: deckModifier,
    attrMod: attributeModifier,
    crownPenalty,
    wirelessPenalty: safeWirelessPenalty,
  };

  return {
    formula: "@skillRoll + @skillMod + @programMod + @deckMod + @attrMod + @crownPenalty + @wirelessPenalty",
    data,
    breakdown: [
      { label: "Skill dice", value: skillDice },
      { label: skillLabel, value: skillModifier },
      ...(actorType === "character"
        ? [{ label: "Intelligence modifier", value: attributeModifier }]
        : []),
      { label: "Verb and Subject modifier", value: programModifier },
      { label: "Cyberdeck modifier", value: deckModifier },
      { label: "Crown penalty", value: crownPenalty },
      { label: "Wireless penalty", value: safeWirelessPenalty },
    ],
  };
}

export function runningProgramSource({ verb, subject, networkId = "", nodeId = "", sessionId = "", requestId = "" } = {}) {
  return {
    name: `${verb?.name ?? "Verb"} ${subject?.name ?? "Subject"}`,
    type: "program",
    img: verb?.img,
    system: {
      type: "running",
      cost: number(verb?.system?.cost, 0),
      accessCost: Math.max(0, number(verb?.system?.accessCost, 0)),
      target: String(subject?.system?.target ?? ""),
      useAffects: String(verb?.system?.useAffects ?? ""),
      selfTerminating: Boolean(verb?.system?.selfTerminating),
      skillCheckMod:
        number(verb?.system?.skillCheckMod, 0) +
        number(subject?.system?.skillCheckMod, 0),
    },
    flags: {
      "cwn-combat-enhancements": {
        networkProgramExecution: { networkId, nodeId, sessionId, requestId },
      },
    },
  };
}
