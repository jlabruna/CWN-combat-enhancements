import {
  commandFromCatalog,
  CUSTOM_DEMON_CLASS,
  CUSTOM_PROGRAMMING_PROFILE,
  CWN_COMMON_COMMAND_LINES,
  CWN_DEMON_PROGRAMMING_PROFILES,
  CWN_DEMON_TEMPLATES,
  profileCommands,
} from "./demon-rules.mjs";

export { CWN_DEMON_TEMPLATES } from "./demon-rules.mjs";

export const NETWORK_SCHEMA_VERSION = 3;
export const DEFAULT_CANVAS = Object.freeze({
  width: 920,
  height: 500,
  nodeWidth: 180,
  nodeHeight: 132,
  padding: 32,
});

// Names match the CWN program Items supplied by SWNR 2.3.1.
export const CWN_PROGRAM_VERBS = Object.freeze([
  "Activate", "Analyze", "Append", "Blind", "Deactivate", "Decrypt",
  "Defend", "Delude", "Erase", "Frisk", "Ghost", "Glitch", "Hijack",
  "Kill", "Lock", "Paralyze", "Replace", "Sabotage", "Sense", "Siege",
  "Silence", "Stun", "Terminate", "Unlock",
]);

export const CWN_PROGRAM_SUBJECTS = Object.freeze([
  "Avatar", "Barrier", "Camera", "Cyber", "Datafile", "Door", "Drone",
  "Machine", "Program", "Sensor", "Transmission", "Turret",
]);

const VERB_TARGETS = Object.freeze({
  Activate: ["Device", "Cyber"],
  Analyze: ["Device", "Data"],
  Append: ["Data"],
  Blind: ["Device", "Cyber"],
  Deactivate: ["Device", "Cyber"],
  Decrypt: ["Data"],
  Defend: ["Device", "Cyber"],
  Delude: ["Device"],
  Erase: ["Data"],
  Frisk: ["Cyber"],
  Ghost: ["Avatar"],
  Glitch: ["Device", "Cyber"],
  Hijack: ["Device"],
  Kill: ["Avatar"],
  Lock: ["Device", "Data"],
  Paralyze: ["Avatar"],
  Replace: ["Data"],
  Sabotage: ["Device", "Cyber"],
  Sense: ["Device", "Cyber"],
  Siege: ["Device"],
  Silence: ["Avatar"],
  Stun: ["Avatar"],
  Terminate: ["Program"],
  Unlock: ["Device", "Data"],
});

const SUBJECT_TARGET = Object.freeze({
  Avatar: "Avatar",
  Barrier: "Data",
  Camera: "Device",
  Cyber: "Cyber",
  Datafile: "Data",
  Door: "Device",
  Drone: "Device",
  Machine: "Device",
  Program: "Program",
  Sensor: "Device",
  Transmission: "Data",
  Turret: "Device",
});

export function programsAreRulesCompatible(verb, subject) {
  if (!verb && !subject) return true;
  if (!verb || !subject) return false;
  return (VERB_TARGETS[verb] ?? []).includes(SUBJECT_TARGET[subject]);
}

export function compatibleSubjectsForVerb(verb) {
  return CWN_PROGRAM_SUBJECTS.filter((subject) => programsAreRulesCompatible(verb, subject));
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function integer(value, fallback = 0, minimum = Number.MIN_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.trunc(number))
    : fallback;
}

function stableLegacyId(kind, nodeId, index) {
  const safeNode = text(nodeId, "node").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
  return `legacy-${kind}-${safeNode}-${index}`;
}

