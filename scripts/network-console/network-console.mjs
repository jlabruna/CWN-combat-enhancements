import {
  calculateConnectionGeometry,
  svgPixelViewBox,
} from "./network-geometry.mjs";
import { applyChatMessageMode } from "../foundry-compat.mjs";
import {
  autoArrangePositions,
  addHackerSession,
  clampPosition,
  connectionExists,
  createDemonFromTemplate,
  createNode,
  createHackerSession,
  CWN_DEMON_TEMPLATES,
  DEFAULT_CANVAS,
  deleteNodeAndConnections,
  duplicateNode,
  endHackerSession,
  NETWORK_SCHEMA_VERSION,
  normalizeNetwork,
  moveHackerSession,
  persistDemonToNode,
  replaceDemonOnNode,
  sanitizeNetworkForPlayers,
  sessionsForUser,
  validateHackerMove,
} from "./network-model.mjs";
import {
  actionRequiresTarget,
  addCommonCommand,
  applyDemonDamage,
  canExecuteDemonAction,
  commandCapacityState,
  compatibleProgrammingProfiles,
  CUSTOM_DEMON_CLASS,
  CUSTOM_PROGRAMMING_PROFILE,
  CWN_COMMON_COMMAND_LINES,
  CWN_DEMON_PROGRAMMING_PROFILES,
  DEMON_ACTIONS,
  demonActionRollBreakdowns,
  demonClassCommandCapacity,
  isProgrammingProfileCompatible,
  nextAlertProgress,
  profileCommandCount,
  profileCommands,
  programmingProfileName,
  programmingProfileValue,
  publicDemonChatContext,
  resolveProgrammingProfileSelection,
  setDemonHp,
  validDemonDestinations,
  validateActionTarget,
  isTrustedDemonDamageFlag,
} from "./demon-rules.mjs";
import {
  buildDemonDamageMessageData,
  renderDemonActionChatCard,
  renderDemonDamageChatCard,
  renderNetworkProgramChatCard,
} from "../chat-card.mjs";
import {
  programRequestIsFresh,
  programResourceState,
  programRollContext,
  runningProgramSource,
} from "./network-program-rules.mjs";

const MODULE_ID = "cwn-combat-enhancements";
const SOCKET_NAME = `module.${MODULE_ID}`;
const NETWORK_FLAG = "network";
const NETWORK_FOLDER_FLAG = "networkFolder";
const NETWORK_FOLDER_NAME = "CWN Network Console";

const NODE_TYPES = {
  server: { label: "Primary Server", icon: "fa-solid fa-server" },
  databank: { label: "Databank or Terminal", icon: "fa-solid fa-database" },
  securityPanel: { label: "Security Panel", icon: "fa-solid fa-shield-halved" },
  camera: { label: "Camera", icon: "fa-solid fa-video" },
  door: { label: "Door", icon: "fa-solid fa-door-closed" },
  machine: { label: "Machine", icon: "fa-solid fa-gears" },
  turret: { label: "Turret", icon: "fa-solid fa-crosshairs" },
  sensor: { label: "Sensor", icon: "fa-solid fa-satellite-dish" },
  drone: { label: "Drone", icon: "fa-solid fa-helicopter-symbol" },
  access: { label: "Network Access Device", icon: "fa-solid fa-plug" },
  custom: { label: "Custom Device", icon: "fa-solid fa-microchip" },
};

const NODE_STATES = {
  normal: "Normal",
  deactivated: "Deactivated",
  glitched: "Glitched",
  hijacked: "Hijacked",
  sabotaged: "Sabotaged",
  sieged: "Sieged",
};

const SERVER_LIMITS = {
  Databank: { nodes: 0, barriers: 0, demons: "0" },
  Alpha: { nodes: 10, barriers: 1, demons: "2 (1 per node)" },
  Beta: { nodes: 15, barriers: 2, demons: "3 (2 per node)" },
  Gamma: { nodes: 20, barriers: 4, demons: "5 (2 per node)" },
  Delta: { nodes: 25, barriers: 6, demons: "8 (2 per node)" },
  Epsilon: { nodes: 30, barriers: 10, demons: "12 (3 per node)" },
};

const PLAYER_ACTIONS = [
  { id: "jackIn", label: "Jack In", economy: "Move", icon: "fa-solid fa-plug-circle-check" },
  { id: "moveNodes", label: "Move Nodes", economy: "Move", icon: "fa-solid fa-share-nodes" },
  { id: "lookConnections", label: "Look for Hidden Connections", economy: "Main", icon: "fa-solid fa-magnifying-glass" },
  { id: "runProgram", label: "Run a Program", economy: "Main", icon: "fa-solid fa-code" },
  { id: "copyFile", label: "Copy File", economy: "Main", icon: "fa-solid fa-copy" },
  { id: "issueCommand", label: "Issue Command", economy: "Main", icon: "fa-solid fa-terminal" },
  { id: "sendMessage", label: "Send Message", economy: "On Turn", icon: "fa-solid fa-message" },
  { id: "terminateProgram", label: "Terminate a Program", economy: "Instant", icon: "fa-solid fa-power-off" },
  { id: "jackOut", label: "Jack Out", economy: "Move", icon: "fa-solid fa-plug-circle-xmark" },
];

let networkConsoleApp = null;
let playerSessionProjection = null;
const programRequestStates = new Map();
const copyFileRequestStates = new Map();
const networkNotices = [];
let programExecutionQueue = Promise.resolve();

const NETWORK_NOTICE_TTL_MS = 10_000;

function addNetworkNotice(message, level = "info", title = "Network Console") {
  const id = foundry.utils.randomID();
  networkNotices.push({ id, message: String(message || ""), level, title });
  while (networkNotices.length > 8) networkNotices.shift();
  renderOpenNetworkConsole();
  setTimeout(() => {
    const index = networkNotices.findIndex((notice) => notice.id === id);
    if (index >= 0) networkNotices.splice(index, 1);
    renderOpenNetworkConsole();
  }, NETWORK_NOTICE_TTL_MS);
}

function sendNetworkRequestResult(payload, status, message, actionId = payload.actionId) {
  if (!payload?.userId) return;
  game.socket.emit(SOCKET_NAME, {
    type: "networkRequestResult",
    targetUserId: payload.userId,
    requestId: payload.requestId ?? "",
    actionId,
    status,
    message,
  });
}

function networkStatusLevel(status) {
  if (status === "success") return "success";
  if (status === "pending") return "info";
  if (status === "rejected") return "warning";
  return "error";
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enableNetworkConsole", {
    name: "CWNCE.Network.Settings.Enabled.Name",
    hint: "CWNCE.Network.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
    requiresReload: true,
  });

  game.settings.register(MODULE_ID, "activeNetworkId", {
    name: "Active Network ID",
    scope: "world",
    config: false,
    type: String,
    default: "",
    restricted: true,
  });

  game.settings.register(MODULE_ID, "networkProjection", {
    name: "Published Network Projection",
    scope: "world",
    config: false,
    type: String,
    default: "",
    restricted: true,
  });

  game.settings.register(MODULE_ID, "networkConsoleGeometry", {
    name: "Network Console Geometry",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "networkConsoleLastCyberdeckUuid", {
    name: "Last Network Console Cyberdeck",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  game.settings.registerMenu(MODULE_ID, "networkConsole", {
    name: "CWNCE.Network.Settings.Menu.Name",
    label: "CWNCE.Network.Settings.Menu.Label",
    hint: "CWNCE.Network.Settings.Menu.Hint",
    icon: "fa-solid fa-network-wired",
    type: NetworkConsoleApp,
    restricted: false,
  });
});

Hooks.once("ready", () => {
  if (!isNetworkConsoleEnabled()) return;

  game.socket.on(SOCKET_NAME, handleNetworkSocket);
  exposeNetworkApi();

  if (game.user.isGM) {
    void migrateNetworkDocuments().then(() => ensurePublishedProjection());
  } else {
    game.socket.emit(SOCKET_NAME, {
      type: "projectionRequest",
      requesterId: game.user.id,
    });
  }
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!isNetworkConsoleEnabled()) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;

  tokenControls.tools.cwnceNetworkConsole = {
    name: "cwnceNetworkConsole",
    title: "CWNCE.Network.Launcher",
    icon: "fa-solid fa-network-wired",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => openNetworkConsole(),
  };
});

Hooks.on("updateSetting", (setting) => {
  if (
    setting.key === `${MODULE_ID}.networkProjection` ||
    setting.key === `${MODULE_ID}.activeNetworkId`
  ) {
    renderOpenNetworkConsole();
  }
});

Hooks.on("updateJournalEntry", (journal) => {
  if (!journal.getFlag(MODULE_ID, NETWORK_FLAG)) return;
  renderOpenNetworkConsole();
});

