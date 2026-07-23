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
    void ensurePublishedProjection();
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

function getNetworkData(journal) {
  return foundry.utils.deepClone(journal?.getFlag(MODULE_ID, NETWORK_FLAG) ?? null);
}

function createNetworkData(name) {
  return {
    schemaVersion: 1,
    id: foundry.utils.randomID(),
    name,
    idiom: "",
    securityDifficulty: 8,
    serverClass: "Alpha",
    alertProgress: 0,
    authorizedUserIds: [],
    nodes: [],
    connections: [],
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
  network.name = String(network.name || journal.name || "Untitled Network").trim();
  await journal.update({
    name: `[Network] ${network.name}`,
    [`flags.${MODULE_ID}.${NETWORK_FLAG}`]: network,
  });
  await publishNetworkProjection(journal, network);
}

function sanitizeNetwork(network) {
  if (!network) return null;

  const nodes = network.nodes
    .filter((node) => node.revealed)
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      state: node.state,
      description: node.description,
      datafiles: node.datafiles,
      demons: node.demons,
      watchdogs: node.watchdogs,
      revealed: true,
    }));
  const visibleIds = new Set(nodes.map((node) => node.id));

  const connections = network.connections
    .filter(
      (connection) =>
        connection.revealed &&
        visibleIds.has(connection.source) &&
        visibleIds.has(connection.target),
    )
    .map((connection) => ({
      id: connection.id,
      source: connection.source,
      target: connection.target,
      barrier: connection.barrier,
      barrierLocked: connection.barrierLocked,
      oneWay: connection.oneWay,
      revealed: true,
    }));

  return {
    schemaVersion: network.schemaVersion ?? 1,
    id: network.id,
    name: network.name,
    idiom: network.idiom,
    securityDifficulty: network.securityDifficulty,
    serverClass: network.serverClass,
    alertProgress: network.alertProgress,
    authorizedUserIds: network.authorizedUserIds ?? [],
    nodes,
    connections,
  };
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

function handleNetworkSocket(payload) {
  if (!isNetworkConsoleEnabled() || !payload?.type) return;

  if (payload.type === "projectionRequest" && game.user.isGM) {
    if (game.users.activeGM?.id !== game.user.id) return;
    game.socket.emit(SOCKET_NAME, {
      type: "projectionAvailable",
      targetUserId: payload.requesterId,
    });
    return;
  }

  if (
    payload.type === "projectionAvailable" &&
    payload.targetUserId === game.user.id
  ) {
    renderOpenNetworkConsole();
    return;
  }

  if (payload.type === "actionRequest" && game.user.isGM) {
    const user = game.users.get(payload.userId);
    const userName = user?.name ?? "A player";
    const nodeSuffix = payload.nodeName ? ` at ${payload.nodeName}` : "";
    const detailSuffix = payload.detail ? `: ${payload.detail}` : "";
    ui.notifications.info(
      `${userName} requests ${payload.actionLabel}${nodeSuffix}${detailSuffix}`,
      { permanent: true },
    );
  }
}