export function clampPosition(position, bounds = DEFAULT_CANVAS) {
  const width = Math.max(DEFAULT_CANVAS.nodeWidth + DEFAULT_CANVAS.padding * 2, integer(bounds.width, DEFAULT_CANVAS.width, 1));
  const height = Math.max(DEFAULT_CANVAS.nodeHeight + DEFAULT_CANVAS.padding * 2, integer(bounds.height, DEFAULT_CANVAS.height, 1));
  const nodeWidth = integer(bounds.nodeWidth, DEFAULT_CANVAS.nodeWidth, 1);
  const nodeHeight = integer(bounds.nodeHeight, DEFAULT_CANVAS.nodeHeight, 1);
  const padding = integer(bounds.padding, DEFAULT_CANVAS.padding, 0);
  const rawX = Number(position?.x);
  const rawY = Number(position?.y);
  const x = Number.isFinite(rawX) ? rawX : padding;
  const y = Number.isFinite(rawY) ? rawY : padding;
  return {
    x: Math.round(Math.min(Math.max(x, padding), Math.max(padding, width - nodeWidth - padding))),
    y: Math.round(Math.min(Math.max(y, padding), Math.max(padding, height - nodeHeight - padding))),
  };
}

export function isValidPosition(position) {
  return Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y));
}

function normalizeStoredPosition(position, fallback = null) {
  const candidate = isValidPosition(position) ? position : fallback;
  const x = Number(candidate?.x);
  const y = Number(candidate?.y);
  return {
    x: Math.min(100000, Math.max(DEFAULT_CANVAS.padding, Math.round(Number.isFinite(x) ? x : DEFAULT_CANVAS.padding))),
    y: Math.min(100000, Math.max(DEFAULT_CANVAS.padding, Math.round(Number.isFinite(y) ? y : DEFAULT_CANVAS.padding))),
  };
}

export function autoArrangePositions(nodes = [], connections = [], bounds = DEFAULT_CANVAS) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  if (!safeNodes.length) return {};
  const safeConnections = Array.isArray(connections) ? connections : [];
  const ids = new Set(safeNodes.map((node) => node.id));
  const adjacency = new Map(safeNodes.map((node) => [node.id, []]));
  const indegree = new Map(safeNodes.map((node) => [node.id, 0]));
  for (const connection of safeConnections) {
    if (!ids.has(connection?.source) || !ids.has(connection?.target)) continue;
    adjacency.get(connection.source).push(connection.target);
    adjacency.get(connection.target).push(connection.source);
    indegree.set(connection.target, (indegree.get(connection.target) ?? 0) + 1);
  }

  const root = safeNodes.find((node) => node.type === "server")
    ?? safeNodes.find((node) => (indegree.get(node.id) ?? 0) === 0)
    ?? safeNodes[0];
  const levels = new Map([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (levels.has(next)) continue;
      levels.set(next, (levels.get(current) ?? 0) + 1);
      queue.push(next);
    }
  }
  let orphanLevel = Math.max(...levels.values(), 0) + 1;
  for (const node of safeNodes) {
    if (!levels.has(node.id)) levels.set(node.id, orphanLevel++);
  }

  const groups = new Map();
  for (const node of safeNodes) {
    const level = levels.get(node.id);
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(node);
  }

  const result = {};
  for (const [level, group] of groups.entries()) {
    group.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    group.forEach((node, row) => {
      result[node.id] = clampPosition({
        x: DEFAULT_CANVAS.padding + level * 235,
        y: DEFAULT_CANVAS.padding + row * 155,
      }, {
        ...bounds,
        width: Math.max(integer(bounds.width, DEFAULT_CANVAS.width), DEFAULT_CANVAS.padding * 2 + (level + 1) * 235),
        height: Math.max(integer(bounds.height, DEFAULT_CANVAS.height), DEFAULT_CANVAS.padding * 2 + (row + 1) * 155),
      });
    });
  }
  return result;
}