Hooks.on("deleteJournalEntry", (journal) => {
  if (!journal.getFlag(MODULE_ID, NETWORK_FLAG)) return;
  renderOpenNetworkConsole();
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  enhanceDemonRollBreakdowns(
    root,
    message.getFlag(MODULE_ID, "demonRollBreakdowns"),
  );
  if (!game.user.isGM) return;
  const flag = message.getFlag(MODULE_ID, "demonDamage");
  if (!isTrustedDemonDamageFlag(flag, true, message.rolls?.[0]?.total ?? null)) return;
  if (root.querySelector("[data-cwnce-apply-demon-damage]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.cwnceApplyDemonDamage = message.id;
  button.innerHTML = '<i class="fa-solid fa-ghost"></i> Apply Damage to Demon';
  button.addEventListener("click", () => applyDamageFromChatMessage(message));
  const actions = root.querySelector(".cwn-ce-chat-card__actions")
    ?? root.querySelector(".message-content");
  actions?.append(button);
});

function enhanceDemonRollBreakdowns(root, breakdowns) {
  if (!breakdowns || typeof breakdowns !== "object") return;
  for (const [kind, entries] of Object.entries({
    check: breakdowns.check,
    damage: breakdowns.damage,
  })) {
    if (!Array.isArray(entries) || !entries.length) continue;
    const tooltip = root
      .querySelector(`[data-cwnce-roll="${kind}"]`)
      ?.querySelector(".dice-tooltip");
    if (!tooltip || tooltip.querySelector(".cwnce-modifier-breakdown")) continue;
    tooltip.append(buildDemonModifierBreakdown(entries));
  }
}

function buildDemonModifierBreakdown(entries) {
  const section = document.createElement("section");
  section.className = "cwnce-modifier-breakdown";
  const heading = document.createElement("h4");
  heading.textContent = game.i18n.localize("CWNCE.Breakdown.Heading");
  section.append(heading);
  const list = document.createElement("dl");
  for (const entry of entries) {
    if (!entry || typeof entry.label !== "string") continue;
    const term = document.createElement("dt");
    term.textContent = game.i18n.localize(entry.label);
    const value = document.createElement("dd");
    const numeric = Number(entry.value);
    value.textContent = entry.modifier && Number.isFinite(numeric)
      ? `${numeric >= 0 ? "+" : ""}${numeric}`
      : String(entry.value ?? "");
    if (entry.total) {
      term.classList.add("cwnce-breakdown-total");
      value.classList.add("cwnce-breakdown-total");
    }
    list.append(term, value);
  }
  section.append(list);
  return section;
}

function isNetworkConsoleEnabled() {
  return Boolean(game.settings.get(MODULE_ID, "enableNetworkConsole"));
}

function exposeNetworkApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api ??= {};
  module.api.networkConsole = {
    open: openNetworkConsole,
    list: listNetworkDocuments,
    createDemonDamageCard: createDemonDamageCard,
  };
}

export function openNetworkConsole() {
  if (!isNetworkConsoleEnabled()) {
    ui.notifications.warn(game.i18n.localize("CWNCE.Network.Disabled"));
    return;
  }

  if (networkConsoleApp?.rendered) {
    networkConsoleApp.bringToFront();
    return networkConsoleApp;
  }

  networkConsoleApp = new NetworkConsoleApp();
  networkConsoleApp.render({ force: true });
  return networkConsoleApp;
}

function renderOpenNetworkConsole() {
  if (networkConsoleApp?.rendered) {
    networkConsoleApp.render();
  }
}

function listNetworkDocuments() {
  if (!game.user.isGM) return [];
  return game.journal
    .filter((journal) => journal.getFlag(MODULE_ID, NETWORK_FLAG))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getActiveNetworkDocument() {
  if (!game.user.isGM) return null;
  const activeId = game.settings.get(MODULE_ID, "activeNetworkId");
  return listNetworkDocuments().find((journal) => journal.id === activeId) ?? null;
}

function getRawNetworkData(journal) {
  return foundry.utils.deepClone(journal?.getFlag(MODULE_ID, NETWORK_FLAG) ?? null);
}

function getNetworkData(journal) {
  const raw = getRawNetworkData(journal);
  return raw ? normalizeNetwork(raw) : null;
}

function createNetworkData(name) {
  return {
    schemaVersion: NETWORK_SCHEMA_VERSION,
    id: foundry.utils.randomID(),
    name,
    idiom: "",
    securityDifficulty: 8,
    serverClass: "Alpha",
    alertProgress: 0,
    authorizedUserIds: [],
    nodes: [],
    connections: [],
    sessions: [],
  };
}

async function ensureNetworkFolder() {
  let folder = game.folders.find(
    (candidate) =>
      candidate.type === "JournalEntry" &&
      candidate.getFlag(MODULE_ID, NETWORK_FOLDER_FLAG),
  );
  if (folder) return folder;

  folder = await Folder.create({
    name: NETWORK_FOLDER_NAME,
    type: "JournalEntry",
    flags: {
      [MODULE_ID]: {
        [NETWORK_FOLDER_FLAG]: true,
      },
    },
  });
  return folder;
}

async function saveNetwork(journal, network) {
  if (!game.user.isGM || !journal || !network) return;
  network = normalizeNetwork(network);
  network.name = String(network.name || journal.name || "Untitled Network").trim();
  await journal.update({
    name: `[Network] ${network.name}`,
    [`flags.${MODULE_ID}.${NETWORK_FLAG}`]: network,
  });
  await publishNetworkProjection(journal, network);
}

async function migrateNetworkDocuments() {
  if (!game.user.isGM) return;
  for (const journal of listNetworkDocuments()) {
    const raw = getRawNetworkData(journal);
    if (!raw) continue;
    const migrated = normalizeNetwork(raw);
    if (JSON.stringify(raw) === JSON.stringify(migrated)) continue;
    await journal.update({
      [`flags.${MODULE_ID}.${NETWORK_FLAG}`]: migrated,
    });
  }
}

function sanitizeNetwork(network) {
  return network ? sanitizeNetworkForPlayers(network) : null;
}

async function publishNetworkProjection(journal, network = null) {
  if (!game.user.isGM) return;

  const activeJournal = journal ?? getActiveNetworkDocument();
  const activeNetwork = network ?? getNetworkData(activeJournal);
  const projection = activeJournal && activeNetwork
    ? {
        journalId: activeJournal.id,
        network: sanitizeNetwork(activeNetwork),
      }
    : null;

  await game.settings.set(
    MODULE_ID,
    "networkProjection",
    projection ? JSON.stringify(projection) : "",
  );
  if (activeNetwork) publishSessionProjections(activeNetwork);
}

function publishSessionProjections(network) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  for (const user of game.users.filter((candidate) => !candidate.isGM && candidate.active)) {
    game.socket.emit(SOCKET_NAME, {
      type: "sessionProjectionAvailable",
      targetUserId: user.id,
      networkId: network.id,
      sessions: sessionsForUser(network, user.id),
    });
  }
}

async function ensurePublishedProjection() {
  const active = getActiveNetworkDocument();
  if (!active) {
    const first = listNetworkDocuments()[0];
    if (first) {
      await game.settings.set(MODULE_ID, "activeNetworkId", first.id);
      await publishNetworkProjection(first);
    } else {
      await publishNetworkProjection(null);
    }
    return;
  }

  await publishNetworkProjection(active);
}

function readPublishedProjection() {
  const raw = game.settings.get(MODULE_ID, "networkProjection");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to parse Network Console projection.`, error);
    return null;
  }
}

function userCanViewProjection(network) {
  if (!network) return false;
  const authorized = network.authorizedUserIds ?? [];
  return authorized.length === 0 || authorized.includes(game.user.id) || game.user.isGM;
}

function getLinkedHacker(cyberdeck) {
  if (!cyberdeck || cyberdeck.type !== "cyberdeck") return null;
  if (typeof cyberdeck.system?.getHacker === "function") {
    return cyberdeck.system.getHacker();
  }
  const hackerId = cyberdeck.system?.hackerId;
  return hackerId ? game.actors.get(hackerId) ?? null : null;
}

function getPreparedCyberdecks() {
  return game.actors
    .filter((actor) => actor.type === "cyberdeck")
    .map((cyberdeck) => {
      const hacker = getLinkedHacker(cyberdeck);
      if (!hacker || (!game.user.isGM && !hacker.isOwner)) return null;

      const programs = cyberdeck.items.filter((item) => item.type === "program");
      return {
        cyberdeck,
        hacker,
        verbs: programs.filter((item) => item.system?.type === "verb"),
        subjects: programs.filter((item) => item.system?.type === "subject"),
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      `${a.hacker.name} ${a.cyberdeck.name}`.localeCompare(
        `${b.hacker.name} ${b.cyberdeck.name}`,
      ),
    );
}

function programTargets(program) {
  return String(program?.system?.target ?? "")
    .split("/")
    .map((target) => target.trim().toLowerCase())
    .filter(Boolean);
}

function programsAreCompatible(verb, subject) {
  const allowedTargets = new Set(programTargets(verb));
  const subjectTargets = programTargets(subject);
  return subjectTargets.some((target) => allowedTargets.has(target));
}

function preparedProgramOptionMarkup(programs) {
  return programs
    .map((program) => {
      const target = String(program.system?.target ?? "").trim();
      const suffix = target ? ` — ${target}` : "";
      return `<option value="${program.id}">${foundry.utils.escapeHTML(`${program.name}${suffix}`)}</option>`;
    })
    .join("");
}

async function choosePreparedProgram({ hackerUuid = "", cyberdeckUuid = "" } = {}) {
  const availableDecks = getPreparedCyberdecks().filter(({ hacker, cyberdeck }) =>
    (!hackerUuid || hacker.uuid === hackerUuid) &&
    (!cyberdeckUuid || cyberdeck.uuid === cyberdeckUuid),
  );
  if (!availableDecks.length) {
    addNetworkNotice(
      "The cyberdeck used by this hacker session is unavailable or has no prepared programs.",
      "warning",
      "Run Program",
    );
    return null;
  }

  const rememberedUuid = game.settings.get(MODULE_ID, "networkConsoleLastCyberdeckUuid");
  let selectedDeck =
    availableDecks.find(({ cyberdeck }) => cyberdeck.uuid === rememberedUuid) ??
    availableDecks[0];
  if (availableDecks.length > 1) {
    const deckOptions = availableDecks
      .map(({ cyberdeck, hacker }) =>
        `<option value="${cyberdeck.id}">${foundry.utils.escapeHTML(`${hacker.name} — ${cyberdeck.name}`)}</option>`,
      )
      .join("");
    const deckData = await waitForFormDialog({
      title: "Choose Hacker and Cyberdeck",
      saveLabel: "Choose Cyberdeck",
      content: `
        <p class="hint">Only cyberdecks linked to a hacker you control are listed.</p>
        <div class="form-group">
          <label>Hacker — Cyberdeck</label>
          <select name="cyberdeckId" required autofocus>${deckOptions}</select>
        </div>
      `,
    });
    if (!deckData?.cyberdeckId) return null;
    selectedDeck =
      availableDecks.find(({ cyberdeck }) => cyberdeck.id === deckData.cyberdeckId) ??
      null;
    if (!selectedDeck) {
      addNetworkNotice("The selected cyberdeck is no longer available.", "error", "Run Program");
      return null;
    }
  }

  await game.settings.set(
    MODULE_ID,
    "networkConsoleLastCyberdeckUuid",
    selectedDeck.cyberdeck.uuid,
  );

  if (!selectedDeck.verbs.length || !selectedDeck.subjects.length) {
    const missing = [
      !selectedDeck.verbs.length ? "a Verb" : "",
      !selectedDeck.subjects.length ? "a Subject" : "",
    ]
      .filter(Boolean)
      .join(" and ");
    addNetworkNotice(
      `${selectedDeck.cyberdeck.name} needs ${missing} loaded before it can run a program.`,
      "warning",
      "Run Program",
    );
    return null;
  }

  const programData = await waitForFormDialog({
    title: "Request: Run a Prepared Program",
    saveLabel: "Send Request",
    content: `
      <p class="hint">
        Hacker: <strong>${foundry.utils.escapeHTML(selectedDeck.hacker.name)}</strong><br>
        Cyberdeck: <strong>${foundry.utils.escapeHTML(selectedDeck.cyberdeck.name)}</strong><br>
        Only Verbs and Subjects loaded on this cyberdeck are available.
      </p>
      <div class="form-group">
        <label>Prepared Verb</label>
        <select name="verbId" required autofocus>
          ${preparedProgramOptionMarkup(selectedDeck.verbs)}
        </select>
      </div>
      <div class="form-group">
        <label>Prepared Subject</label>
        <select name="subjectId" required>
          ${preparedProgramOptionMarkup(selectedDeck.subjects)}
        </select>
      </div>
    `,
  });
  if (!programData?.verbId || !programData?.subjectId) return null;

  const verb = selectedDeck.verbs.find((item) => item.id === programData.verbId);
  const subject = selectedDeck.subjects.find((item) => item.id === programData.subjectId);
  if (!verb || !subject) {
    addNetworkNotice(
      "The selected Verb or Subject is no longer loaded on that cyberdeck.",
      "error",
      "Run Program",
    );
    return null;
  }
  if (!programsAreCompatible(verb, subject)) {
    addNetworkNotice(
      `${verb.name} cannot target ${subject.name}. Choose a Subject matching ${verb.system?.target || "the Verb's allowed target type"}.`,
      "warning",
      "Run Program",
    );
    return null;
  }

  return {
    hacker: selectedDeck.hacker,
    cyberdeck: selectedDeck.cyberdeck,
    verb,
    subject,
    accessCost: Number(verb.system?.accessCost) || 0,
    skillCheckMod:
      (Number(verb.system?.skillCheckMod) || 0) +
      (Number(subject.system?.skillCheckMod) || 0),
  };
}

async function chooseHackerAndCyberdeck() {
  const available = getPreparedCyberdecks();
  if (!available.length) {
    addNetworkNotice(
      "No cyberdeck linked to a hacker you control was found. Assign the hacker on the SWNR cyberdeck sheet first.",
      "warning",
      "Jack In",
    );
    return null;
  }
  if (available.length === 1) {
    await game.settings.set(MODULE_ID, "networkConsoleLastCyberdeckUuid", available[0].cyberdeck.uuid);
    return available[0];
  }
  const rememberedUuid = game.settings.get(MODULE_ID, "networkConsoleLastCyberdeckUuid");
  const options = available.map(({ hacker, cyberdeck }) =>
    `<option value="${cyberdeck.uuid}"${cyberdeck.uuid === rememberedUuid ? " selected" : ""}>${foundry.utils.escapeHTML(`${hacker.name} — ${cyberdeck.name}`)}</option>`,
  ).join("");
  const data = await waitForFormDialog({
    title: "Choose Hacker and Cyberdeck",
    saveLabel: "Choose Cyberdeck",
    content: `<div class="form-group"><label>Hacker — Cyberdeck</label><select name="cyberdeckUuid" required autofocus>${options}</select></div>`,
  });
  const selected = available.find(({ cyberdeck }) => cyberdeck.uuid === data?.cyberdeckUuid) ?? null;
  if (selected) {
    await game.settings.set(MODULE_ID, "networkConsoleLastCyberdeckUuid", selected.cyberdeck.uuid);
  }
  return selected;
}

function findNetworkDocumentByNetworkId(networkId) {
  return listNetworkDocuments().find((journal) => getNetworkData(journal)?.id === networkId) ?? null;
}

async function resolveSessionActors(payload) {
  const user = game.users.get(payload.userId);
  const hacker = await fromUuid(payload.hackerUuid);
  const cyberdeck = await fromUuid(payload.cyberdeckUuid);
  if (!user || !hacker || !cyberdeck || cyberdeck.type !== "cyberdeck") return null;
  if (!hacker.testUserPermission(user, "OWNER")) return null;
  if (getLinkedHacker(cyberdeck)?.uuid !== hacker.uuid) return null;
  return { user, hacker, cyberdeck };
}

async function approveJackIn(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  const journal = findNetworkDocumentByNetworkId(payload.networkId);
  const network = getNetworkData(journal);
  const node = findNode(network, payload.nodeId);
  const resolved = await resolveSessionActors(payload);
  if (!journal || !network || !node?.revealed || !resolved) {
    const message = "Jack In was rejected because its hacker, cyberdeck, network, or node is no longer valid.";
    addNetworkNotice(message, "warning", "Jack In");
    sendNetworkRequestResult(payload, "rejected", message);
    return;
  }
  const connectionType = payload.connectionType === "wireless" ? "wireless" : "physical";
  const approved = await confirmAction(
    "Approve Jack In",
    `${foundry.utils.escapeHTML(resolved.user.name)} requests ${connectionType} access for ${foundry.utils.escapeHTML(resolved.hacker.name)} using ${foundry.utils.escapeHTML(resolved.cyberdeck.name)} at ${foundry.utils.escapeHTML(node.name)}.${connectionType === "wireless" ? " Wireless access carries the RAW −2 context and cannot Move Nodes." : ""}`,
  );
  if (!approved) {
    addNetworkNotice(`Jack In rejected for ${resolved.user.name}.`, "warning", "Jack In");
    sendNetworkRequestResult(payload, "rejected", "The GM rejected your Jack In request.");
    return;
  }
  const result = addHackerSession(network, createHackerSession({
    id: foundry.utils.randomID(), networkId: network.id, journalUuid: journal.uuid,
    userId: resolved.user.id,
    hackerUuid: resolved.hacker.uuid, hackerName: resolved.hacker.name,
    cyberdeckUuid: resolved.cyberdeck.uuid, cyberdeckName: resolved.cyberdeck.name,
    nodeId: node.id, connectionType,
  }));
  if (!result.added) {
    const message = `Could not create hacker session: ${result.reason}.`;
    addNetworkNotice(message, "error", "Jack In");
    sendNetworkRequestResult(payload, "failed", message);
    return;
  }
  await saveNetwork(journal, result.network);
  const message = `${resolved.hacker.name} jacked in at ${node.name}.`;
  addNetworkNotice(message, "success", "Jack In");
  sendNetworkRequestResult(payload, "success", message);
}

async function approveSessionMove(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  const journal = findNetworkDocumentByNetworkId(payload.networkId);
  const network = getNetworkData(journal);
  if (!journal || !network) {
    sendNetworkRequestResult(payload, "failed", "The active network is no longer available.");
    return;
  }
  const validation = validateHackerMove(network, payload.sessionId, payload.destinationNodeId, payload.userId);
  if (!validation.allowed) {
    const messages = { wireless: "Wireless hacker sessions cannot Move Nodes.", "locked-barrier": "That route is blocked by a locked barrier.", "not-adjacent": "The destination is not one directly connected hop away.", "hidden-destination": "That destination is not visible to the player." };
    const message = messages[validation.reason] ?? "That hacker session cannot make the requested move.";
    addNetworkNotice(message, "warning", "Move Nodes");
    sendNetworkRequestResult(payload, "rejected", message);
    return;
  }
  if (!await confirmAction("Approve Hacker Movement", `Move ${foundry.utils.escapeHTML(validation.session.hackerName)} to ${foundry.utils.escapeHTML(validation.destination.name)}?`)) {
    addNetworkNotice(`Move Nodes rejected for ${validation.session.hackerName}.`, "warning", "Move Nodes");
    sendNetworkRequestResult(payload, "rejected", "The GM rejected your Move Nodes request.");
    return;
  }
  const result = moveHackerSession(network, payload.sessionId, payload.destinationNodeId, payload.userId);
  if (!result.moved) return;
  await saveNetwork(journal, result.network);
  const message = `${result.session.hackerName} moved to ${validation.destination.name}.`;
  addNetworkNotice(message, "success", "Move Nodes");
  sendNetworkRequestResult(payload, "success", message);
}

async function approveJackOut(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  const journal = findNetworkDocumentByNetworkId(payload.networkId);
  const network = getNetworkData(journal);
  const session = network?.sessions.find((entry) => entry.id === payload.sessionId);
  if (!journal || !network || !session || session.userId !== payload.userId) {
    sendNetworkRequestResult(payload, "failed", "That hacker session is no longer active.");
    return;
  }
  if (!await confirmAction("Approve Jack Out", `End ${foundry.utils.escapeHTML(session.hackerName)}'s active session?`)) {
    addNetworkNotice(`Jack Out rejected for ${session.hackerName}.`, "warning", "Jack Out");
    sendNetworkRequestResult(payload, "rejected", "The GM rejected your Jack Out request.");
    return;
  }
  const result = endHackerSession(network, session.id, payload.userId);
  if (!result.ended) return;
  await saveNetwork(journal, result.network);
  const message = `${session.hackerName} jacked out.`;
  addNetworkNotice(message, "success", "Jack Out");
  sendNetworkRequestResult(payload, "success", message);
}

function sendProgramExecutionResult(payload, status, message) {
  game.socket.emit(SOCKET_NAME, {
    type: "programExecutionResult",
    targetUserId: payload.userId,
    requestId: payload.requestId,
    status,
    message,
  });
}

function pruneProgramRequestStates() {
  while (programRequestStates.size > 200) {
    programRequestStates.delete(programRequestStates.keys().next().value);
  }
}

function pruneCopyFileRequestStates() {
  while (copyFileRequestStates.size > 200) {
    copyFileRequestStates.delete(copyFileRequestStates.keys().next().value);
  }
}

async function approveCopyFile(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  const requestId = String(payload.requestId || "");
  if (!requestId) return;
  if (copyFileRequestStates.has(requestId)) {
    sendNetworkRequestResult(payload, "failed", "This Copy File request was already handled.");
    return;
  }
  copyFileRequestStates.set(requestId, "pending");
  pruneCopyFileRequestStates();

  const user = game.users.get(payload.userId);
  const journal = findNetworkDocumentByNetworkId(payload.networkId);
  const network = getNetworkData(journal);
  const session = network?.sessions.find(
    (entry) => entry.userId === payload.userId && entry.jackedIn,
  );
  const node = findNode(network, session?.currentNodeId);
  const datafile = node?.datafiles.find((entry) => entry.id === payload.datafileId);
  if (!user || !journal || !network || !session || !node || !datafile?.revealed || datafile.copied) {
    const message = "Copy File was rejected because the session or datafile is no longer valid.";
    copyFileRequestStates.set(requestId, "failed");
    addNetworkNotice(message, "warning", "Copy File");
    sendNetworkRequestResult(payload, "failed", message);
    return;
  }

  const approved = await confirmAction(
    "Approve Copy File",
    `${foundry.utils.escapeHTML(user.name)} requests <strong>${foundry.utils.escapeHTML(datafile.name)}</strong> from ${foundry.utils.escapeHTML(node.name)}. Mark this datafile as copied?`,
  );
  if (!approved) {
    copyFileRequestStates.set(requestId, "rejected");
    addNetworkNotice(`Copy File rejected for ${user.name}.`, "warning", "Copy File");
    sendNetworkRequestResult(payload, "rejected", "The GM rejected your Copy File request.");
    return;
  }

  datafile.copied = true;
  await saveNetwork(journal, network);
  copyFileRequestStates.set(requestId, "complete");
  const message = `${datafile.name} was copied successfully.`;
  addNetworkNotice(`${user.name}: ${message}`, "success", "Copy File");
  sendNetworkRequestResult(payload, "success", message);
}

