export const CUSTOM_DEMON_CLASS = "custom";
export const CUSTOM_PROGRAMMING_PROFILE = "custom";

export const CWN_DEMON_TEMPLATES = Object.freeze({
  Tripwire: { cost: 5000, lines: 2, hp: 3, skill: 1 },
  Mastiff: { cost: 10000, lines: 4, hp: 5, skill: 2 },
  Siren: { cost: 15000, lines: 2, hp: 8, skill: 3 },
  Cataphract: { cost: 25000, lines: 3, hp: 20, skill: 3 },
  Ogre: { cost: 50000, lines: 4, hp: 25, skill: 2 },
  Headsman: { cost: 100000, lines: 4, hp: 30, skill: 3 },
  Hydra: { cost: 200000, lines: 7, hp: 40, skill: 4 },
  Nemesis: { cost: 500000, lines: 5, hp: 50, skill: 5 },
});

// Concise, source-backed descriptions of the Common Command Lines on CWN p.103.
export const CWN_COMMON_COMMAND_LINES = Object.freeze({
  "alert-sighted": {
    text: "Alert the network when an intruder is sighted and it is not already alerted.",
    actionKey: "alert-network",
  },
  "reboot-device": {
    text: "Reboot a deactivated device on this node and message the Watchdogs.",
    actionKey: "reboot-device",
  },
  "stun-avatar": {
    text: "Use Stun Avatar on intruders until they are unconscious or offline.",
    actionKey: "stun-avatar",
  },
  "lock-barrier": {
    text: "Lock an unlocked barrier on this node and message the Watchdogs.",
    actionKey: "lock-barrier",
  },
  "patrol-move": {
    text: "Move through the network on the assigned patrol or wander randomly.",
    actionKey: "move",
  },
  "kill-avatar": {
    text: "Use Kill Avatar on an unconscious intruder.",
    actionKey: "kill-avatar",
  },
  pursue: {
    text: "Pursue intruders; choose randomly when there is more than one.",
    actionKey: "pursue",
  },
  "erase-stun": {
    text: "Use Erase Program against an intruder's Stun Verb after seeing it used.",
    actionKey: "erase-program",
  },
  "terminate-hijack": {
    text: "Use Terminate Program against active Hijack programs in its presence.",
    actionKey: "terminate-program",
  },
  "paralyze-avatar": {
    text: "Use Paralyze Avatar on an intruder before other countermeasures.",
    actionKey: "paralyze-avatar",
  },
  "send-message": {
    text: "Send a message to security when executing a command because of an anomaly.",
    actionKey: "send-message",
  },
  "defend-device": {
    text: "Reserve its Main Action to Defend Device against hacks on this node.",
    actionKey: "defend-device",
  },
  "alert-repelled": {
    text: "Alert the network after repelling an intruder.",
    actionKey: "alert-network",
    profileOnly: true,
  },
});

export const CWN_DEMON_PROGRAMMING_PROFILES = Object.freeze({
  Bouncer: ["stun-avatar", "alert-repelled"],
  Patroller: ["alert-sighted", "patrol-move", "pursue", "stun-avatar"],
  Gatekeeper: ["lock-barrier", "send-message"],
  Shieldbearer: ["alert-sighted", "defend-device"],
  Repairman: ["alert-sighted", "patrol-move", "reboot-device"],
  Trapper: ["pursue", "send-message", "paralyze-avatar"],
  Executioner: ["paralyze-avatar", "stun-avatar", "kill-avatar", "send-message"],
  "Custom Programming": [],
});