function normalizeDatafile(value, nodeId, index) {
  if (typeof value === "string") {
    return {
      id: stableLegacyId("datafile", nodeId, index),
      name: text(value, "Legacy Datafile"),
      description: "",
      gmNotes: "",
      value: 0,
      revealed: false,
      copied: false,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    id: text(value.id, stableLegacyId("datafile", nodeId, index)),
    name: text(value.name, "Datafile"),
    description: text(value.description),
    gmNotes: text(value.gmNotes),
    value: integer(value.value, 0, 0),
    revealed: bool(value.revealed),
    copied: bool(value.copied),
  };
}

function normalizeCommand(value, demonId, index, sourceType = "legacy") {
  if (typeof value === "string") {
    return {
      id: stableLegacyId("command", demonId, index),
      key: "",
      priority: index + 1,
      text: text(value),
      actionKey: "",
      sourceType,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const key = text(value.key);
  const catalog = CWN_COMMON_COMMAND_LINES[key];
  return {
    id: text(value.id, stableLegacyId("command", demonId, index)),
    key: catalog ? key : "",
    priority: integer(value.priority, index + 1, 1),
    text: text(value.text ?? value.command, catalog?.text ?? "Legacy command"),
    actionKey: text(value.actionKey, catalog?.actionKey ?? ""),
    sourceType: ["profile", "common", "custom", "legacy"].includes(value.sourceType)
      ? value.sourceType
      : sourceType,
  };
}

function normalizeDemon(value, nodeId, index) {
  if (typeof value === "string") {
    return {
      id: stableLegacyId("demon", nodeId, index),
      name: text(value, "Legacy Demon"),
      classKey: CUSTOM_DEMON_CLASS,
      currentHp: 1,
      maxHp: 1,
      skillBonus: 0,
      lineLimit: 0,
      cost: 0,
      state: "active",
      programmingProfile: CUSTOM_PROGRAMMING_PROFILE,
      profileCommandLines: [],
      additionalCommandLines: [],
      customCommandLines: [],
      revealed: false,
      notes: "",
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const legacyClass = text(value.classKey ?? value.class);
  const classKey = CWN_DEMON_TEMPLATES[legacyClass]
    ? legacyClass
    : CUSTOM_DEMON_CLASS;
  const template = CWN_DEMON_TEMPLATES[classKey] ?? {};
  const maxHp = classKey === CUSTOM_DEMON_CLASS
    ? integer(value.maxHp, 1, 1)
    : template.hp;
  const currentHp = Math.min(maxHp, integer(value.currentHp, maxHp, 0));
  const demonId = text(value.id, stableLegacyId("demon", nodeId, index));
  const rawProfile = text(value.programmingProfile);
  const programmingProfile = Object.hasOwn(CWN_DEMON_PROGRAMMING_PROFILES, rawProfile)
    ? rawProfile
    : CUSTOM_PROGRAMMING_PROFILE;
  const storedProfileCommands = Array.isArray(value.profileCommandLines)
    ? value.profileCommandLines
        .map((command, commandIndex) =>
          normalizeCommand(command, demonId, commandIndex, "profile"))
        .filter(Boolean)
    : [];
  const profileCommandLines = storedProfileCommands.length
    ? storedProfileCommands
    : profileCommands(programmingProfile, demonId);
  const additionalCommandLines = (Array.isArray(value.additionalCommandLines)
    ? value.additionalCommandLines
    : [])
    .map((command, commandIndex) =>
      normalizeCommand(command, demonId, commandIndex, "common"))
    .filter(Boolean);
  const customCommandLines = (Array.isArray(value.customCommandLines)
    ? value.customCommandLines
    : [])
    .map((command, commandIndex) =>
      normalizeCommand(command, demonId, commandIndex, "custom"))
    .filter(Boolean);
  const legacyCommands = (Array.isArray(value.commands) ? value.commands : [])
    .map((command, commandIndex) =>
      normalizeCommand(command, demonId, commandIndex, "legacy"))
    .filter(Boolean);
  const legacyVerb = CWN_PROGRAM_VERBS.includes(value.currentVerb) ? value.currentVerb : "";
  const legacySubject = CWN_PROGRAM_SUBJECTS.includes(value.currentSubject) ? value.currentSubject : "";
  if (legacyVerb || legacySubject) {
    legacyCommands.push({
      id: stableLegacyId("command", demonId, legacyCommands.length),
      key: "",
      priority: legacyCommands.length + 1,
      text: `Legacy current program: ${[legacyVerb, legacySubject].filter(Boolean).join(" ")}`,
      actionKey: "",
      sourceType: "legacy",
    });
  }
  return {
    id: demonId,
    name: text(value.name, classKey === CUSTOM_DEMON_CLASS ? "Custom Demon" : classKey),
    classKey,
    currentHp,
    maxHp,
    skillBonus: classKey === CUSTOM_DEMON_CLASS
      ? integer(value.skillBonus ?? value.skill, 0, -20)
      : template.skill,
    lineLimit: classKey === CUSTOM_DEMON_CLASS
      ? integer(value.lineLimit, 0, 0)
      : template.lines,
    cost: integer(value.cost, template.cost ?? 0, 0),
    state: currentHp === 0 && maxHp > 0 ? "fragged" : (value.state === "fragged" ? "fragged" : "active"),
    programmingProfile,
    profileCommandLines,
    additionalCommandLines,
    customCommandLines: [...customCommandLines, ...legacyCommands],
    revealed: bool(value.revealed),
    notes: text(value.notes),
  };
}

function normalizeWatchdog(value, nodeId, index) {
  if (typeof value === "string") {
    return {
      id: stableLegacyId("watchdog", nodeId, index),
      name: text(value, "Legacy Watchdog"),
      notes: "",
      revealed: false,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    id: text(value.id, stableLegacyId("watchdog", nodeId, index)),
    name: text(value.name, "Watchdog"),
    notes: text(value.notes),
    revealed: bool(value.revealed),
  };
}

function normalizeLegacyCollection(value, normalizer, nodeId) {
  const values = Array.isArray(value)
    ? value
    : (typeof value === "string" && value.trim() ? [value] : []);
  return values.map((entry, index) => normalizer(entry, nodeId, index)).filter(Boolean);
}

export function normalizeNode(node, fallbackPosition = null) {
  const safe = node && typeof node === "object" && !Array.isArray(node) ? node : {};
  const id = text(safe.id, "legacy-node");
  return {
    id,
    name: text(safe.name, "Network Node"),
    type: text(safe.type, "custom"),
    state: text(safe.state, "normal"),
    revealed: bool(safe.revealed),
    description: text(safe.description),
    gmNotes: text(safe.gmNotes),
    position: normalizeStoredPosition(safe.position, fallbackPosition),
    datafiles: normalizeLegacyCollection(safe.datafiles, normalizeDatafile, id),
    demons: normalizeLegacyCollection(safe.demons, normalizeDemon, id),
    watchdogs: normalizeLegacyCollection(safe.watchdogs, normalizeWatchdog, id),
  };
}

export function connectionExists(connections, source, target, ignoreId = "") {
  return (Array.isArray(connections) ? connections : []).some((connection) =>
    connection?.id !== ignoreId &&
    ((connection?.source === source && connection?.target === target) ||
      (connection?.source === target && connection?.target === source)));
}

function normalizeConnection(connection) {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  return {
    id: text(connection.id, `legacy-connection-${text(connection.source)}-${text(connection.target)}`),
    source: text(connection.source),
    target: text(connection.target),
    revealed: bool(connection.revealed),
    barrier: bool(connection.barrier),
    barrierLocked: bool(connection.barrierLocked) && bool(connection.barrier),
    oneWay: bool(connection.oneWay),
    gmNotes: text(connection.gmNotes),
  };
}

export function normalizeNetwork(network) {
  const safe = network && typeof network === "object" && !Array.isArray(network) ? network : {};
  const rawNodes = Array.isArray(safe.nodes) ? safe.nodes.filter((node) => node && typeof node === "object" && !Array.isArray(node)) : [];
  const rawConnections = Array.isArray(safe.connections) ? safe.connections : [];
  const preliminaryNodes = rawNodes.map((node, index) => ({
    ...node,
    id: text(node.id, `legacy-node-${index}`),
  }));
  const arrangements = autoArrangePositions(preliminaryNodes, rawConnections);
  const nodes = preliminaryNodes.map((node) => normalizeNode(node, arrangements[node.id]));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = rawConnections
    .map(normalizeConnection)
    .filter((connection) =>
      connection &&
      connection.source !== connection.target &&
      nodeIds.has(connection.source) &&
      nodeIds.has(connection.target))
    .filter((connection, index, all) =>
      all.findIndex((candidate) =>
        (candidate.source === connection.source && candidate.target === connection.target) ||
        (candidate.source === connection.target && candidate.target === connection.source)) === index);
  return {
    schemaVersion: NETWORK_SCHEMA_VERSION,
    id: text(safe.id, "legacy-network"),
    name: text(safe.name, "Untitled Network"),
    idiom: text(safe.idiom),
    securityDifficulty: integer(safe.securityDifficulty, 8, 1),
    serverClass: text(safe.serverClass, "Alpha"),
    alertProgress: Math.min(2, integer(safe.alertProgress, 0, 0)),
    authorizedUserIds: Array.isArray(safe.authorizedUserIds)
      ? safe.authorizedUserIds.filter((id) => typeof id === "string")
      : [],
    nodes,
    connections,
  };
}

export function sanitizeNetworkForPlayers(network) {
  const normalized = normalizeNetwork(network);
  const nodes = normalized.nodes
    .filter((node) => node.revealed)
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      state: node.state,
      revealed: true,
      description: node.description,
      position: { ...node.position },
      datafiles: node.datafiles
        .filter((datafile) => datafile.revealed)
        .map(({ id, name, description, value, revealed, copied }) => ({
          id, name, description, value, revealed, copied,
        })),
      demons: node.demons
        .filter((demon) => demon.revealed)
        .map(({ id, name, revealed, state, currentHp }) => ({
          id,
          name,
          revealed,
          isFragged: state === "fragged" || currentHp <= 0,
        })),
      watchdogs: node.watchdogs
        .filter((watchdog) => watchdog.revealed)
        .map(({ id, name, revealed }) => ({ id, name, revealed })),
    }));
  const visible = new Set(nodes.map((node) => node.id));
  const connections = normalized.connections
    .filter((connection) =>
      connection.revealed &&
      visible.has(connection.source) &&
      visible.has(connection.target))
    .map(({ id, source, target, barrier, barrierLocked, oneWay, revealed }) => ({
      id, source, target, barrier, barrierLocked, oneWay, revealed,
    }));
  return {
    schemaVersion: NETWORK_SCHEMA_VERSION,
    id: normalized.id,
    name: normalized.name,
    idiom: normalized.idiom,
    securityDifficulty: normalized.securityDifficulty,
    serverClass: normalized.serverClass,
    alertProgress: normalized.alertProgress,
    authorizedUserIds: [...normalized.authorizedUserIds],
    nodes,
    connections,
  };
}

export function createNode({
  id,
  type = "custom",
  name = "New Device",
  position = DEFAULT_CANVAS,
} = {}) {
  return normalizeNode({
    id,
    type,
    name,
    position,
    state: "normal",
    revealed: false,
    datafiles: [],
    demons: [],
    watchdogs: [],
  }, position);
}

export function createDemonFromTemplate(className, id, programmingProfile = CUSTOM_PROGRAMMING_PROFILE) {
  const template = CWN_DEMON_TEMPLATES[className];
  if (!template && className !== CUSTOM_DEMON_CLASS) return null;
  return normalizeDemon({
    id,
    name: className === CUSTOM_DEMON_CLASS ? "Custom Demon" : className,
    classKey: className,
    currentHp: template?.hp ?? 1,
    maxHp: template?.hp ?? 1,
    skillBonus: template?.skill ?? 0,
    lineLimit: template?.lines ?? 0,
    cost: template?.cost ?? 0,
    programmingProfile,
    profileCommandLines: profileCommands(programmingProfile, id),
  }, "node", 0);
}

export function appendDemonToNode(network, nodeId, demon) {
  const normalized = normalizeNetwork(network);
  const node = normalized.nodes.find((entry) => entry.id === nodeId);
  if (!node) return { network: normalized, demon: null, added: false, reason: "missing-node" };
  if (!demon || typeof demon !== "object" || Array.isArray(demon)) {
    return { network: normalized, demon: null, added: false, reason: "invalid-demon" };
  }
  if (node.demons.some((entry) => entry.id === demon.id)) {
    return { network: normalized, demon: null, added: false, reason: "duplicate-demon" };
  }
  node.demons.push(demon);
  const saved = normalizeNetwork(normalized);
  return {
    network: saved,
    demon: saved.nodes.find((entry) => entry.id === nodeId)?.demons.at(-1) ?? null,
    added: true,
    reason: "",
  };
}

export function replaceDemonOnNode(network, nodeId, demonId, demon) {
  const normalized = normalizeNetwork(network);
  const node = normalized.nodes.find((entry) => entry.id === nodeId);
  const index = node?.demons.findIndex((entry) => entry.id === demonId) ?? -1;
  if (!node || index < 0) {
    return { network: normalized, demon: null, replaced: false, reason: "missing-demon" };
  }
  if (!demon || typeof demon !== "object" || Array.isArray(demon)) {
    return { network: normalized, demon: null, replaced: false, reason: "invalid-demon" };
  }
  node.demons[index] = { ...demon, id: demonId };
  const saved = normalizeNetwork(normalized);
  return {
    network: saved,
    demon: saved.nodes.find((entry) => entry.id === nodeId)?.demons
      .find((entry) => entry.id === demonId) ?? null,
    replaced: true,
    reason: "",
  };
}

export async function persistDemonToNode({
  loadNetwork,
  saveNetwork,
  nodeId,
  demon,
}) {
  const result = appendDemonToNode(await loadNetwork(), nodeId, demon);
  if (!result.added) throw new Error(`Could not add Demon: ${result.reason}.`);
  await saveNetwork(result.network);
  return result;
}

export function duplicateNode(network, nodeId, newId, bounds = DEFAULT_CANVAS) {
  const normalized = normalizeNetwork(network);
  const original = normalized.nodes.find((node) => node.id === nodeId);
  if (!original) return { network: normalized, node: null };
  const copy = structuredClone(original);
  copy.id = newId;
  copy.name = `${original.name} Copy`;
  copy.position = clampPosition({
    x: original.position.x + 32,
    y: original.position.y + 32,
  }, bounds);
  copy.datafiles = copy.datafiles.map((entry, index) => ({ ...entry, id: `${newId}-datafile-${index}` }));
  copy.demons = copy.demons.map((entry, index) => {
    const demonId = `${newId}-demon-${index}`;
    const demon = { ...entry, id: demonId };
    for (const collection of ["profileCommandLines", "additionalCommandLines", "customCommandLines"]) {
      demon[collection] = (demon[collection] ?? []).map((command, commandIndex) => ({
        ...command,
        id: `${demonId}-${collection}-${commandIndex}`,
      }));
    }
    return demon;
  });
  copy.watchdogs = copy.watchdogs.map((entry, index) => ({ ...entry, id: `${newId}-watchdog-${index}` }));
  normalized.nodes.push(copy);
  return { network: normalized, node: copy };
}

export function deleteNodeAndConnections(network, nodeId) {
  const normalized = normalizeNetwork(network);
  normalized.nodes = normalized.nodes.filter((node) => node.id !== nodeId);
  normalized.connections = normalized.connections.filter(
    (connection) => connection.source !== nodeId && connection.target !== nodeId,
  );
  return normalized;
}