function queueProgramExecution(task) {
  const queued = programExecutionQueue.then(task, task);
  programExecutionQueue = queued.catch(() => undefined);
  return queued;
}

async function resolveProgramExecutionRequest(payload) {
  if (!programRequestIsFresh(payload.receivedAt)) {
    return { valid: false, reason: "This Run Program request expired. Send a new request." };
  }

  const program = payload.program ?? {};
  const user = game.users.get(payload.userId);
  const journal = findNetworkDocumentByNetworkId(payload.networkId);
  const network = getNetworkData(journal);
  const session = network?.sessions.find((entry) => entry.id === program.sessionId);
  if (!user || !journal || !network || !session || session.userId !== payload.userId || !session.jackedIn) {
    return { valid: false, reason: "The player's active hacker session is no longer valid." };
  }

  const node = findNode(network, session.currentNodeId);
  if (!node) return { valid: false, reason: "The hacker's current network node no longer exists." };

  const hacker = await fromUuid(program.hackerUuid);
  const cyberdeck = await fromUuid(program.cyberdeckUuid);
  if (!hacker || !cyberdeck || cyberdeck.type !== "cyberdeck") {
    return { valid: false, reason: "The linked hacker or cyberdeck is no longer available." };
  }
  if (!hacker.testUserPermission(user, "OWNER") || getLinkedHacker(cyberdeck)?.uuid !== hacker.uuid) {
    return { valid: false, reason: "The player no longer controls the hacker linked to that cyberdeck." };
  }
  if (session.hackerUuid !== hacker.uuid || session.cyberdeckUuid !== cyberdeck.uuid) {
    return { valid: false, reason: "The selected hacker and cyberdeck do not match the active session." };
  }

  const verb = cyberdeck.items.get(program.verbId);
  const subject = cyberdeck.items.get(program.subjectId);
  if (verb?.type !== "program" || subject?.type !== "program" || verb.system?.type !== "verb" || subject.system?.type !== "subject") {
    return { valid: false, reason: "The selected Verb or Subject is no longer loaded on the cyberdeck." };
  }
  if (!programsAreCompatible(verb, subject)) {
    return { valid: false, reason: "The selected Verb and Subject are no longer compatible." };
  }

  const resources = programResourceState({
    hacker,
    cyberdeck,
    accessCost: verb.system?.accessCost,
    selfTerminating: verb.system?.selfTerminating,
  });
  if (!resources.valid) {
    const reason = resources.reason === "insufficient-cpu"
      ? "The cyberdeck has no free CPU for this persistent program."
      : "The hacker no longer has enough Access to run this program.";
    return { valid: false, reason };
  }

  return { valid: true, user, journal, network, session, node, hacker, cyberdeck, verb, subject, resources };
}

async function executeApprovedProgram(payload) {
  const resolved = await resolveProgramExecutionRequest(payload);
  if (!resolved.valid) throw new Error(resolved.reason);

  const { user, network, session, node, hacker, cyberdeck, verb, subject, resources } = resolved;
  const rollContext = programRollContext({
    hacker,
    cyberdeck,
    verb,
    subject,
    wirelessPenalty: session.wirelessPenalty,
  });
  const source = runningProgramSource({
    verb,
    subject,
    networkId: network.id,
    nodeId: node.id,
    sessionId: session.id,
    requestId: payload.requestId,
  });

  let createdProgram = null;
  let accessUpdated = false;
  try {
    [createdProgram] = await cyberdeck.createEmbeddedDocuments("Item", [source]);
    await hacker.update({ "system.access.value": resources.accessAfter });
    accessUpdated = true;

    const roll = await new Roll(rollContext.formula, rollContext.data).evaluate();
    const rollHtml = await roll.render();
    const content = renderNetworkProgramChatCard({
      programName: source.name,
      hackerName: hacker.name,
      cyberdeckName: cyberdeck.name,
      networkName: network.name,
      nodeName: node.name,
      connectionType: session.connectionType,
      accessBefore: resources.hackerAccess,
      accessAfter: resources.accessAfter,
      accessCost: resources.accessCost,
      cpuBefore: resources.cpuAvailable,
      selfTerminating: Boolean(verb.system?.selfTerminating),
      rollTotal: roll.total,
      rollFormula: roll.formula,
      rollHtml,
      modifierBreakdown: rollContext.breakdown,
    });
    await getDocumentClass("ChatMessage").create({
      speaker: ChatMessage.getSpeaker({ actor: hacker }),
      content,
      rolls: [roll],
      whisper: [...new Set([game.user.id, user.id])],
      flags: {
        [MODULE_ID]: {
          networkProgramExecution: {
            requestId: payload.requestId,
            networkId: network.id,
            nodeId: node.id,
            sessionId: session.id,
            programUuid: createdProgram?.uuid ?? "",
          },
        },
      },
    });

    if (verb.system?.selfTerminating && createdProgram) {
      await createdProgram.delete();
      createdProgram = null;
    }
    sendProgramExecutionResult(payload, "success", `${source.name} ran successfully. The GM must adjudicate its effect.`);
    addNetworkNotice(`${hacker.name} ran ${source.name}.`, "success", "Run Program");
  } catch (error) {
    if (accessUpdated) {
      await hacker.update({ "system.access.value": resources.hackerAccess }).catch(() => undefined);
    }
    if (createdProgram) await createdProgram.delete().catch(() => undefined);
    throw error;
  }
}

async function approveProgramExecution(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  // Request age is measured from receipt by the active GM. Player and GM
  // computers can have different clocks, so the player's timestamp is not an
  // authoritative expiry clock.
  const gmPayload = { ...payload, receivedAt: Date.now() };
  const requestId = String(gmPayload.requestId || "");
  if (!requestId) return;
  if (programRequestStates.has(requestId)) {
    sendProgramExecutionResult(gmPayload, "failed", "This Run Program request was already handled.");
    return;
  }
  programRequestStates.set(requestId, "pending");
  pruneProgramRequestStates();

  try {
    const resolved = await resolveProgramExecutionRequest(gmPayload);
    if (!resolved.valid) throw new Error(resolved.reason);
    const { user, network, session, node, hacker, cyberdeck, verb, subject, resources } = resolved;
    const programName = `${verb.name} ${subject.name}`;
    const approved = await confirmAction(
      "Approve Run Program",
      `${foundry.utils.escapeHTML(user.name)} requests <strong>${foundry.utils.escapeHTML(programName)}</strong> for ${foundry.utils.escapeHTML(hacker.name)} using ${foundry.utils.escapeHTML(cyberdeck.name)} at ${foundry.utils.escapeHTML(node.name)} on ${foundry.utils.escapeHTML(network.name)}. Access ${resources.hackerAccess} to ${resources.accessAfter} (cost ${resources.accessCost}); CPU available ${resources.cpuAvailable}; connection ${session.connectionType}.`,
    );
    if (!approved) {
      programRequestStates.set(requestId, "rejected");
      sendProgramExecutionResult(gmPayload, "rejected", `The GM rejected ${programName}.`);
      addNetworkNotice(`${programName} rejected for ${user.name}.`, "warning", "Run Program");
      return;
    }
    await queueProgramExecution(() => executeApprovedProgram(gmPayload));
    programRequestStates.set(requestId, "complete");
  } catch (error) {
    programRequestStates.set(requestId, "failed");
    const message = error instanceof Error ? error.message : "Program execution failed.";
    console.error(`${MODULE_ID} | Network program execution failed`, error);
    addNetworkNotice(message, "error", "Run Program");
    sendProgramExecutionResult(gmPayload, "failed", message);
  } finally {
    renderOpenNetworkConsole();
  }
}

function handleNetworkSocket(payload) {
  if (!isNetworkConsoleEnabled() || !payload?.type) return;

  if (payload.type === "projectionRequest" && game.user.isGM) {
    if (game.users.activeGM?.id !== game.user.id) return;
    game.socket.emit(SOCKET_NAME, {
      type: "projectionAvailable",
      targetUserId: payload.requesterId,
    });
    const activeNetwork = getNetworkData(getActiveNetworkDocument());
    if (activeNetwork) {
      game.socket.emit(SOCKET_NAME, {
        type: "sessionProjectionAvailable",
        targetUserId: payload.requesterId,
        networkId: activeNetwork.id,
        sessions: sessionsForUser(activeNetwork, payload.requesterId),
      });
    }
    return;
  }

  if (
    payload.type === "projectionAvailable" &&
    payload.targetUserId === game.user.id
  ) {
    renderOpenNetworkConsole();
    return;
  }

  if (
    payload.type === "sessionProjectionAvailable" &&
    payload.targetUserId === game.user.id
  ) {
    playerSessionProjection = {
      networkId: String(payload.networkId || ""),
      sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    };
    renderOpenNetworkConsole();
    return;
  }

  if (payload.type === "programExecutionResult" && payload.targetUserId === game.user.id) {
    addNetworkNotice(
      payload.message || "Run Program request updated.",
      networkStatusLevel(payload.status),
      "Run Program",
    );
    renderOpenNetworkConsole();
    return;
  }

  if (payload.type === "networkRequestResult" && payload.targetUserId === game.user.id) {
    const action = PLAYER_ACTIONS.find((entry) => entry.id === payload.actionId);
    addNetworkNotice(
      payload.message || "Network request updated.",
      networkStatusLevel(payload.status),
      action?.label || "Network Request",
    );
    return;
  }

  if (payload.type === "sessionRequest" && game.user.isGM) {
    if (game.users.activeGM?.id !== game.user.id) return;
    const userName = game.users.get(payload.userId)?.name ?? "A player";
    const action = PLAYER_ACTIONS.find((entry) => entry.id === payload.actionId);
    addNetworkNotice(`${userName} requests ${action?.label ?? "a session action"}.`, "info", "Pending Request");
    if (payload.actionId === "jackIn") void approveJackIn(payload);
    else if (payload.actionId === "moveNodes") void approveSessionMove(payload);
    else if (payload.actionId === "jackOut") void approveJackOut(payload);
    return;
  }

  if (payload.type === "actionRequest" && game.user.isGM) {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (payload.actionId === "runProgram") {
      addNetworkNotice(`${game.users.get(payload.userId)?.name ?? "A player"} requests Run a Program.`, "info", "Pending Request");
      void approveProgramExecution(payload);
      return;
    }
    if (payload.actionId === "copyFile") {
      addNetworkNotice(`${game.users.get(payload.userId)?.name ?? "A player"} requests Copy File.`, "info", "Pending Request");
      void approveCopyFile(payload);
      return;
    }
    const user = game.users.get(payload.userId);
    const userName = user?.name ?? "A player";
    const nodeSuffix = payload.nodeName ? ` at ${payload.nodeName}` : "";
    const detailSuffix = payload.detail ? `: ${payload.detail}` : "";
    addNetworkNotice(`${userName} requests ${payload.actionLabel}${nodeSuffix}${detailSuffix}`, "info", "Pending Request");
  }
}

function buildGraph(network, showHidden, sessions = []) {
  if (!network) return { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height, nodes: [], connections: [] };

  const nodes = network.nodes.filter((node) => showHidden || node.revealed);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = network.connections.filter(
    (connection) =>
      nodeIds.has(connection.source) &&
      nodeIds.has(connection.target) &&
      (showHidden || connection.revealed),
  );

  if (!nodes.length) {
    return { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height, nodes: [], connections: [] };
  }

  const width = Math.max(
    DEFAULT_CANVAS.width,
    ...nodes.map((node) => node.position.x + DEFAULT_CANVAS.nodeWidth + 320),
  );
  const height = Math.max(
    DEFAULT_CANVAS.height,
    ...nodes.map((node) =>
      node.position.y +
      DEFAULT_CANVAS.nodeHeight +
      (node.demons?.length ?? 0) * 24 +
      240),
  );
  const positioned = nodes.map((node) => ({
    ...decorateNode(node, node.position.x, node.position.y),
    hackerAvatars: sessions
      .filter((session) => session.currentNodeId === node.id && session.jackedIn)
      .map((session) => ({
        id: session.id,
        name: session.hackerName,
        connectionType: session.connectionType,
        wireless: session.connectionType === "wireless",
      })),
  }));

  const decoratedConnections = connections.map((connection) => {
    return {
      ...connection,
      cssClass: [
        connection.revealed ? "is-revealed" : "is-hidden",
        connection.barrier ? "has-barrier" : "",
        connection.barrierLocked ? "is-locked" : "",
        connection.oneWay ? "is-one-way" : "",
      ].filter(Boolean).join(" "),
    };
  });

  return { width, height, nodes: positioned, connections: decoratedConnections };
}

function decorateNode(node, x = 0, y = 0, expandedDemonIds = new Set()) {
  const type = NODE_TYPES[node.type] ?? NODE_TYPES.custom;
  return {
    ...node,
    typeLabel: type.label,
    icon: type.icon,
    stateLabel: NODE_STATES[node.state] ?? node.state ?? "Normal",
    visibleDatafileCount: node.datafiles?.filter((entry) => entry.revealed).length ?? 0,
    demonCount: node.demons?.length ?? 0,
    demons: (node.demons ?? []).map((demon) => ({
      ...demon,
      isFragged: Boolean(demon.isFragged) ||
        demon.state === "fragged" ||
        (demon.maxHp > 0 && demon.currentHp <= 0),
      expanded: expandedDemonIds.has(demon.id),
      classLabel: demon.classKey === CUSTOM_DEMON_CLASS ? "Custom Demon" : demon.classKey,
      profileLabel: demon.programmingProfile === CUSTOM_PROGRAMMING_PROFILE
        ? "Custom Programming"
        : demon.programmingProfile,
      commands: [
        ...(demon.profileCommandLines ?? []),
        ...(demon.additionalCommandLines ?? []),
        ...(demon.customCommandLines ?? []),
      ]
        .sort((a, b) => a.priority - b.priority)
        .map((command) => ({
          ...command,
          nodeId: node.id,
          demonId: demon.id,
          action: DEMON_ACTIONS[command.actionKey] ?? null,
          executable: Boolean(command.actionKey && DEMON_ACTIONS[command.actionKey]),
        })),
      actionDisabled: demon.state === "fragged" || demon.currentHp <= 0,
    })),
    positionStyle: `left:${x}px;top:${y}px`,
    cssClass: [
      node.revealed ? "is-revealed" : "is-hidden",
      `state-${node.state ?? "normal"}`,
    ].join(" "),
  };
}

function findNode(network, id) {
  return network?.nodes?.find((node) => node.id === id) ?? null;
}

function connectionLabel(connection, network) {
  const source = findNode(network, connection.source)?.name ?? "Unknown";
  const target = findNode(network, connection.target)?.name ?? "Unknown";
  return `${source} -> ${target}`;
}

function optionMarkup(options, selected = "") {
  return Object.entries(options)
    .map(([value, labelOrConfig]) => {
      const label = typeof labelOrConfig === "string"
        ? labelOrConfig
        : labelOrConfig.label;
      const isSelected = value === selected ? " selected" : "";
      return `<option value="${foundry.utils.escapeHTML(value)}"${isSelected}>${foundry.utils.escapeHTML(label)}</option>`;
    })
    .join("");
}

function nodeOptionMarkup(nodes, selected = "") {
  return nodes
    .map((node) => {
      const isSelected = node.id === selected ? " selected" : "";
      return `<option value="${node.id}"${isSelected}>${foundry.utils.escapeHTML(node.name)}</option>`;
    })
    .join("");
}