function buildGraph(network, showHidden) {
  if (!network) return { width: 920, height: 500, nodes: [], connections: [] };

  const nodes = network.nodes.filter((node) => showHidden || node.revealed);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = network.connections.filter(
    (connection) =>
      nodeIds.has(connection.source) &&
      nodeIds.has(connection.target) &&
      (showHidden || connection.revealed),
  );

  if (!nodes.length) {
    return { width: 920, height: 500, nodes: [], connections: [] };
  }

  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const connection of connections) {
    adjacency.get(connection.source)?.push(connection.target);
    adjacency.get(connection.target)?.push(connection.source);
    indegree.set(connection.target, (indegree.get(connection.target) ?? 0) + 1);
  }

  const preferredRoot =
    nodes.find((node) => node.type === "server") ??
    nodes.find((node) => (indegree.get(node.id) ?? 0) === 0) ??
    nodes[0];
  const levels = new Map([[preferredRoot.id, 0]]);
  const queue = [preferredRoot.id];

  while (queue.length) {
    const current = queue.shift();
    const nextLevel = (levels.get(current) ?? 0) + 1;
    for (const next of adjacency.get(current) ?? []) {
      if (levels.has(next)) continue;
      levels.set(next, nextLevel);
      queue.push(next);
    }
  }

  let orphanLevel = Math.max(...levels.values(), 0) + 1;
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, orphanLevel);
      orphanLevel += 1;
    }
  }

  const grouped = new Map();
  for (const node of nodes) {
    const level = levels.get(node.id);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(node);
  }

  const maxLevel = Math.max(...grouped.keys(), 0);
  const maxRows = Math.max(...Array.from(grouped.values(), (group) => group.length), 1);
  const width = Math.max(920, 210 + maxLevel * 235);
  const height = Math.max(500, 140 + maxRows * 145);
  const positioned = [];
  const positionById = new Map();

  for (const [level, group] of grouped.entries()) {
    const gap = height / (group.length + 1);
    group.forEach((node, index) => {
      const x = 45 + level * 235;
      const y = Math.round(gap * (index + 1) - 55);
      const decorated = decorateNode(node, x, y);
      positioned.push(decorated);
      positionById.set(node.id, { x: x + 90, y: y + 55 });
    });
  }

  const decoratedConnections = connections.map((connection) => {
    const source = positionById.get(connection.source);
    const target = positionById.get(connection.target);
    return {
      ...connection,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      barrierX: Math.round((source.x + target.x) / 2),
      barrierY: Math.round((source.y + target.y) / 2),
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

function decorateNode(node, x = 0, y = 0) {
  const type = NODE_TYPES[node.type] ?? NODE_TYPES.custom;
  return {
    ...node,
    typeLabel: type.label,
    icon: type.icon,
    stateLabel: NODE_STATES[node.state] ?? node.state ?? "Normal",
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

async function waitForFormDialog({ title, content, saveLabel = "Save" }) {
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<form class="standard-form cwnce-network-dialog">${content}</form>`,
    buttons: [
      {
        action: "save",
        label: saveLabel,
        icon: "fa-solid fa-floppy-disk",
        default: true,
        callback: (_event, button) =>
          Object.fromEntries(new FormData(button.form).entries()),
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark",
        callback: () => null,
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
      deleteNode: this.deleteNode,
      toggleNodeReveal: this.toggleNodeReveal,
      selectNode: this.selectNode,
      addConnection: this.addConnection,
      editConnection: this.editConnection,
      deleteConnection: this.deleteConnection,
      toggleConnectionReveal: this.toggleConnectionReveal,
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

    const graph = buildGraph(network, game.user.isGM);
    context.network = network;
    context.graph = graph;
    context.nodeCount = network.nodes.length;
    context.connectionCount = network.connections.length;
    context.barrierCount = network.connections.filter((connection) => connection.barrier).length;
    context.serverLimits = SERVER_LIMITS[network.serverClass] ?? SERVER_LIMITS.Alpha;
    context.alertLabel =
      Number(network.alertProgress) >= 2
        ? "ALERTED"
        : `${Number(network.alertProgress) || 0} of 2 alert actions`;

    if (!this.selectedNodeId || !findNode(network, this.selectedNodeId)) {
      this.selectedNodeId = network.nodes[0]?.id ?? null;
    }
    const selectedNode = findNode(network, this.selectedNodeId);
    context.selectedNode = selectedNode ? decorateNode(selectedNode) : null;
    context.playerActions = PLAYER_ACTIONS;

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
    const select = this.element.querySelector("[data-network-select]");
    select?.addEventListener("change", async (event) => {
      if (!game.user.isGM) return;
      await game.settings.set(MODULE_ID, "activeNetworkId", event.currentTarget.value);
      this.selectedNodeId = null;
      await publishNetworkProjection(getActiveNetworkDocument());
      this.render();
    });
  }

  async _onClose(options) {
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

    const node = {
      id: foundry.utils.randomID(),
      name: String(data.name).trim(),
      type: NODE_TYPES[data.type] ? data.type : "custom",
      state: NODE_STATES[data.state] ? data.state : "normal",
      revealed: data.revealed === "on",
      description: String(data.description || "").trim(),
      gmNotes: String(data.gmNotes || "").trim(),
      datafiles: String(data.datafiles || "").trim(),
      demons: String(data.demons || "").trim(),
      watchdogs: String(data.watchdogs || "").trim(),
    };
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
    node.datafiles = String(data.datafiles || "").trim();
    node.demons = String(data.demons || "").trim();
    node.watchdogs = String(data.watchdogs || "").trim();

    await saveNetwork(journal, network);
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

    network.nodes = network.nodes.filter((candidate) => candidate.id !== node.id);
    network.connections = network.connections.filter(
      (connection) => connection.source !== node.id && connection.target !== node.id,
    );
    await saveNetwork(journal, network);
    this.selectedNodeId = network.nodes[0]?.id ?? null;
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

    network.connections.push({
      id: foundry.utils.randomID(),
      source: data.source,
      target: data.target,
      revealed: data.revealed === "on",
      barrier: data.barrier === "on",
      barrierLocked: data.barrier === "on" && data.barrierLocked === "on",
      oneWay: data.oneWay === "on",
      gmNotes: String(data.gmNotes || "").trim(),
    });
    await saveNetwork(journal, network);
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

    connection.source = data.source;
    connection.target = data.target;
    connection.revealed = data.revealed === "on";
    connection.barrier = data.barrier === "on";
    connection.barrierLocked = connection.barrier && data.barrierLocked === "on";
    connection.oneWay = data.oneWay === "on";
    connection.gmNotes = String(data.gmNotes || "").trim();
    await saveNetwork(journal, network);
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

  static async requestAction(_event, target) {
    if (game.user.isGM) return;
    const projection = readPublishedProjection();
    const network = projection?.network;
    if (!network || !userCanViewProjection(network)) return;

    const action = PLAYER_ACTIONS.find((candidate) => candidate.id === target.dataset.requestId);
    const node = findNode(network, this.selectedNodeId);
    if (!action) return;

    let detail = "";
    if (action.id === "runProgram") {
      const data = await waitForFormDialog({
        title: "Request: Run a Program",
        saveLabel: "Send Request",
        content: `
          <p class="hint">This prototype records your declared Verb and Subject. It does not yet inspect your cyberdeck or resolve the program.</p>
          <div class="form-group">
            <label>Verb</label>
            <input type="text" name="verb" placeholder="Glitch" required autofocus>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" name="subject" placeholder="Camera" required>
          </div>
        `,
      });
      if (!data?.verb || !data?.subject) return;
      detail = `${String(data.verb).trim()} ${String(data.subject).trim()}`;
    }

    game.socket.emit(SOCKET_NAME, {
      type: "actionRequest",
      userId: game.user.id,
      networkId: network.id,
      networkName: network.name,
      nodeId: node?.id ?? "",
      nodeName: node?.name ?? "",
      actionId: action.id,
      actionLabel: `${action.label} (${action.economy})`,
      detail,
    });
    ui.notifications.info(`Request sent: ${action.label}`);
  }
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
      <label>Datafiles Present</label>
      <input type="text" name="datafiles" value="${escaped(node.datafiles)}" placeholder="Payroll archive, camera logs">
    </div>
    <div class="form-group stacked">
      <label>Demons Present</label>
      <input type="text" name="demons" value="${escaped(node.demons)}" placeholder="Mastiff / Patroller">
    </div>
    <div class="form-group stacked">
      <label>Watchdogs Present</label>
      <input type="text" name="watchdogs" value="${escaped(node.watchdogs)}" placeholder="Veteran tech">
    </div>
    <div class="form-group stacked">
      <label>Private GM Notes</label>
      <textarea name="gmNotes" rows="3">${escaped(node.gmNotes)}</textarea>
    </div>
  `;
}

function connectionDialogContent(network, connection = {}) {
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
      <input type="checkbox" name="revealed"${connection.revealed ? " checked" : ""}>
    </div>
    <div class="form-group">
      <label>Connection Has a Barrier</label>
      <input type="checkbox" name="barrier"${connection.barrier ? " checked" : ""}>
    </div>
    <div class="form-group">
      <label>Barrier Is Locked</label>
      <input type="checkbox" name="barrierLocked"${connection.barrierLocked ? " checked" : ""}>
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