export const DEMON_ACTIONS = Object.freeze({
  "alert-network": {
    label: "Alert the Network",
    targetType: "none",
    resolution: "no-roll",
    economy: "Main",
    rule: "Alert the Network requires two Main Action uses and no roll.",
    automated: true,
    guidance: "One confirmed use advances Alert progress by one, to a maximum of two.",
  },
  "send-message": {
    label: "Send Message",
    targetType: "none",
    resolution: "no-roll",
    economy: "On Turn",
    rule: "Send Message is an On Turn action and requires no roll.",
    automated: false,
    guidance: "Send the programmed message. The GM determines its recipients and content.",
  },
  "stun-avatar": {
    label: "Stun Avatar",
    targetType: "hacker",
    resolution: "opposed",
    economy: "Main",
    rule: "Opposed Int/Program; Stun has +1 and deals 1d10 per skill level, minimum 1d10.",
    rollFormula: "2d6 + @skillBonus + 1",
    checkModifier: 1,
    damageFormula: "max(1, @skillBonus)d10",
    automated: false,
    guidance: "Compare against the target's opposed Int/Program check; apply Stun damage only on success.",
  },
  "paralyze-avatar": {
    label: "Paralyze Avatar",
    targetType: "hacker",
    resolution: "opposed",
    economy: "Main",
    rule: "Opposed Int/Program; Paralyze has -1 and restricts movement, Alert, and Send Message.",
    rollFormula: "2d6 + @skillBonus - 1",
    checkModifier: -1,
    automated: false,
    guidance: "Compare against the target's opposed Int/Program check; the GM applies the paralysis effect on success.",
  },
  "kill-avatar": {
    label: "Kill Avatar",
    targetType: "hacker",
    resolution: "opposed",
    economy: "Main",
    rule: "Opposed Int/Program; Kill deals 1d10 per skill level, minimum 1d10, Trauma d8/x3.",
    rollFormula: "2d6 + @skillBonus",
    checkModifier: 0,
    damageFormula: "max(1, @skillBonus)d10",
    automated: false,
    guidance: "Compare against the target's opposed Int/Program check; damage has Trauma Die d8 and Trauma x3.",
  },
  "lock-barrier": {
    label: "Lock Barrier",
    targetType: "barrier",
    resolution: "manual",
    economy: "Main",
    rule: "Lock Barrier is a Lock + Barrier program command; complete hostile state is GM-adjudicated.",
    automated: false,
    guidance: "Select an unlocked barrier. Resolve any required program check, then lock it if successful.",
  },
  "defend-device": {
    label: "Defend Device",
    targetType: "node",
    resolution: "manual",
    economy: "Main",
    rule: "Defend Device is reserved and resolved against the triggering hostile hack.",
    automated: false,
    guidance: "Reserve the Demon action and resolve the opposed Defend Device check when a hostile hack occurs.",
  },
  "reboot-device": {
    label: "Reboot Device",
    targetType: "device",
    resolution: "no-roll",
    economy: "Main",
    rule: "The programmed command spends a Main Action to reboot a deactivated device.",
    automated: true,
    guidance: "A confirmed action returns a deactivated device on this node to Normal.",
  },
  move: {
    label: "Move",
    targetType: "destination",
    resolution: "no-roll",
    economy: "Move",
    rule: "Move Nodes is a Move Action for one adjacent network hop.",
    automated: true,
    guidance: "Move one hop through a valid directed connection after GM confirmation.",
  },
  pursue: {
    label: "Pursue",
    targetType: "none",
    resolution: "manual",
    economy: "Move",
    rule: "Pursue follows known intruders; their network location is not stored by this module.",
    automated: false,
    guidance: "Intruder node location is not tracked. Choose the destination manually with Move.",
  },
  "erase-program": {
    label: "Erase Program",
    targetType: "none",
    resolution: "manual",
    economy: "Main",
    rule: "The programmed Erase response depends on an observed active program state.",
    automated: false,
    guidance: "The active hostile program state is not tracked; resolve this command manually.",
  },
  "terminate-program": {
    label: "Terminate Program",
    targetType: "none",
    resolution: "manual",
    economy: "Instant",
    rule: "Terminate targets an active program; active hostile programs are not stored here.",
    automated: false,
    guidance: "The active hostile program state is not tracked; resolve Terminate Program manually.",
  },
});

export function demonClassView(classKey) {
  return {
    custom: classKey === CUSTOM_DEMON_CLASS,
    showCustomStats: classKey === CUSTOM_DEMON_CLASS,
    stableNameField: true,
  };
}

export function commandFromCatalog(key, sourceType, priority, id = key) {
  const source = CWN_COMMON_COMMAND_LINES[key];
  if (!source) return null;
  return {
    id,
    key,
    priority,
    text: source.text,
    actionKey: source.actionKey ?? "",
    sourceType,
  };
}

export function profileCommands(profile, demonId = "demon") {
  const profileName = profile === CUSTOM_PROGRAMMING_PROFILE
    ? "Custom Programming"
    : profile;
  return (CWN_DEMON_PROGRAMMING_PROFILES[profileName] ?? [])
    .map((key, index) =>
      commandFromCatalog(key, "profile", index + 1, `${demonId}-profile-${key}`));
}

export function validateCommandLimit(demon) {
  const count = [
    ...(demon?.profileCommandLines ?? []),
    ...(demon?.additionalCommandLines ?? []),
    ...(demon?.customCommandLines ?? []),
  ].length;
  return {
    count,
    limit: Math.max(0, Number(demon?.lineLimit) || 0),
    exceeded: Number(demon?.lineLimit) > 0 && count > Number(demon.lineLimit),
  };
}