function formDataObject(form) {
  const result = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (!(key in result)) result[key] = value;
    else if (Array.isArray(result[key])) result[key].push(value);
    else result[key] = [result[key], value];
  }
  return result;
}

async function waitForFormDialog({
  title,
  content,
  saveLabel = "Save",
  render = null,
  dialogClass = "",
  onSubmit = null,
  failureMessage = "The requested change could not be saved.",
}) {
  return foundry.applications.api.DialogV2.wait({
    classes: ["cwnce-network-form-dialog", dialogClass].filter(Boolean),
    form: { closeOnSubmit: !onSubmit },
    window: { title },
    content: `<div class="standard-form cwnce-network-dialog">${content}</div>`,
    render,
    buttons: [
      {
        action: "save",
        label: saveLabel,
        icon: "fa-solid fa-floppy-disk",
        default: true,
        callback: async (event, button, dialog) => {
          if (button.dataset.cwnceSubmitting === "true") return false;
          const data = formDataObject(button.form);
          if (!onSubmit) return data;
          button.dataset.cwnceSubmitting = "true";
          button.disabled = true;
          try {
            const result = await onSubmit(data, { event, button, dialog });
            if (result === false) return false;
            await dialog.close();
            return result;
          } catch (error) {
            console.error(`${MODULE_ID} | ${failureMessage}`, error);
            ui.notifications.error(failureMessage);
            return false;
          } finally {
            delete button.dataset.cwnceSubmitting;
            button.disabled = false;
          }
        },
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark",
        callback: async (_event, _button, dialog) => {
          if (onSubmit) await dialog.close();
          return null;
        },
      },
    ],
    close: () => null,
  });
}

async function confirmAction(title, content) {
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<p>${content}</p>`,
    buttons: [
      {
        action: "confirm",
        label: "Confirm",
        icon: "fa-solid fa-check",
        default: true,
        callback: () => true,
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark",
        callback: () => false,
      },
    ],
    close: () => false,
  });
}

export class NetworkConsoleApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  selectedNodeId = null;
  selectedConnectionId = null;
  connectionGeometryFrame = null;
  connectionResizeObserver = null;
  connectionEventController = null;
  expandedDemonIds = new Set();
  geometryRestored = false;

  static DEFAULT_OPTIONS = {
    id: "cwnce-network-console",
    classes: ["cwnce-network-console"],
    position: {
      width: 1120,
      height: 780,
    },
    window: {
      title: "CWNCE.Network.WindowTitle",
      icon: "fa-solid fa-network-wired",
      resizable: true,
      minimizable: true,
    },
    actions: {
      createNetwork: this.createNetwork,
      deleteNetwork: this.deleteNetwork,
      saveNetwork: this.saveNetwork,
      addNode: this.addNode,
      editNode: this.editNode,
      editNodeDetails: this.editNodeDetails,
      saveNodeInspector: this.saveNodeInspector,
      duplicateNode: this.duplicateNode,
      autoArrange: this.autoArrange,
      connectSelectedNode: this.connectSelectedNode,
      deleteNode: this.deleteNode,
      toggleNodeReveal: this.toggleNodeReveal,
      selectNode: this.selectNode,
      addConnection: this.addConnection,
      editConnection: this.editConnection,
      saveConnectionInspector: this.saveConnectionInspector,
      selectConnection: this.selectConnection,
      deleteConnection: this.deleteConnection,
      toggleConnectionReveal: this.toggleConnectionReveal,
      addDatafile: this.addDatafile,
      editDatafile: this.editDatafile,
      deleteDatafile: this.deleteDatafile,
      toggleDatafileReveal: this.toggleDatafileReveal,
      addDemon: this.addDemon,
      editDemon: this.editDemon,
      duplicateDemon: this.duplicateDemon,
      deleteDemon: this.deleteDemon,
      toggleDemonReveal: this.toggleDemonReveal,
      toggleDemonExpanded: this.toggleDemonExpanded,
      adjustDemonHp: this.adjustDemonHp,
      setDemonHp: this.setDemonHp,
      setDemonState: this.setDemonState,
      applyDemonDamage: this.applyDemonDamage,
      restoreDemon: this.restoreDemon,
      executeDemonAction: this.executeDemonAction,
      addWatchdog: this.addWatchdog,
      editWatchdog: this.editWatchdog,
      deleteWatchdog: this.deleteWatchdog,
      toggleWatchdogReveal: this.toggleWatchdogReveal,
      endSession: this.endSession,
      requestAction: this.requestAction,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/network-console/console.hbs`,
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.enabled = isNetworkConsoleEnabled();
    context.isGM = game.user.isGM;
    context.networkNotices = networkNotices.map((notice) => ({ ...notice }));
    context.hasNetworkNotices = context.networkNotices.length > 0;

    if (!context.enabled) return context;

    let network = null;
    let journal = null;

    if (game.user.isGM) {
      const journals = listNetworkDocuments();
      journal = getActiveNetworkDocument() ?? journals[0] ?? null;
      network = getNetworkData(journal);
      context.networks = journals.map((candidate) => ({
        id: candidate.id,
        name: getNetworkData(candidate)?.name ?? candidate.name,
        selected: candidate.id === journal?.id,
      }));
      context.journalId = journal?.id ?? "";
    } else {
      const projection = readPublishedProjection();
      if (projection && userCanViewProjection(projection.network)) {
        network = projection.network;
        context.journalId = projection.journalId;
      } else if (projection) {
        context.notAuthorized = true;
      }
    }

    context.hasNetwork = Boolean(network);
    if (!network) return context;

    const visibleSessions = game.user.isGM
      ? network.sessions
      : (playerSessionProjection?.networkId === network.id
          ? playerSessionProjection.sessions
          : []);
    const displaySessions = visibleSessions.map((session) => ({
      ...session,
      currentNodeName: findNode(network, session.currentNodeId)?.name ?? "Hidden node",
      entryNodeName: findNode(network, session.entryNodeId)?.name ?? "Hidden node",
    }));
    const graph = buildGraph(network, game.user.isGM, displaySessions);
    context.network = network;
    context.activeSessions = displaySessions;
    context.hasActiveSessions = displaySessions.length > 0;
    context.currentSession = displaySessions[0] ?? null;
    context.playerConnected = !game.user.isGM && Boolean(context.currentSession);
    context.graph = graph;
    context.nodeCount = network.nodes.length;
    context.connectionCount = network.connections.length;
    context.barrierCount = network.connections.filter((connection) => connection.barrier).length;
    context.serverLimits = SERVER_LIMITS[network.serverClass] ?? SERVER_LIMITS.Alpha;
    context.alertLabel =
      Number(network.alertProgress) >= 2
        ? "ALERTED"
        : `${Number(network.alertProgress) || 0} of 2 alert actions`;

    if (this.selectedConnectionId &&
        !network.connections.some((connection) => connection.id === this.selectedConnectionId)) {
      this.selectedConnectionId = null;
    }
    if (!this.selectedConnectionId &&
        (!this.selectedNodeId || !findNode(network, this.selectedNodeId))) {
      this.selectedNodeId = network.nodes[0]?.id ?? null;
    }
    const selectedNode = findNode(network, this.selectedNodeId);
    context.selectedNode = selectedNode
      ? decorateNode(selectedNode, 0, 0, this.expandedDemonIds)
      : null;
    const selectedConnection = network.connections.find(
      (connection) => connection.id === this.selectedConnectionId,
    );
    context.selectedConnection = selectedConnection
      ? {
          ...selectedConnection,
          barrierState: selectedConnection.barrierLocked
            ? "locked"
            : selectedConnection.barrier
              ? "unlocked"
              : "none",
          barrierNone: !selectedConnection.barrier,
          barrierUnlocked: selectedConnection.barrier && !selectedConnection.barrierLocked,
          barrierLockedSelected: selectedConnection.barrierLocked,
          label: connectionLabel(selectedConnection, network),
          nodeOptions: network.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            sourceSelected: node.id === selectedConnection.source,
            targetSelected: node.id === selectedConnection.target,
          })),
        }
      : null;
    context.playerActions = PLAYER_ACTIONS;
    context.nodeTypeOptions = Object.entries(NODE_TYPES).map(([id, config]) => ({
      id,
      label: config.label,
      icon: config.icon,
      selected: id === selectedNode?.type,
    }));
    context.nodeStateOptions = Object.entries(NODE_STATES).map(([id, label]) => ({
      id,
      label,
      selected: id === selectedNode?.state,
    }));
    context.nodePalette = Object.entries(NODE_TYPES).map(([id, config]) => ({
      id,
      label: config.label,
      icon: config.icon,
    }));

    if (game.user.isGM) {
      context.nodeList = network.nodes.map((node) => decorateNode(node));
      context.connectionList = network.connections.map((connection) => ({
        ...connection,
        label: connectionLabel(connection, network),
      }));
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._restoreGeometry();
    this._watchConnectionGeometry();
    const select = this.element.querySelector("[data-network-select]");
    select?.addEventListener("change", async (event) => {
      if (!game.user.isGM) return;
      await game.settings.set(MODULE_ID, "activeNetworkId", event.currentTarget.value);
      this.selectedNodeId = null;
      this.selectedConnectionId = null;
      await publishNetworkProjection(getActiveNetworkDocument());
      this.render();
    });
    for (const stateSelect of this.element.querySelectorAll("[data-demon-state]")) {
      stateSelect.addEventListener("change", (event) =>
        NetworkConsoleApp.setDemonState.call(this, event, event.currentTarget));
    }
    if (game.user.isGM) this._enableVisualEditor();
  }

  _restoreGeometry() {
    if (this.geometryRestored) return;
    this.geometryRestored = true;
    try {
      const stored = JSON.parse(game.settings.get(MODULE_ID, "networkConsoleGeometry") || "null");
      if (!stored) return;
      const width = Math.max(760, Math.min(window.innerWidth - 24, Number(stored.width) || 1120));
      const height = Math.max(560, Math.min(window.innerHeight - 24, Number(stored.height) || 780));
      const left = Math.max(0, Math.min(window.innerWidth - width, Number(stored.left) || 0));
      const top = Math.max(0, Math.min(window.innerHeight - height, Number(stored.top) || 0));
      this.setPosition({ width, height, left, top });
    } catch (error) {
      console.warn(`${MODULE_ID} | Ignoring invalid Network Console geometry.`, error);
    }
  }

  async close(options = {}) {
    if (this.element?.isConnected) {
      const rect = this.element.getBoundingClientRect();
      await game.settings.set(MODULE_ID, "networkConsoleGeometry", JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));
    }
    return super.close(options);
  }

  _enableVisualEditor() {
    const graph = this.element.querySelector(".cwnce-graph");
    if (!graph) return;

    for (const paletteItem of this.element.querySelectorAll("[data-palette-node-type]")) {
      paletteItem.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-cwnce-node-type",
          paletteItem.dataset.paletteNodeType,
        );
      });
    }
    graph.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("application/x-cwnce-node-type")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      graph.classList.add("is-drop-target");
    });
    graph.addEventListener("dragleave", () => graph.classList.remove("is-drop-target"));
    graph.addEventListener("drop", async (event) => {
      const type = event.dataTransfer.getData("application/x-cwnce-node-type");
      if (!NODE_TYPES[type]) return;
      event.preventDefault();
      graph.classList.remove("is-drop-target");
      const rect = graph.getBoundingClientRect();
      await this._createPaletteNode(type, {
        x: event.clientX - rect.left - DEFAULT_CANVAS.nodeWidth / 2,
        y: event.clientY - rect.top - DEFAULT_CANVAS.nodeHeight / 2,
      }, { width: graph.offsetWidth, height: graph.offsetHeight });
    });

    for (const nodeElement of graph.querySelectorAll(".cwnce-graph-node")) {
      nodeElement.addEventListener("pointerdown", (event) =>
        this._beginNodeDrag(event, nodeElement, graph));
    }
    for (const line of graph.querySelectorAll("line[data-connection-id]")) {
      line.addEventListener("click", () => {
        this.selectedConnectionId = line.dataset.connectionId;
        this.selectedNodeId = null;
        this.render();
      });
    }
  }

  async _createPaletteNode(type, position, bounds) {
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    if (!journal || !network) return;
    const previousSelection = findNode(network, this.selectedNodeId);
    const label = NODE_TYPES[type].label;
    const existing = network.nodes.filter((node) => node.type === type).length;
    const node = createNode({
      id: foundry.utils.randomID(),
      type,
      name: existing ? `${label} ${existing + 1}` : label,
      position: clampPosition(position, { ...DEFAULT_CANVAS, ...bounds }),
    });
    network.nodes.push(node);
    if (previousSelection &&
        !connectionExists(network.connections, previousSelection.id, node.id)) {
      network.connections.push({
        id: foundry.utils.randomID(),
        source: previousSelection.id,
        target: node.id,
        revealed: previousSelection.revealed && node.revealed,
        barrier: false,
        barrierLocked: false,
        oneWay: false,
        gmNotes: "",
      });
      ui.notifications.info(`Created ${node.name} and connected it to ${previousSelection.name}.`);
    } else {
      ui.notifications.info(`Created ${node.name}.`);
    }
    await saveNetwork(journal, network);
    this.selectedNodeId = node.id;
    this.selectedConnectionId = null;
    this.render();
  }

  _beginNodeDrag(event, element, graph) {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: Number.parseFloat(element.style.left) || 0,
      top: Number.parseFloat(element.style.top) || 0,
    };
    let moved = false;
    element.setPointerCapture(event.pointerId);
    element.classList.add("is-dragging");

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      moved ||= Math.hypot(dx, dy) > 4;
      if (!moved) return;
      const position = clampPosition(
        { x: start.left + dx, y: start.top + dy },
        {
          ...DEFAULT_CANVAS,
          width: graph.offsetWidth,
          height: graph.offsetHeight,
          nodeWidth: element.offsetWidth,
          nodeHeight: element.offsetHeight,
        },
      );
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      this._refreshConnectionGeometry();
    };
    const finish = async (upEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      element.classList.remove("is-dragging");
      if (!moved) {
        this.selectedNodeId = element.dataset.nodeId;
        this.selectedConnectionId = null;
        this.render();
        return;
      }
      upEvent.preventDefault();
      const journal = getActiveNetworkDocument();
      const network = getNetworkData(journal);
      const node = findNode(network, element.dataset.nodeId);
      if (!journal || !network || !node) return;
      node.position = clampPosition({
        x: Number.parseFloat(element.style.left),
        y: Number.parseFloat(element.style.top),
      }, {
        ...DEFAULT_CANVAS,
        width: graph.offsetWidth,
        height: graph.offsetHeight,
        nodeWidth: element.offsetWidth,
        nodeHeight: element.offsetHeight,
      });
      await saveNetwork(journal, network);
      this.selectedNodeId = node.id;
      this.selectedConnectionId = null;
      this.render();
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
  }

  _watchConnectionGeometry() {
    if (this.connectionGeometryFrame !== null) {
      cancelAnimationFrame(this.connectionGeometryFrame);
      this.connectionGeometryFrame = null;
    }
    this.connectionResizeObserver?.disconnect();
    this.connectionResizeObserver = null;
    this.connectionEventController?.abort();
    this.connectionEventController = new AbortController();

    const graph = this.element.querySelector(".cwnce-graph");
    const graphScroll = this.element.querySelector(".cwnce-graph-scroll");
    const svg = graph?.querySelector(".cwnce-graph-edges");
    if (!graph || !svg) return;

    const schedule = () => this._scheduleConnectionGeometry();
    graphScroll?.addEventListener("scroll", schedule, {
      passive: true,
      signal: this.connectionEventController.signal,
    });
    window.addEventListener("resize", schedule, {
      passive: true,
      signal: this.connectionEventController.signal,
    });

    if (typeof ResizeObserver === "function") {
      this.connectionResizeObserver = new ResizeObserver(schedule);
      this.connectionResizeObserver.observe(graph);
      this.connectionResizeObserver.observe(svg);
      for (const node of graph.querySelectorAll(".cwnce-graph-node")) {
        this.connectionResizeObserver.observe(node);
      }
    }

    this._scheduleConnectionGeometry();
  }

  _scheduleConnectionGeometry() {
    if (this.connectionGeometryFrame !== null) {
      cancelAnimationFrame(this.connectionGeometryFrame);
    }
    this.connectionGeometryFrame = requestAnimationFrame(() => {
      this.connectionGeometryFrame = null;
      this._refreshConnectionGeometry();
    });
  }

  _refreshConnectionGeometry() {
    const graph = this.element.querySelector(".cwnce-graph");
    const svg = graph?.querySelector(".cwnce-graph-edges");
    if (!graph || !svg) return;

    const svgRect = svg.getBoundingClientRect();
    const viewBox = svgPixelViewBox(svgRect);
    if (!viewBox) {
      delete svg.dataset.geometryReady;
      return;
    }
    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    );
    const nodes = new Map(
      Array.from(graph.querySelectorAll(".cwnce-graph-node"), (node) => [
        node.dataset.nodeId,
        node,
      ]),
    );

    for (const line of svg.querySelectorAll("line[data-connection-id]")) {
      const sourceNode = nodes.get(line.dataset.sourceId);
      const targetNode = nodes.get(line.dataset.targetId);
      if (!sourceNode || !targetNode) continue;

      const geometry = calculateConnectionGeometry(
        sourceNode.getBoundingClientRect(),
        targetNode.getBoundingClientRect(),
        svgRect,
        viewBox,
      );
      if (!geometry) continue;

      line.setAttribute("x1", geometry.x1.toFixed(2));
      line.setAttribute("y1", geometry.y1.toFixed(2));
      line.setAttribute("x2", geometry.x2.toFixed(2));
      line.setAttribute("y2", geometry.y2.toFixed(2));

      const barrier = svg.querySelector(
        `.barrier-marker[data-connection-id="${line.dataset.connectionId}"]`,
      );
      barrier?.setAttribute(
        "transform",
        `translate(${geometry.barrierX.toFixed(2)} ${geometry.barrierY.toFixed(2)})`,
      );
    }

    svg.dataset.geometryReady = "true";
  }

  async _onClose(options) {
    if (this.connectionGeometryFrame !== null) {
      cancelAnimationFrame(this.connectionGeometryFrame);
      this.connectionGeometryFrame = null;
    }
    this.connectionResizeObserver?.disconnect();
    this.connectionResizeObserver = null;
    this.connectionEventController?.abort();
    this.connectionEventController = null;
    networkConsoleApp = null;
    return super._onClose(options);
  }

  static async createNetwork() {
    if (!game.user.isGM) return;
    const data = await waitForFormDialog({
      title: "Create Network",
      saveLabel: "Create Network",
      content: `
        <div class="form-group">
          <label>Network Name</label>
          <input type="text" name="name" value="New Network" required autofocus>
        </div>
      `,
    });
    if (!data?.name) return;

    const folder = await ensureNetworkFolder();
    const network = createNetworkData(String(data.name).trim());
    const journal = await JournalEntry.create({
      name: `[Network] ${network.name}`,
      folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      flags: {
        [MODULE_ID]: {
          [NETWORK_FLAG]: network,
        },
      },
    });

    await game.settings.set(MODULE_ID, "activeNetworkId", journal.id);
    await publishNetworkProjection(journal, network);
    this.selectedNodeId = null;
    this.render();
  }

  static async deleteNetwork() {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    if (!journal) return;
    const confirmed = await confirmAction(
      "Delete Network",
      `Delete ${foundry.utils.escapeHTML(getNetworkData(journal)?.name ?? journal.name)}? This cannot be undone.`,
    );
    if (!confirmed) return;

    await journal.delete();
    const next = listNetworkDocuments()[0] ?? null;
    await game.settings.set(MODULE_ID, "activeNetworkId", next?.id ?? "");
    await publishNetworkProjection(next);
    this.selectedNodeId = null;
    this.render();
  }

  static async saveNetwork(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const form = target.closest("form");
    if (!journal || !network || !form) return;

    const data = Object.fromEntries(new FormData(form).entries());
    network.name = String(data.name || network.name).trim();
    network.idiom = String(data.idiom || "").trim();
    network.securityDifficulty = Math.max(1, Number(data.securityDifficulty) || 8);
    network.serverClass = SERVER_LIMITS[data.serverClass] ? data.serverClass : "Alpha";
    network.alertProgress = Math.min(2, Math.max(0, Number(data.alertProgress) || 0));

    await saveNetwork(journal, network);
    ui.notifications.info("Network details saved.");
    this.render();
  }

  static async addNode() {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    if (!journal || !network) return;

    const connectedOptions = [
      '<option value="">No initial connection</option>',
      nodeOptionMarkup(network.nodes),
    ].join("");
    const data = await waitForFormDialog({
      title: "Add Network Node",
      saveLabel: "Add Node",
      content: nodeDialogContent({}, connectedOptions),
    });
    if (!data?.name) return;

    const arrangements = autoArrangePositions(
      [...network.nodes, { id: "new-node", type: data.type }],
      network.connections,
      {
        ...DEFAULT_CANVAS,
        width: Math.max(DEFAULT_CANVAS.width, 240 + network.nodes.length * 80),
        height: Math.max(DEFAULT_CANVAS.height, 180 + network.nodes.length * 70),
      },
    );
    const node = createNode({
      id: foundry.utils.randomID(),
      name: String(data.name).trim(),
      type: NODE_TYPES[data.type] ? data.type : "custom",
      position: arrangements["new-node"],
    });
    node.state = NODE_STATES[data.state] ? data.state : "normal";
    node.revealed = data.revealed === "on";
    node.description = String(data.description || "").trim();
    node.gmNotes = String(data.gmNotes || "").trim();
    network.nodes.push(node);

    if (data.connectedTo && findNode(network, data.connectedTo)) {
      network.connections.push({
        id: foundry.utils.randomID(),
        source: data.connectedTo,
        target: node.id,
        revealed: node.revealed,
        barrier: false,
        barrierLocked: false,
        oneWay: false,
        gmNotes: "",
      });
    }

    await saveNetwork(journal, network);
    this.selectedNodeId = node.id;
    this.render();
  }

  static async editNode(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;

    const data = await waitForFormDialog({
      title: `Edit ${node.name}`,
      content: nodeDialogContent(node, ""),
    });
    if (!data?.name) return;

    node.name = String(data.name).trim();
    node.type = NODE_TYPES[data.type] ? data.type : "custom";
    node.state = NODE_STATES[data.state] ? data.state : "normal";
    node.revealed = data.revealed === "on";
    node.description = String(data.description || "").trim();
    node.gmNotes = String(data.gmNotes || "").trim();
    await saveNetwork(journal, network);
    this.render();
  }

  static async saveNodeInspector(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const form = target.closest("form");
    const node = findNode(network, form?.dataset.nodeId);
    if (!journal || !network || !form || !node) return;
    const data = Object.fromEntries(new FormData(form).entries());
    node.name = String(data.name || node.name).trim();
    node.type = NODE_TYPES[data.type] ? data.type : "custom";
    node.state = NODE_STATES[data.state] ? data.state : "normal";
    node.revealed = data.revealed === "on";
    await saveNetwork(journal, network);
    ui.notifications.info(`${node.name} saved.`);
    this.render();
  }

  static async editNodeDetails(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;
    const escaped = (value) => foundry.utils.escapeHTML(String(value ?? ""));
    const sourceNode = findNode(network, sourceId);
    const defaultTarget = candidates[0];
    const data = await waitForFormDialog({
      title: `${node.name}: Details and Notes`,
      content: `
        <div class="form-group stacked"><label>Player Description</label><textarea name="description" rows="4">${escaped(node.description)}</textarea></div>
        <div class="form-group stacked"><label>Private GM Notes</label><textarea name="gmNotes" rows="5">${escaped(node.gmNotes)}</textarea></div>
      `,
    });
    if (!data) return;
    node.description = String(data.description || "").trim();
    node.gmNotes = String(data.gmNotes || "").trim();
    await saveNetwork(journal, network);
    this.render();
  }

  static async duplicateNode(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    if (!journal || !network) return;
    const result = duplicateNode(
      network,
      target.dataset.nodeId,
      foundry.utils.randomID(),
      {
        ...DEFAULT_CANVAS,
        width: Math.max(DEFAULT_CANVAS.width, ...network.nodes.map((node) => node.position.x + 260)),
        height: Math.max(DEFAULT_CANVAS.height, ...network.nodes.map((node) => node.position.y + 210)),
      },
    );
    if (!result.node) return;
    await saveNetwork(journal, result.network);
    this.selectedNodeId = result.node.id;
    this.selectedConnectionId = null;
    ui.notifications.info(`Duplicated ${result.node.name}.`);
    this.render();
  }

  static async autoArrange() {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    if (!journal || !network) return;
    const positions = autoArrangePositions(network.nodes, network.connections, {
      ...DEFAULT_CANVAS,
      width: Math.max(DEFAULT_CANVAS.width, 300 + network.nodes.length * 100),
      height: Math.max(DEFAULT_CANVAS.height, 220 + network.nodes.length * 90),
    });
    for (const node of network.nodes) node.position = positions[node.id];
    await saveNetwork(journal, network);
    ui.notifications.info("Network nodes arranged.");
    this.render();
  }

  static async deleteNode(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;

    const confirmed = await confirmAction(
      "Delete Node",
      `Delete ${foundry.utils.escapeHTML(node.name)} and all its connections?`,
    );
    if (!confirmed) return;

    const updated = deleteNodeAndConnections(network, node.id);
    await saveNetwork(journal, updated);
    this.selectedNodeId = updated.nodes[0]?.id ?? null;
    this.selectedConnectionId = null;
    this.render();
  }

  static async toggleNodeReveal(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;
    node.revealed = !node.revealed;
    await saveNetwork(journal, network);
    this.render();
  }

  static selectNode(_event, target) {
    this.selectedNodeId = target.dataset.nodeId;
    this.selectedConnectionId = null;
    this.render();
  }

  static async addConnection() {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    if (!journal || !network || network.nodes.length < 2) {
      ui.notifications.warn("Add at least two nodes before connecting them.");
      return;
    }

    const data = await waitForFormDialog({
      title: "Add Connection",
      saveLabel: "Add Connection",
      content: connectionDialogContent(network),
    });
    if (!data?.source || !data?.target || data.source === data.target) return;
    if (connectionExists(network.connections, data.source, data.target)) {
      ui.notifications.warn("Those nodes are already connected.");
      return;
    }

    const sourceNode = findNode(network, data.source);
    const targetNode = findNode(network, data.target);
    const barrierState = ["unlocked", "locked"].includes(data.barrierState) ? data.barrierState : "none";
    const connection = {
      id: foundry.utils.randomID(),
      source: data.source,
      target: data.target,
      revealed: Boolean(sourceNode?.revealed && targetNode?.revealed && data.revealed === "on"),
      barrier: barrierState !== "none",
      barrierLocked: barrierState === "locked",
      oneWay: data.oneWay === "on",
      gmNotes: String(data.gmNotes || "").trim(),
    };
    network.connections.push(connection);
    await saveNetwork(journal, network);
    this.selectedConnectionId = connection.id;
    this.selectedNodeId = null;
    this.render();
  }

  static async connectSelectedNode(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const sourceId = target.dataset.nodeId;
    if (!journal || !network || !findNode(network, sourceId)) return;
    const candidates = network.nodes.filter((node) => node.id !== sourceId);
    if (!candidates.length) {
      ui.notifications.warn("Add another node before creating a connection.");
      return;
    }
    const data = await waitForFormDialog({
      title: "Connect Selected Node",
      saveLabel: "Connect",
      content: `
        <div class="form-group">
          <label>Target Node</label>
          <select name="target">${nodeOptionMarkup(candidates)}</select>
        </div>
        <div class="form-group">
          <label>Revealed to Players</label>
          <input type="checkbox" name="revealed"${sourceNode?.revealed && defaultTarget?.revealed ? " checked" : ""}>
        </div>
      `,
    });
    if (!data?.target) return;
    if (connectionExists(network.connections, sourceId, data.target)) {
      ui.notifications.warn("Those nodes are already connected.");
      return;
    }
    const targetNode = findNode(network, data.target);
    const connection = {
      id: foundry.utils.randomID(),
      source: sourceId,
      target: data.target,
      revealed: Boolean(sourceNode?.revealed && targetNode?.revealed && data.revealed === "on"),
      barrier: false,
      barrierLocked: false,
      oneWay: false,
      gmNotes: "",
    };
    network.connections.push(connection);
    await saveNetwork(journal, network);
    this.selectedConnectionId = connection.id;
    this.selectedNodeId = null;
    this.render();
  }

  static async editConnection(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const connection = network?.connections.find(
      (candidate) => candidate.id === target.dataset.connectionId,
    );
    if (!journal || !network || !connection) return;

    const data = await waitForFormDialog({
      title: "Edit Connection",
      content: connectionDialogContent(network, connection),
    });
    if (!data?.source || !data?.target || data.source === data.target) return;
    if (connectionExists(network.connections, data.source, data.target, connection.id)) {
      ui.notifications.warn("Those nodes are already connected.");
      return;
    }

    const sourceNode = findNode(network, data.source);
    const targetNode = findNode(network, data.target);
    const barrierState = ["unlocked", "locked"].includes(data.barrierState) ? data.barrierState : "none";
    connection.source = data.source;
    connection.target = data.target;
    connection.revealed = Boolean(sourceNode?.revealed && targetNode?.revealed && data.revealed === "on");
    connection.barrier = barrierState !== "none";
    connection.barrierLocked = barrierState === "locked";
    connection.oneWay = data.oneWay === "on";
    connection.gmNotes = String(data.gmNotes || "").trim();
    await saveNetwork(journal, network);
    this.render();
  }

  static selectConnection(_event, target) {
    this.selectedConnectionId = target.dataset.connectionId;
    this.selectedNodeId = null;
    this.render();
  }

  static async saveConnectionInspector(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const form = target.closest("form");
    const connection = network?.connections.find(
      (candidate) => candidate.id === form?.dataset.connectionId,
    );
    if (!journal || !network || !form || !connection) return;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.source || !data.target || data.source === data.target) {
      ui.notifications.warn("A connection needs two different nodes.");
      return;
    }
    if (connectionExists(network.connections, data.source, data.target, connection.id)) {
      ui.notifications.warn("Those nodes are already connected.");
      return;
    }
    const sourceNode = findNode(network, data.source);
    const targetNode = findNode(network, data.target);
    const barrierState = ["unlocked", "locked"].includes(data.barrierState) ? data.barrierState : "none";
    connection.source = data.source;
    connection.target = data.target;
    connection.revealed = Boolean(sourceNode?.revealed && targetNode?.revealed && data.revealed === "on");
    connection.oneWay = data.oneWay === "on";
    connection.barrier = barrierState !== "none";
    connection.barrierLocked = barrierState === "locked";
    connection.gmNotes = String(data.gmNotes || "").trim();
    await saveNetwork(journal, network);
    ui.notifications.info("Connection saved.");
    this.render();
  }

  static async deleteConnection(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const connection = network?.connections.find(
      (candidate) => candidate.id === target.dataset.connectionId,
    );
    if (!journal || !network || !connection) return;

    const confirmed = await confirmAction(
      "Delete Connection",
      `Delete ${foundry.utils.escapeHTML(connectionLabel(connection, network))}?`,
    );
    if (!confirmed) return;
    network.connections = network.connections.filter(
      (candidate) => candidate.id !== connection.id,
    );
    await saveNetwork(journal, network);
    this.selectedConnectionId = null;
    this.selectedNodeId = network.nodes[0]?.id ?? null;
    this.render();
  }

  static async toggleConnectionReveal(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const connection = network?.connections.find(
      (candidate) => candidate.id === target.dataset.connectionId,
    );
    if (!journal || !network || !connection) return;
    connection.revealed = !connection.revealed;
    await saveNetwork(journal, network);
    this.render();
  }

  static async addDatafile(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;
    const data = await waitForFormDialog({
      title: "Add Datafile",
      saveLabel: "Add Datafile",
      content: datafileDialogContent(),
    });
    if (!data?.name) return;
    node.datafiles.push(datafileFromForm(data, foundry.utils.randomID()));
    await saveNetwork(journal, network);
    this.render();
  }

  static async editDatafile(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const index = node?.datafiles.findIndex((entry) => entry.id === target.dataset.datafileId);
    if (!journal || !network || !node || index < 0) return;
    const data = await waitForFormDialog({
      title: `Edit ${node.datafiles[index].name}`,
      content: datafileDialogContent(node.datafiles[index]),
    });
    if (!data?.name) return;
    node.datafiles[index] = datafileFromForm(data, node.datafiles[index].id);
    await saveNetwork(journal, network);
    this.render();
  }

  static async deleteDatafile(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const datafile = node?.datafiles.find((entry) => entry.id === target.dataset.datafileId);
    if (!journal || !network || !node || !datafile) return;
    if (!await confirmAction("Delete Datafile", `Delete ${foundry.utils.escapeHTML(datafile.name)}?`)) return;
    node.datafiles = node.datafiles.filter((entry) => entry.id !== datafile.id);
    await saveNetwork(journal, network);
    this.render();
  }

  static async toggleDatafileReveal(_event, target) {
    await toggleNodeEntry(this, target, "datafiles", "datafileId");
  }

  static async addDemon(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const nodeId = target.dataset.nodeId;
    const network = getNetworkData(journal);
    const node = findNode(network, nodeId);
    if (!journal || !network || !node) return;
    const journalId = journal.id;
    await waitForFormDialog({
      title: "Add Demon",
      saveLabel: "Add Demon",
      content: demonDialogContent(),
      render: initializeDemonDialog,
      dialogClass: "cwnce-demon-dialog",
      failureMessage: "The Demon could not be saved. The dialog remains open.",
      onSubmit: async (data) => {
        if (!data?.classKey) {
          ui.notifications.warn("Select a Demon class.");
          return false;
        }
        const demon = demonFromForm(data, foundry.utils.randomID());
        if (!demon) return false;
        const canonicalJournal = game.journal.get(journalId);
        if (!canonicalJournal) throw new Error(`Network Journal ${journalId} is no longer available.`);
        await persistDemonToNode({
          loadNetwork: () => getNetworkData(canonicalJournal),
          saveNetwork: (updatedNetwork) => saveNetwork(canonicalJournal, updatedNetwork),
          nodeId,
          demon,
        });
        this.selectedNodeId = nodeId;
        this.selectedConnectionId = null;
        this.render();
        return true;
      },
    });
  }

  static async editDemon(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const journalId = journal?.id;
    const nodeId = target.dataset.nodeId;
    const demonId = target.dataset.demonId;
    const network = getNetworkData(journal);
    const node = findNode(network, nodeId);
    const index = node?.demons.findIndex((entry) => entry.id === demonId);
    if (!journal || !network || !node || index < 0) return;
    const original = node.demons[index];
    await waitForFormDialog({
      title: `Edit ${node.demons[index].name}`,
      content: demonDialogContent(node.demons[index], node.id),
      render: initializeDemonDialog,
      dialogClass: "cwnce-demon-dialog",
      failureMessage: "The Demon changes could not be saved. The dialog remains open.",
      onSubmit: async (data) => {
        if (!data?.classKey) {
          ui.notifications.warn("Select a Demon class.");
          return false;
        }
        const demon = demonFromForm(data, demonId, original);
        if (!demon) return false;
        const canonicalJournal = game.journal.get(journalId);
        if (!canonicalJournal) throw new Error(`Network Journal ${journalId} is no longer available.`);
        const canonicalNetwork = getNetworkData(canonicalJournal);
        const result = replaceDemonOnNode(canonicalNetwork, nodeId, demonId, demon);
        if (!result.replaced) throw new Error(`Could not edit Demon: ${result.reason}.`);
        await saveNetwork(canonicalJournal, result.network);
        this.selectedNodeId = nodeId;
        this.selectedConnectionId = null;
        this.render();
        return true;
      },
    });
  }

  static async duplicateDemon(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const original = node?.demons.find((entry) => entry.id === target.dataset.demonId);
    if (!journal || !network || !node || !original) return;
    const copy = foundry.utils.deepClone(original);
    copy.id = foundry.utils.randomID();
    copy.name = `${original.name} Copy`;
    for (const collection of [
      "profileCommandLines",
      "additionalCommandLines",
      "customCommandLines",
    ]) {
      copy[collection] = (copy[collection] ?? []).map((command) => ({
        ...command,
        id: foundry.utils.randomID(),
      }));
    }
    node.demons.push(copy);
    await saveNetwork(journal, network);
    this.render();
  }

  static async deleteDemon(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const demon = node?.demons.find((entry) => entry.id === target.dataset.demonId);
    if (!journal || !network || !node || !demon) return;
    if (!await confirmAction("Delete Demon", `Delete ${foundry.utils.escapeHTML(demon.name)}?`)) return;
    node.demons = node.demons.filter((entry) => entry.id !== demon.id);
    await saveNetwork(journal, network);
    this.render();
  }

  static async toggleDemonReveal(_event, target) {
    await toggleNodeEntry(this, target, "demons", "demonId");
  }

  static toggleDemonExpanded(_event, target) {
    const id = target.dataset.demonId;
    if (!id) return;
    if (this.expandedDemonIds.has(id)) this.expandedDemonIds.delete(id);
    else this.expandedDemonIds.add(id);
    this.render();
  }

  static async adjustDemonHp(_event, target) {
    await updateStoredDemonHp(
      this,
      target.dataset.nodeId,
      target.dataset.demonId,
      (demon) => setDemonHp(demon, demon.currentHp + Number(target.dataset.delta || 0)),
    );
  }

  static async setDemonHp(_event, target) {
    const input = target.closest(".cwnce-demon-expanded")?.querySelector("[data-demon-hp]");
    await updateStoredDemonHp(
      this,
      target.dataset.nodeId,
      target.dataset.demonId,
      (demon) => setDemonHp(demon, input?.value),
    );
  }

  static async setDemonState(_event, target) {
    const state = target.value;
    await updateStoredDemonHp(
      this,
      target.dataset.nodeId,
      target.dataset.demonId,
      (demon) => state === "fragged"
        ? setDemonHp(demon, 0)
        : setDemonHp(demon, Math.max(1, demon.currentHp)),
    );
  }

  static async applyDemonDamage(_event, target) {
    const nodeId = target.dataset.nodeId;
    const demonId = target.dataset.demonId;
    const found = getStoredDemon(nodeId, demonId);
    if (!found) return;
    const data = await waitForFormDialog({
      title: `Apply Damage to ${found.demon.name}`,
      saveLabel: "Apply Damage",
      content: '<div class="form-group"><label>Damage</label><input type="number" min="0" step="1" name="damage" value="1" required autofocus></div>',
    });
    const damage = Number(data?.damage);
    if (!Number.isInteger(damage) || damage < 0) return;
    if (!await confirmAction("Confirm Demon Damage", `Apply ${damage} damage to ${foundry.utils.escapeHTML(found.demon.name)}?`)) return;
    await updateStoredDemonHp(this, nodeId, demonId, (demon) => applyDemonDamage(demon, damage));
    await postDemonDamageResult(found.demon.name, damage);
  }

  static async restoreDemon(_event, target) {
    await updateStoredDemonHp(
      this,
      target.dataset.nodeId,
      target.dataset.demonId,
      (demon) => setDemonHp(demon, demon.maxHp),
    );
  }

  static async executeDemonAction(_event, target) {
    await executeStoredDemonAction(
      this,
      target.dataset.nodeId,
      target.dataset.demonId,
      target.dataset.actionKey,
    );
  }

  static async addWatchdog(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    if (!journal || !network || !node) return;
    const data = await waitForFormDialog({
      title: "Add Watchdog",
      saveLabel: "Add Watchdog",
      content: watchdogDialogContent(),
    });
    if (!data?.name) return;
    node.watchdogs.push(watchdogFromForm(data, foundry.utils.randomID()));
    await saveNetwork(journal, network);
    this.render();
  }

  static async editWatchdog(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const index = node?.watchdogs.findIndex((entry) => entry.id === target.dataset.watchdogId);
    if (!journal || !network || !node || index < 0) return;
    const data = await waitForFormDialog({
      title: `Edit ${node.watchdogs[index].name}`,
      content: watchdogDialogContent(node.watchdogs[index]),
    });
    if (!data?.name) return;
    node.watchdogs[index] = watchdogFromForm(data, node.watchdogs[index].id);
    await saveNetwork(journal, network);
    this.render();
  }

  static async deleteWatchdog(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const node = findNode(network, target.dataset.nodeId);
    const watchdog = node?.watchdogs.find((entry) => entry.id === target.dataset.watchdogId);
    if (!journal || !network || !node || !watchdog) return;
    if (!await confirmAction("Delete Watchdog", `Delete ${foundry.utils.escapeHTML(watchdog.name)}?`)) return;
    node.watchdogs = node.watchdogs.filter((entry) => entry.id !== watchdog.id);
    await saveNetwork(journal, network);
    this.render();
  }

  static async toggleWatchdogReveal(_event, target) {
    await toggleNodeEntry(this, target, "watchdogs", "watchdogId");
  }

  static async endSession(_event, target) {
    if (!game.user.isGM) return;
    const journal = getActiveNetworkDocument();
    const network = getNetworkData(journal);
    const session = network?.sessions.find((entry) => entry.id === target.dataset.sessionId);
    if (!journal || !network || !session) return;
    if (!await confirmAction("End Hacker Session", `Force ${foundry.utils.escapeHTML(session.hackerName)} to Jack Out?`)) return;
    const result = endHackerSession(network, session.id);
    if (!result.ended) return;
    await saveNetwork(journal, result.network);
    const message = `The GM ended ${session.hackerName}'s Network Console session.`;
    addNetworkNotice(message, "success", "Jack Out");
    sendNetworkRequestResult({ userId: session.userId, actionId: "jackOut" }, "success", message);
    this.render();
  }

  static async requestAction(_event, target) {
    if (game.user.isGM) return;
    const projection = readPublishedProjection();
    const network = projection?.network;
    if (!network || !userCanViewProjection(network)) return;

    const action = PLAYER_ACTIONS.find((candidate) => candidate.id === target.dataset.requestId);
    let node = findNode(network, this.selectedNodeId);
    if (!action) return;

    const ownSessions = playerSessionProjection?.networkId === network.id
      ? playerSessionProjection.sessions
      : [];
    const currentSession = ownSessions[0] ?? null;

    if (action.id === "jackIn") {
      const selected = await chooseHackerAndCyberdeck();
      if (!selected || !node) return;
      const connection = await waitForFormDialog({
        title: "Request: Jack In",
        saveLabel: "Send Request",
        content: `<p>Entry node: <strong>${foundry.utils.escapeHTML(node.name)}</strong></p><div class="form-group"><label>Connection</label><select name="connectionType"><option value="physical">Physical</option><option value="wireless">Wireless (RAW −2; cannot Move Nodes)</option></select></div>`,
      });
      if (!connection?.connectionType) return;
      game.socket.emit(SOCKET_NAME, {
        type: "sessionRequest", actionId: "jackIn", userId: game.user.id,
        networkId: network.id, nodeId: node.id,
        hackerUuid: selected.hacker.uuid, cyberdeckUuid: selected.cyberdeck.uuid,
        connectionType: connection.connectionType,
      });
      addNetworkNotice("Jack In request sent to the GM.", "info", "Jack In");
      return;
    }

    if (action.id === "moveNodes") {
      if (!currentSession) {
        addNetworkNotice("Jack In before requesting movement.", "warning", "Move Nodes");
        return;
      }
      if (currentSession.connectionType === "wireless") {
        addNetworkNotice("Wireless hacker sessions cannot Move Nodes.", "warning", "Move Nodes");
        return;
      }
      if (!node || node.id === currentSession.currentNodeId) {
        addNetworkNotice("Select a directly connected destination node first.", "warning", "Move Nodes");
        return;
      }
      game.socket.emit(SOCKET_NAME, {
        type: "sessionRequest", actionId: "moveNodes", userId: game.user.id,
        networkId: network.id, sessionId: currentSession.id,
        destinationNodeId: node.id,
      });
      addNetworkNotice("Move Nodes request sent to the GM.", "info", "Move Nodes");
      return;
    }

    if (action.id === "jackOut") {
      if (!currentSession) {
        addNetworkNotice("No active hacker session is available.", "warning", "Jack Out");
        return;
      }
      game.socket.emit(SOCKET_NAME, {
        type: "sessionRequest", actionId: "jackOut", userId: game.user.id,
        networkId: network.id, sessionId: currentSession.id,
      });
      addNetworkNotice("Jack Out request sent to the GM.", "info", "Jack Out");
      return;
    }

    let detail = "";
    let program = null;
    if (action.id === "runProgram") {
      if (!currentSession) {
        addNetworkNotice("Jack In before running a program.", "warning", "Run Program");
        return;
      }
      const currentNode = findNode(network, currentSession.currentNodeId);
      if (!currentNode) {
        addNetworkNotice("Your current network node is no longer available.", "error", "Run Program");
        return;
      }
      const selection = await choosePreparedProgram({
        hackerUuid: currentSession.hackerUuid,
        cyberdeckUuid: currentSession.cyberdeckUuid,
      });
      if (!selection) return;
      detail =
        `${selection.hacker.name} using ${selection.cyberdeck.name}: ` +
        `${selection.verb.name} ${selection.subject.name} ` +
        `(Access ${selection.accessCost}, check modifier ${selection.skillCheckMod >= 0 ? "+" : ""}${selection.skillCheckMod})`;
      program = {
        hackerUuid: selection.hacker.uuid,
        cyberdeckUuid: selection.cyberdeck.uuid,
        verbId: selection.verb.id,
        subjectId: selection.subject.id,
        sessionId: currentSession.id,
      };
      node = currentNode;
    }

    let datafileId = "";
    if (action.id === "copyFile") {
      if (!currentSession) {
        addNetworkNotice("Jack In before copying a datafile.", "warning", "Copy File");
        return;
      }
      const currentNode = findNode(network, currentSession.currentNodeId);
      const available = currentNode?.datafiles.filter((entry) => entry.revealed && !entry.copied) ?? [];
      if (!available.length) {
        addNetworkNotice("No uncopied datafile is available on your current node.", "warning", "Copy File");
        return;
      }
      let selected = available[0];
      if (available.length > 1) {
        const data = await waitForFormDialog({
          title: "Request: Copy File",
          saveLabel: "Send Request",
          content: `<div class="form-group"><label>Datafile</label><select name="datafileId">${available.map((entry) => `<option value="${foundry.utils.escapeHTML(entry.id)}">${foundry.utils.escapeHTML(entry.name)}</option>`).join("")}</select></div>`,
        });
        if (!data?.datafileId) return;
        selected = available.find((entry) => entry.id === data.datafileId);
      }
      if (!selected) return;
      datafileId = selected.id;
      detail = selected.name;
      node = currentNode;
    }

    const requestId = foundry.utils.randomID();
    game.socket.emit(SOCKET_NAME, {
      type: "actionRequest",
      requestId,
      requestedAt: Date.now(),
      userId: game.user.id,
      networkId: network.id,
      networkName: network.name,
      nodeId: node?.id ?? "",
      nodeName: node?.name ?? "",
      actionId: action.id,
      actionLabel: `${action.label} (${action.economy})`,
      detail,
      program,
      datafileId,
    });
    addNetworkNotice(
      action.id === "runProgram" ? "Run Program request sent to the GM." : `Request sent: ${action.label}`,
      "info",
      action.label,
    );
  }
}