export function addCommonCommand(demon, key, id = key) {
  if (!CWN_COMMON_COMMAND_LINES[key] || CWN_COMMON_COMMAND_LINES[key].profileOnly) {
    return { demon, added: false, reason: "invalid" };
  }
  const all = [
    ...(demon.profileCommandLines ?? []),
    ...(demon.additionalCommandLines ?? []),
  ];
  if (all.some((command) => command.key === key)) {
    return { demon, added: false, reason: "duplicate" };
  }
  const copy = structuredClone(demon);
  copy.additionalCommandLines ??= [];
  copy.additionalCommandLines.push(
    commandFromCatalog(
      key,
      "common",
      (copy.profileCommandLines?.length ?? 0) + copy.additionalCommandLines.length + 1,
      id,
    ),
  );
  const limit = validateCommandLimit(copy);
  return { demon: copy, added: true, warning: limit.exceeded ? limit : null };
}

export function applyDemonDamage(demon, amount) {
  const damage = Math.max(0, Math.trunc(Number(amount) || 0));
  const copy = structuredClone(demon);
  copy.currentHp = Math.max(0, Math.min(copy.maxHp, copy.currentHp - damage));
  copy.state = copy.currentHp === 0 ? "fragged" : "active";
  return copy;
}

export function setDemonHp(demon, value) {
  const copy = structuredClone(demon);
  copy.currentHp = Math.max(0, Math.min(copy.maxHp, Math.trunc(Number(value) || 0)));
  copy.state = copy.currentHp === 0 ? "fragged" : "active";
  return copy;
}

export function canExecuteDemonAction(demon, actionKey, isGM = true) {
  if (!isGM) return { allowed: false, reason: "gm-only" };
  if (!DEMON_ACTIONS[actionKey]) return { allowed: false, reason: "unknown-action" };
  if (demon?.state === "fragged" || Number(demon?.currentHp) <= 0) {
    return { allowed: false, reason: "fragged" };
  }
  return { allowed: true, reason: "" };
}

export function actionRequiresTarget(actionKey) {
  return !["none", undefined].includes(DEMON_ACTIONS[actionKey]?.targetType);
}

export function validateActionTarget(actionKey, target) {
  const action = DEMON_ACTIONS[actionKey];
  if (!action) return false;
  if (action.targetType === "none") return target == null;
  if (!target || typeof target !== "object") return false;
  if (action.targetType === "hacker") return target.type === "hacker" && Boolean(target.id);
  if (action.targetType === "node") return target.type === "node" && Boolean(target.id);
  if (action.targetType === "device") return target.type === "device" && Boolean(target.id);
  if (action.targetType === "barrier") return target.type === "barrier" && Boolean(target.id);
  if (action.targetType === "destination") return target.type === "destination" && Boolean(target.id);
  return false;
}

export function nextAlertProgress(current) {
  return Math.min(2, Math.max(0, Math.trunc(Number(current) || 0)) + 1);
}

export function validDemonDestinations(network, nodeId) {
  const nodes = new Map((network?.nodes ?? []).map((node) => [node.id, node]));
  return (network?.connections ?? []).flatMap((connection) => {
    let destinationId = "";
    if (connection.source === nodeId) destinationId = connection.target;
    else if (!connection.oneWay && connection.target === nodeId) destinationId = connection.source;
    if (!destinationId || !nodes.has(destinationId)) return [];
    return [{
      id: destinationId,
      name: nodes.get(destinationId).name,
      connectionId: connection.id,
      barrier: Boolean(connection.barrier),
      barrierLocked: Boolean(connection.barrierLocked),
      blocked: Boolean(connection.barrier && connection.barrierLocked),
    }];
  });
}

export function publicDemonChatContext({ demon, networkName, nodeName, actionKey, targetName = "" }) {
  const action = DEMON_ACTIONS[actionKey];
  return {
    demonName: demon?.revealed ? demon.name : "Hidden Demon",
    demonClass: demon?.revealed ? (demon.classKey || "Custom Demon") : "",
    programmingProfile: demon?.revealed ? (demon.programmingProfile || "") : "",
    networkName,
    nodeName,
    actionName: action?.label ?? "Demon Action",
    targetName,
    resolution: action?.resolution ?? "manual",
    guidance: action?.guidance ?? "",
  };
}

export function isTrustedDemonDamageFlag(flag, isGM, rolledDamage = null) {
  return Boolean(
    isGM &&
    flag &&
    flag.kind === "demon-damage" &&
    flag.producer === "cwn-combat-enhancements" &&
    Number.isInteger(flag.damage) &&
    flag.damage >= 0 &&
    (rolledDamage == null || Number(rolledDamage) === flag.damage) &&
    typeof flag.networkId === "string" &&
    typeof flag.nodeId === "string" &&
    typeof flag.demonId === "string",
  );
}