function getStoredDemon(nodeId, demonId) {
  if (!game.user.isGM) return null;
  const journal = getActiveNetworkDocument();
  const network = getNetworkData(journal);
  const node = findNode(network, nodeId);
  const demon = node?.demons.find((entry) => entry.id === demonId);
  return journal && network && node && demon ? { journal, network, node, demon } : null;
}

async function updateStoredDemonHp(app, nodeId, demonId, updater) {
  const found = getStoredDemon(nodeId, demonId);
  if (!found) return;
  const index = found.node.demons.findIndex((entry) => entry.id === demonId);
  found.node.demons[index] = updater(found.demon);
  await saveNetwork(found.journal, found.network);
  app.render();
}

async function chooseDemonActionTarget(actionKey, network, node) {
  const action = DEMON_ACTIONS[actionKey];
  if (!actionRequiresTarget(actionKey)) return null;
  let targets = [];
  if (action.targetType === "hacker") {
    const seen = new Set();
    targets = getPreparedCyberdecks()
      .filter(({ hacker }) => !seen.has(hacker.id) && seen.add(hacker.id))
      .map(({ hacker }) => ({ id: hacker.id, name: hacker.name, type: "hacker" }));
  } else if (action.targetType === "node") {
    targets = [{ id: node.id, name: node.name, type: "node" }];
  } else if (action.targetType === "device") {
    targets = network.nodes
      .filter((candidate) => candidate.id === node.id && candidate.state === "deactivated")
      .map((candidate) => ({ id: candidate.id, name: candidate.name, type: "device" }));
  } else if (action.targetType === "barrier") {
    targets = network.connections
      .filter((connection) =>
        connection.barrier &&
        !connection.barrierLocked &&
        (connection.source === node.id || connection.target === node.id))
      .map((connection) => ({
        id: connection.id,
        name: connectionLabel(connection, network),
        type: "barrier",
      }));
  } else if (action.targetType === "destination") {
    targets = validDemonDestinations(network, node.id)
      .map((destination) => ({
        ...destination,
        type: "destination",
        name: `${destination.name}${destination.barrierLocked ? " — LOCKED BARRIER" : destination.barrier ? " — barrier" : ""}`,
      }));
  }
  if (!targets.length) {
    ui.notifications.warn(`No valid ${action.targetType} target is currently available.`);
    return false;
  }
  const options = targets
    .map((target) =>
      `<option value="${foundry.utils.escapeHTML(target.id)}">${foundry.utils.escapeHTML(target.name)}</option>`)
    .join("");
  const data = await waitForFormDialog({
    title: `${action.label}: Choose Target`,
    saveLabel: "Choose Target",
    content: `<div class="form-group"><label>Target</label><select name="targetId" required autofocus>${options}</select></div>`,
  });
  if (!data?.targetId) return false;
  return targets.find((target) => target.id === data.targetId) ?? false;
}

async function executeStoredDemonAction(app, nodeId, demonId, actionKey) {
  const found = getStoredDemon(nodeId, demonId);
  if (!found) return;
  const permission = canExecuteDemonAction(found.demon, actionKey, game.user.isGM);
  if (!permission.allowed) {
    ui.notifications.warn(permission.reason === "fragged"
      ? "A Fragged Demon cannot execute actions."
      : "That Demon action is not available.");
    return;
  }
  const action = DEMON_ACTIONS[actionKey];
  const target = await chooseDemonActionTarget(actionKey, found.network, found.node);
  if (target === false || !validateActionTarget(actionKey, target)) {
    if (action.targetType !== "none") return;
  }
  let storedChanged = false;
  if (action.resolution === "no-roll" || action.resolution === "manual") {
    const confirmed = await confirmAction(
      action.label,
      `${foundry.utils.escapeHTML(action.guidance)}${target?.blocked ? "<br><strong>This route is blocked by a locked barrier.</strong>" : ""}`,
    );
    if (!confirmed) return;
  }
  if (actionKey === "alert-network") {
    found.network.alertProgress = nextAlertProgress(found.network.alertProgress);
    storedChanged = true;
  } else if (actionKey === "reboot-device" && target) {
    const device = findNode(found.network, target.id);
    if (!device || device.state !== "deactivated") return;
    device.state = "normal";
    storedChanged = true;
  } else if (actionKey === "move" && target) {
    const freshDestination = validDemonDestinations(found.network, found.node.id)
      .find((destination) => destination.id === target.id);
    if (!freshDestination || freshDestination.blocked) {
      ui.notifications.warn("The Demon cannot silently traverse that route.");
      return;
    }
    const destination = findNode(found.network, freshDestination.id);
    found.node.demons = found.node.demons.filter((entry) => entry.id !== found.demon.id);
    destination.demons.push(found.demon);
    app.selectedNodeId = destination.id;
    storedChanged = true;
  }
  let roll = null;
  let damageRoll = null;
  if (action.rollFormula) {
    roll = await new Roll(action.rollFormula.replace("@skillBonus", String(found.demon.skillBonus))).evaluate();
    if (action.damageFormula) {
      const dice = Math.max(1, found.demon.skillBonus);
      damageRoll = await new Roll(action.damageFormula.replace("max(1, @skillBonus)", String(dice))).evaluate();
    }
  }
  if (storedChanged) await saveNetwork(found.journal, found.network);
  await postDemonActionCard({
    network: found.network,
    node: found.node,
    demon: found.demon,
    actionKey,
    target,
    roll,
    damageRoll,
  });
  if (storedChanged) app.render();
}

async function postDemonActionCard({ network, node, demon, actionKey, target, roll, damageRoll }) {
  const safe = publicDemonChatContext({
    demon,
    networkName: network.name,
    nodeName: node.name,
    actionKey,
    targetName: target?.name ?? "",
  });
  const action = DEMON_ACTIONS[actionKey];
  const checkRollHtml = roll ? await roll.render() : "";
  const damageRollHtml = damageRoll ? await damageRoll.render() : "";
  const demonRollBreakdowns = demonActionRollBreakdowns(demon, action);
  const content = renderDemonActionChatCard({
    ...safe,
    checkTotal: roll?.total ?? "",
    checkFormula: roll?.formula ?? action.rollFormula ?? "",
    checkRollHtml,
    damageTotal: damageRoll?.total ?? "",
    damageFormula: damageRoll?.formula ?? action.damageFormula ?? "",
    damageRollHtml,
    automated: action.automated,
  });
  const data = {
    content,
    rolls: [roll, damageRoll].filter(Boolean),
    speaker: ChatMessage.getSpeaker({ alias: safe.demonName }),
    flags: {
      [MODULE_ID]: {
        demonRollBreakdowns,
      },
    },
  };
  if (!demon.revealed || !node.revealed) {
    data.whisper = ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
  }
  else applyChatMessageMode(data);
  await ChatMessage.create(data);
}

async function postDemonDamageResult(name, damage) {
  await ChatMessage.create({
    content: renderDemonDamageChatCard({
      title: "Demon Damage Applied",
      demonName: name,
      damage,
    }),
    whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
  });
}

async function createDemonDamageCard({ damage, networkId = "", nodeId = "", demonId = "", label = "Hacker program damage" } = {}) {
  return ChatMessage.create(buildDemonDamageMessageData({
    moduleId: MODULE_ID,
    damage,
    networkId,
    nodeId,
    demonId,
    label,
  }));
}

async function applyDamageFromChatMessage(message) {
  if (!game.user.isGM) return;
  const flag = message.getFlag(MODULE_ID, "demonDamage");
  if (!isTrustedDemonDamageFlag(flag, true, message.rolls?.[0]?.total ?? null)) return;
  const journals = listNetworkDocuments();
  const choices = [];
  for (const journal of journals) {
    const network = getNetworkData(journal);
    for (const node of network.nodes) {
      for (const demon of node.demons) {
        choices.push({
          journal,
          network,
          node,
          demon,
          value: `${journal.id}:${node.id}:${demon.id}`,
        });
      }
    }
  }
  if (!choices.length) {
    ui.notifications.warn("No Demon is available.");
    return;
  }
  const preferred = choices.find(({ network, node, demon }) =>
    network.id === flag.networkId && node.id === flag.nodeId && demon.id === flag.demonId);
  const options = choices.map((choice) =>
    `<option value="${choice.value}"${choice === preferred ? " selected" : ""}>${foundry.utils.escapeHTML(`${choice.network.name} — ${choice.node.name} — ${choice.demon.name}`)}</option>`,
  ).join("");
  const data = await waitForFormDialog({
    title: "Apply Hacker Damage to Demon",
    saveLabel: "Continue",
    content: `<p>Damage: <strong>${flag.damage}</strong></p><div class="form-group"><label>Demon</label><select name="target" required>${options}</select></div>`,
  });
  const selected = choices.find((choice) => choice.value === data?.target);
  if (!selected) return;
  if (!await confirmAction("Confirm Demon Damage", `Apply ${flag.damage} damage to ${foundry.utils.escapeHTML(selected.demon.name)}?`)) return;
  const index = selected.node.demons.findIndex((entry) => entry.id === selected.demon.id);
  selected.node.demons[index] = applyDemonDamage(selected.demon, flag.damage);
  await saveNetwork(selected.journal, selected.network);
  renderOpenNetworkConsole();
  await postDemonDamageResult(selected.demon.name, flag.damage);
}

async function toggleNodeEntry(app, target, collectionName, datasetKey) {
  if (!game.user.isGM) return;
  const journal = getActiveNetworkDocument();
  const network = getNetworkData(journal);
  const node = findNode(network, target.dataset.nodeId);
  const entry = node?.[collectionName]?.find(
    (candidate) => candidate.id === target.dataset[datasetKey],
  );
  if (!journal || !network || !node || !entry) return;
  entry.revealed = !entry.revealed;
  await saveNetwork(journal, network);
  app.render();
}

function datafileFromForm(data, id) {
  return {
    id,
    name: String(data.name || "Datafile").trim(),
    description: String(data.description || "").trim(),
    gmNotes: String(data.gmNotes || "").trim(),
    value: Math.max(0, Math.trunc(Number(data.value) || 0)),
    revealed: data.revealed === "on",
    copied: data.copied === "on",
  };
}

function datafileDialogContent(datafile = {}) {
  const escaped = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  return `
    <div class="form-group"><label>Name</label><input name="name" value="${escaped(datafile.name)}" required></div>
    <div class="form-group"><label>Value (credits)</label><input type="number" min="0" step="1" name="value" value="${Number(datafile.value) || 0}"></div>
    <div class="form-group"><label>Revealed / discovered</label><input type="checkbox" name="revealed"${datafile.revealed ? " checked" : ""}></div>
    <div class="form-group"><label>Copied</label><input type="checkbox" name="copied"${datafile.copied ? " checked" : ""}></div>
    <div class="form-group stacked"><label>Player-safe description</label><textarea name="description" rows="3">${escaped(datafile.description)}</textarea></div>
    <div class="form-group stacked"><label>Private GM notes</label><textarea name="gmNotes" rows="3">${escaped(datafile.gmNotes)}</textarea></div>
  `;
}

function demonFromForm(data, id, existing = null) {
  const classKey = String(data.classKey || "");
  const profile = String(data.programmingProfile || CUSTOM_PROGRAMMING_PROFILE);
  let demon;
  if (classKey === CUSTOM_DEMON_CLASS) {
    const maxHp = Number(data.maxHp);
    const currentHp = Number(data.currentHp);
    const skillBonus = Number(data.skillBonus);
    if (!Number.isInteger(maxHp) || maxHp < 1 ||
        !Number.isInteger(currentHp) || currentHp < 0 || currentHp > maxHp ||
        !Number.isInteger(skillBonus) || skillBonus < -20 || skillBonus > 20) {
      ui.notifications.warn("Custom Demon HP must be valid integers and Skill Bonus must be between -20 and +20.");
      return null;
    }
    demon = {
      id,
      classKey,
      name: String(data.name || "Custom Demon").trim(),
      currentHp,
      maxHp,
      skillBonus,
      lineLimit: existing?.classKey === CUSTOM_DEMON_CLASS
        ? Math.max(0, Number(existing.lineLimit) || 0)
        : 0,
      cost: 0,
      state: currentHp === 0 ? "fragged" : "active",
    };
  } else {
    demon = createDemonFromTemplate(classKey, id, profile);
    if (!demon) return null;
    if (existing?.classKey === classKey) {
      demon.currentHp = Math.min(demon.maxHp, Math.max(0, existing.currentHp));
      demon.state = demon.currentHp === 0 ? "fragged" : "active";
    }
    demon.name = String(data.name || classKey).trim();
  }
  if (!demon.name) {
    ui.notifications.warn("A Demon name is required.");
    return null;
  }
  demon.programmingProfile = profile;
  demon.profileCommandLines = profileCommands(profile, id);
  demon.additionalCommandLines = [];
  const selectedKeys = Array.isArray(data.additionalKeys)
    ? data.additionalKeys
    : (data.additionalKeys ? [data.additionalKeys] : []);
  for (const key of selectedKeys) {
    // Retain every submitted line in the candidate so final centralized
    // validation can reject over-capacity data without silently dropping it.
    const result = addCommonCommand(
      demon,
      key,
      foundry.utils.randomID(),
      { allowOverCapacity: true },
    );
    if (result.added) {
      demon = result.demon;
      const command = demon.additionalCommandLines.at(-1);
      const requestedPriority = Number(data[`priority.${key}`]);
      if (Number.isInteger(requestedPriority) && requestedPriority > 0) {
        command.priority = requestedPriority;
      }
    } else if (result.reason === "duplicate") {
      // A migrated Demon may contain an Additional line that is now also
      // supplied by its selected profile. Keep that checked legacy line in the
      // submitted candidate so the user can remove it explicitly; never
      // normalize it away as a side effect of opening and saving the dialog.
      const preserved = existing?.additionalCommandLines?.find(
        (command) => command.key === key,
      );
      if (preserved) {
        const command = foundry.utils.deepClone(preserved);
        const requestedPriority = Number(data[`priority.${key}`]);
        if (Number.isInteger(requestedPriority) && requestedPriority > 0) {
          command.priority = requestedPriority;
        }
        demon.additionalCommandLines.push(command);
      }
    }
  }
  demon.customCommandLines = String(data.customCommands || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: foundry.utils.randomID(),
      key: "",
      priority: demon.profileCommandLines.length + demon.additionalCommandLines.length + index + 1,
      text: line,
      actionKey: "",
      sourceType: "custom",
    }));
  demon.revealed = data.revealed === "on";
  demon.notes = String(data.notes || "").trim();
  const capacity = commandCapacityState(demon);
  if (capacity.exceeded) {
    const excess = capacity.count - capacity.limit;
    ui.notifications.warn(
      `${classKey} supports ${capacity.limit} command lines, but ${capacity.count} are configured. Remove ${excess} command line${excess === 1 ? "" : "s"} before saving.`,
    );
    return null;
  }
  return demon;
}

function demonDialogContent(demon = {}, nodeId = "") {
  const escaped = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const classKey = demon.classKey ?? "Tripwire";
  const profile = demon.programmingProfile ?? CUSTOM_PROGRAMMING_PROFILE;
  const classOptions = optionMarkup({
    ...Object.fromEntries(Object.keys(CWN_DEMON_TEMPLATES).map((name) => [name, name])),
    [CUSTOM_DEMON_CLASS]: "Custom Demon",
  }, classKey);
  const profileOptions = optionMarkup(
    Object.fromEntries(Object.keys(CWN_DEMON_PROGRAMMING_PROFILES)
      .map((name) => [name === "Custom Programming" ? CUSTOM_PROGRAMMING_PROFILE : name, name])),
    profile,
  );
  const selectedAdditional = new Set(
    (demon.additionalCommandLines ?? []).map((command) => command.key),
  );
  const additionalPriorities = new Map(
    (demon.additionalCommandLines ?? []).map((command) => [command.key, command.priority]),
  );
  const commonOptions = Object.entries(CWN_COMMON_COMMAND_LINES)
    .filter(([, command]) => !command.profileOnly)
    .map(([key, command]) => `
      <label class="cwnce-command-choice">
        <input type="checkbox" name="additionalKeys" value="${key}" data-common-command${selectedAdditional.has(key) ? " checked" : ""}>
        <span>${escaped(command.text)}</span>
        <input type="number" min="1" step="1" name="priority.${key}" value="${additionalPriorities.get(key) ?? ""}" placeholder="Priority" aria-label="Priority for ${escaped(command.text)}">
      </label>`)
    .join("");
  const customCommands = (demon.customCommandLines ?? []).map((command) => command.text).join("\n");
  return `
    <div class="cwnce-demon-form" data-demon-form data-node-id="${escaped(nodeId)}" data-demon-id="${escaped(demon.id)}" data-line-limit="${Math.max(0, Number(demon.lineLimit) || 0)}" data-saved-profile="${escaped(profile)}">
      <p class="hint">Standard class statistics are fixed to the CWN Demon table. Encounter HP is managed from the node inspector.</p>
      <div class="form-group"><label>Demon Class</label><select name="classKey" data-demon-class required>${classOptions}</select></div>
      <div class="form-group"><label>Name</label><input name="name" value="${escaped(demon.name)}" placeholder="Defaults to class name" required></div>
      <div class="form-group" data-standard-summary><label>Class Statistics</label><div class="form-fields"><span data-class-summary></span></div></div>
      <div data-custom-stats>
        <div class="form-group"><label>Current HP</label><input type="number" min="0" name="currentHp" value="${demon.currentHp ?? 1}"></div>
        <div class="form-group"><label>Maximum HP</label><input type="number" min="1" name="maxHp" value="${demon.maxHp ?? 1}"></div>
        <div class="form-group"><label>Skill Bonus</label><input type="number" min="-20" max="20" name="skillBonus" value="${demon.skillBonus ?? 0}"></div>
      </div>
      <div class="form-group"><label>Programming Profile</label><select name="programmingProfile" data-demon-profile>${profileOptions}</select></div>
      <p class="hint cwnce-profile-capacity-note" data-profile-capacity-note></p>
      <p class="hint cwnce-profile-change-message" data-profile-change-message hidden></p>
      <p class="cwnce-command-capacity" data-command-capacity aria-live="polite"></p>
      <section class="cwnce-dialog-command-list">
        <h3>Profile Command Lines</h3>
        <ol data-profile-preview></ol>
      </section>
      <details class="cwnce-dialog-additional-lines">
        <summary>Additional Common Command Lines</summary>
        ${commonOptions}
      </details>
      <div class="form-group stacked" data-custom-commands><label>Custom Programming Lines</label><textarea name="customCommands" rows="4" data-custom-command-text>${escaped(customCommands)}</textarea></div>
      <div class="form-group"><label>Revealed to Players</label><input type="checkbox" name="revealed"${demon.revealed ? " checked" : ""}></div>
      <div class="form-group stacked"><label>Private GM Notes</label><textarea name="notes" rows="3">${escaped(demon.notes)}</textarea></div>
    </div>
  `;
}

function initializeDemonDialog(...args) {
  const app = args.find((value) => value?.element?.querySelector);
  const root = app?.element ?? args.find((value) => value?.querySelector);
  const form = root?.querySelector?.("[data-demon-form]");
  if (!form) return;
  // DialogV2 normally derives its height from its content. Lock the rendered
  // dialog to its initial viewport-safe height so opening the optional command
  // list scrolls the dialog body instead of growing the window off-screen.
  if (app?.setPosition) {
    requestAnimationFrame(() => {
      const availableHeight = Math.max(360, window.innerHeight - 32);
      const renderedHeight = Math.ceil(root.getBoundingClientRect().height);
      const height = Math.min(Math.max(480, renderedHeight), availableHeight);
      app.setPosition({ height });
    });
  }
  const classSelect = form.querySelector("[data-demon-class]");
  const profileSelect = form.querySelector("[data-demon-profile]");
  const capacityNote = form.querySelector("[data-profile-capacity-note]");
  const changeMessage = form.querySelector("[data-profile-change-message]");
  const capacityIndicator = form.querySelector("[data-command-capacity]");
  const customCommandGroup = form.querySelector("[data-custom-commands]");
  const customCommandText = form.querySelector("[data-custom-command-text]");
  const commonCommandInputs = [...form.querySelectorAll("[data-common-command]")];
  const saveButton = root.querySelector('button[data-action="save"]');
  const storedCustomLimit = Math.max(0, Number(form.dataset.lineLimit) || 0);
  let previousClass = classSelect.value;

  const configuredLimit = (classKey) =>
    classKey === CUSTOM_DEMON_CLASS ? storedCustomLimit : 0;

  const setProfileOptions = ({ classChanged = false } = {}) => {
    const classKey = classSelect.value;
    const currentProfile = profileSelect.value
      || form.dataset.savedProfile
      || CUSTOM_PROGRAMMING_PROFILE;
    const lineLimit = configuredLimit(classKey);
    const selection = resolveProgrammingProfileSelection(
      classKey,
      currentProfile,
      lineLimit,
    );
    const allowedProfiles = new Set(
      compatibleProgrammingProfiles(classKey, lineLimit),
    );
    const preserveExistingInvalid = !classChanged && !selection.compatible;
    profileSelect.replaceChildren();
    for (const profileName of Object.keys(CWN_DEMON_PROGRAMMING_PROFILES)) {
      const value = programmingProfileValue(profileName);
      if (!allowedProfiles.has(value) && !(preserveExistingInvalid && value === currentProfile)) {
        continue;
      }
      const option = document.createElement("option");
      option.value = value;
      const count = profileCommandCount(value);
      option.textContent = value === CUSTOM_PROGRAMMING_PROFILE
        ? "Custom Programming"
        : `${profileName} (${count} command line${count === 1 ? "" : "s"})`;
      if (!allowedProfiles.has(value)) {
        const limit = demonClassCommandCapacity(classKey, lineLimit);
        option.textContent += ` — incompatible with ${limit}`;
        option.dataset.incompatible = "true";
      }
      profileSelect.append(option);
    }
    profileSelect.value = selection.profile;

    if (classChanged && selection.changed) {
      changeMessage.textContent =
        `${programmingProfileName(currentProfile)} requires ${profileCommandCount(currentProfile)} command lines and is incompatible with ${classKey}. Custom Programming was selected instead; existing Additional Common Command Lines were retained.`;
      changeMessage.hidden = false;
    } else if (preserveExistingInvalid) {
      const limit = demonClassCommandCapacity(classKey, lineLimit);
      changeMessage.textContent =
        `This saved Demon uses ${programmingProfileName(currentProfile)}, which requires ${profileCommandCount(currentProfile)} command lines but ${classKey} supports ${limit}. Existing data is preserved; select a compatible profile before saving.`;
      changeMessage.hidden = false;
      profileSelect.value = currentProfile;
    } else {
      changeMessage.textContent = "";
      changeMessage.hidden = true;
    }
  };

  const refresh = ({ classChanged = false, rebuildProfiles = false } = {}) => {
    const classKey = classSelect.value;
    const customClass = classKey === CUSTOM_DEMON_CLASS;
    form.querySelector("[data-standard-summary]").hidden = customClass;
    form.querySelector("[data-custom-stats]").hidden = !customClass;
    const template = CWN_DEMON_TEMPLATES[classKey];
    form.querySelector("[data-class-summary]").textContent = template
      ? `HP ${template.hp}/${template.hp} · Skill +${template.skill} · ${template.lines} command lines`
      : "Custom statistics";
    if (rebuildProfiles) setProfileOptions({ classChanged });
    const profile = profileSelect.value;
    const profileName = programmingProfileName(profile);
    const preview = form.querySelector("[data-profile-preview]");
    preview.replaceChildren();
    for (const key of CWN_DEMON_PROGRAMMING_PROFILES[profileName] ?? []) {
      const item = document.createElement("li");
      const command = CWN_COMMON_COMMAND_LINES[key];
      const text = document.createElement("span");
      text.textContent = command?.text ?? key;
      item.append(text);
      if (form.dataset.nodeId && form.dataset.demonId && command?.actionKey) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = DEMON_ACTIONS[command.actionKey]?.label ?? "Run";
        button.addEventListener("click", () =>
          executeStoredDemonAction(
            networkConsoleApp,
            form.dataset.nodeId,
            form.dataset.demonId,
            command.actionKey,
          ));
        item.append(button);
      }
      preview.append(item);
    }
    if (!preview.children.length) {
      const item = document.createElement("li");
      item.textContent = "No profile lines; enter controlled custom programming below.";
      preview.append(item);
    }
    const hasPreservedCustomLines = Boolean(customCommandText.value.trim());
    customCommandGroup.hidden =
      profile !== CUSTOM_PROGRAMMING_PROFILE && !hasPreservedCustomLines;

    const lineLimit = configuredLimit(classKey);
    const capacity = commandCapacityState({
      classKey,
      lineLimit,
      programmingProfile: profile,
      additionalCount: commonCommandInputs.filter((input) => input.checked).length,
      customCommandText: customCommandText.value,
    });
    const fixedLimit = capacity.limit;
    capacityNote.textContent = fixedLimit == null
      ? `${classKey === CUSTOM_DEMON_CLASS ? "Custom Demon" : classKey} has no fixed command-line limit in the current data.`
      : `${classKey} supports ${fixedLimit} command lines. Profiles requiring more than ${fixedLimit} lines are hidden.`;
    capacityIndicator.textContent = fixedLimit == null
      ? `Command lines: ${capacity.count} / no fixed limit`
      : `Command lines: ${capacity.count} / ${fixedLimit}${capacity.exceeded ? ` — over capacity; remove ${capacity.count - fixedLimit}` : ""}`;
    capacityIndicator.classList.toggle("is-at-capacity", capacity.atCapacity);
    capacityIndicator.classList.toggle("is-over-capacity", capacity.exceeded);

    const profileKeys = new Set(
      CWN_DEMON_PROGRAMMING_PROFILES[profileName] ?? [],
    );
    for (const input of commonCommandInputs) {
      const duplicateProfileLine = profileKeys.has(input.value);
      input.disabled = !input.checked && (duplicateProfileLine || !capacity.canAdd);
      const choice = input.closest(".cwnce-command-choice");
      choice?.classList.toggle(
        "is-capacity-disabled",
        input.disabled && !duplicateProfileLine,
      );
      choice?.classList.toggle(
        "is-profile-duplicate",
        input.disabled && duplicateProfileLine,
      );
    }
    const profileCompatible = isProgrammingProfileCompatible(
      classKey,
      profile,
      lineLimit,
    );
    if (saveButton) saveButton.disabled = capacity.exceeded || !profileCompatible;
  };
  classSelect.addEventListener("change", () => {
    if (previousClass === CUSTOM_DEMON_CLASS &&
        classSelect.value !== CUSTOM_DEMON_CLASS &&
        !window.confirm("Switching to a standard class will use its fixed statistics. Continue?")) {
      classSelect.value = previousClass;
      return;
    }
    previousClass = classSelect.value;
    refresh({ classChanged: true, rebuildProfiles: true });
  });
  profileSelect.addEventListener("change", () => refresh());
  for (const input of commonCommandInputs) {
    input.addEventListener("change", () => refresh());
  }
  customCommandText.addEventListener("input", () => refresh());
  refresh({ rebuildProfiles: true });
}

function watchdogFromForm(data, id) {
  return {
    id,
    name: String(data.name || "Watchdog").trim(),
    notes: String(data.notes || "").trim(),
    revealed: data.revealed === "on",
  };
}

function watchdogDialogContent(watchdog = {}) {
  const escaped = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  return `
    <div class="form-group"><label>Name</label><input name="name" value="${escaped(watchdog.name)}" required></div>
    <div class="form-group"><label>Revealed to players</label><input type="checkbox" name="revealed"${watchdog.revealed ? " checked" : ""}></div>
    <div class="form-group stacked"><label>Private GM notes</label><textarea name="notes" rows="4">${escaped(watchdog.notes)}</textarea></div>
  `;
}

function nodeDialogContent(node = {}, connectedOptions = "") {
  const escaped = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const connectedField = connectedOptions
    ? `
      <div class="form-group">
        <label>Connected To</label>
        <select name="connectedTo">${connectedOptions}</select>
      </div>
    `
    : "";
  return `
    <div class="form-group">
      <label>Name</label>
      <input type="text" name="name" value="${escaped(node.name)}" required autofocus>
    </div>
    <div class="form-group">
      <label>Device Type</label>
      <select name="type">${optionMarkup(NODE_TYPES, node.type ?? "custom")}</select>
    </div>
    <div class="form-group">
      <label>Operational State</label>
      <select name="state">${optionMarkup(NODE_STATES, node.state ?? "normal")}</select>
    </div>
    <div class="form-group">
      <label>Revealed to Players</label>
      <input type="checkbox" name="revealed"${node.revealed ? " checked" : ""}>
    </div>
    ${connectedField}
    <div class="form-group stacked">
      <label>Player Description</label>
      <textarea name="description" rows="2">${escaped(node.description)}</textarea>
    </div>
    <div class="form-group stacked">
      <label>Private GM Notes</label>
      <textarea name="gmNotes" rows="3">${escaped(node.gmNotes)}</textarea>
    </div>
  `;
}

function connectionDialogContent(network, connection = {}) {
  const isExisting = Boolean(connection.id);
  const source = findNode(network, connection.source) ?? network.nodes[0];
  const target = findNode(network, connection.target) ?? network.nodes[1];
  const revealed = isExisting ? connection.revealed : Boolean(source?.revealed && target?.revealed);
  const barrierState = connection.barrierLocked ? "locked" : connection.barrier ? "unlocked" : "none";
  return `
    <div class="form-group">
      <label>Source Node</label>
      <select name="source">${nodeOptionMarkup(network.nodes, connection.source)}</select>
    </div>
    <div class="form-group">
      <label>Destination Node</label>
      <select name="target">${nodeOptionMarkup(network.nodes, connection.target)}</select>
    </div>
    <div class="form-group">
      <label>Revealed to Players</label>
      <input type="checkbox" name="revealed"${revealed ? " checked" : ""}>
    </div>
    <div class="form-group">
      <label>Barrier</label>
      <select name="barrierState">
        <option value="none"${barrierState === "none" ? " selected" : ""}>No Barrier</option>
        <option value="unlocked"${barrierState === "unlocked" ? " selected" : ""}>Unlocked Barrier</option>
        <option value="locked"${barrierState === "locked" ? " selected" : ""}>Locked Barrier</option>
      </select>
    </div>
    <div class="form-group">
      <label>One-Way Connection</label>
      <input type="checkbox" name="oneWay"${connection.oneWay ? " checked" : ""}>
    </div>
    <div class="form-group stacked">
      <label>Private GM Notes</label>
      <textarea name="gmNotes" rows="3">${foundry.utils.escapeHTML(String(connection.gmNotes ?? ""))}</textarea>
    </div>
  `;
}
