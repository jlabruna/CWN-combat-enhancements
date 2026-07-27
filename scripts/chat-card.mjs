const CARD_VARIANTS = new Set(["reload", "network", "demon", "damage"]);

export const CWN_CE_CHAT_CARD_CLASSES = Object.freeze({
  card: "cwn-ce-chat-card",
  reload: "cwn-ce-chat-card--reload",
  network: "cwn-ce-chat-card--network",
  demon: "cwn-ce-chat-card--demon",
  damage: "cwn-ce-chat-card--damage",
  header: "cwn-ce-chat-card__header",
  title: "cwn-ce-chat-card__title",
  subtitle: "cwn-ce-chat-card__subtitle",
  body: "cwn-ce-chat-card__body",
  row: "cwn-ce-chat-card__row",
  label: "cwn-ce-chat-card__label",
  value: "cwn-ce-chat-card__value",
  result: "cwn-ce-chat-card__result",
  guidance: "cwn-ce-chat-card__guidance",
  actions: "cwn-ce-chat-card__actions",
  roll: "cwn-ce-chat-card__roll",
  rollLabel: "cwn-ce-chat-card__roll-label",
});

export function escapeChatCardText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizedVariants(variants) {
  const values = Array.isArray(variants) ? variants : [variants];
  return [...new Set(values.filter((value) => CARD_VARIANTS.has(value)))];
}

/**
 * Render the stable, module-owned semantic chat-card contract. All supplied
 * text is escaped; actionsMarkup and Roll-rendered HTML are reserved for
 * trusted module-owned controls and Foundry Roll instances.
 */
export function renderCwnCeChatCard({
  variants = [],
  icon = "",
  title = "",
  subtitle = "",
  rows = [],
  rolls = [],
  result = "",
  guidance = "",
  actionsMarkup = "",
} = {}) {
  const classes = [
    CWN_CE_CHAT_CARD_CLASSES.card,
    ...normalizedVariants(variants).map((variant) => `cwn-ce-chat-card--${variant}`),
  ].join(" ");
  const rowMarkup = rows
    .filter((row) => row && row.value !== "" && row.value != null)
    .map((row) => `
      <div class="${CWN_CE_CHAT_CARD_CLASSES.row}">
        <span class="${CWN_CE_CHAT_CARD_CLASSES.label}">${escapeChatCardText(row.label)}</span>
        <span class="${CWN_CE_CHAT_CARD_CLASSES.value}">${escapeChatCardText(row.value)}</span>
      </div>`)
    .join("");
  const rollMarkup = rolls
    .filter((roll) => roll && roll.total !== "" && roll.total != null)
    .map((roll) => `
      <section class="${CWN_CE_CHAT_CARD_CLASSES.roll}">
        <span class="${CWN_CE_CHAT_CARD_CLASSES.rollLabel}">${escapeChatCardText(roll.label)}</span>
        ${roll.html || `<div class="roll">
          <div class="dice-roll">
            <div class="dice-result">
              <div class="dice-formula">${escapeChatCardText(roll.formula)}</div>
              <h4 class="dice-total">${escapeChatCardText(roll.total)}</h4>
            </div>
          </div>
        </div>`}
      </section>`)
    .join("");
  const safeIcon = /^fa-(?:solid|regular|brands) fa-[a-z0-9-]+$/u.test(icon)
    ? `<i class="${icon}" aria-hidden="true"></i>`
    : "";
  return `
    <article class="chat-card item-card ${classes}">
      <header class="${CWN_CE_CHAT_CARD_CLASSES.header}">
        ${safeIcon}
        <div>
          <h3 class="${CWN_CE_CHAT_CARD_CLASSES.title}">${escapeChatCardText(title)}</h3>
          ${subtitle ? `<p class="${CWN_CE_CHAT_CARD_CLASSES.subtitle}">${escapeChatCardText(subtitle)}</p>` : ""}
        </div>
      </header>
      <div class="${CWN_CE_CHAT_CARD_CLASSES.body}">
        ${rowMarkup}
        ${rollMarkup}
        ${result ? `<p class="${CWN_CE_CHAT_CARD_CLASSES.result}">${escapeChatCardText(result)}</p>` : ""}
        ${guidance ? `<p class="${CWN_CE_CHAT_CARD_CLASSES.guidance}">${escapeChatCardText(guidance)}</p>` : ""}
      </div>
      <div class="${CWN_CE_CHAT_CARD_CLASSES.actions}">${actionsMarkup}</div>
    </article>`;
}

export function renderReloadChatCard({
  actorName = "",
  weaponName = "",
  magazineName = "",
  roundsTransferred = 0,
  weaponAfter = 0,
  weaponMaximum = 0,
  magazineAfter = 0,
  magazineMaximum = 0,
  magazineDeleted = false,
  automaticallySelected = false,
} = {}) {
  return renderCwnCeChatCard({
    variants: "reload",
    icon: "fa-solid fa-arrows-rotate",
    title: `Reloaded ${Number(roundsTransferred) || 0} rounds`,
    subtitle: actorName,
    rows: [
      { label: "Weapon", value: weaponName },
      { label: "Weapon ammunition", value: `${weaponAfter}/${weaponMaximum}` },
      { label: "Magazine", value: magazineName },
      { label: "Magazine ammunition", value: `${magazineAfter}/${magazineMaximum}` },
      {
        label: "Magazine state",
        value: magazineDeleted ? "Depleted and deleted" : "Retained",
      },
      ...(automaticallySelected
        ? [{ label: "Selection", value: "Automatically selected compatible magazine" }]
        : []),
    ],
  });
}

export function renderDemonActionChatCard({
  demonName = "Hidden Demon",
  actionName = "Demon Action",
  networkName = "",
  nodeName = "",
  targetName = "",
  checkTotal = "",
  checkFormula = "",
  checkRollHtml = "",
  damageTotal = "",
  damageFormula = "",
  damageRollHtml = "",
  guidance = "",
  automated = false,
} = {}) {
  return renderCwnCeChatCard({
    variants: ["network", "demon"],
    icon: "fa-solid fa-ghost",
    title: `${demonName} — ${actionName}`,
    subtitle: [networkName, nodeName].filter(Boolean).join(" · "),
    rows: [
      { label: "Target", value: targetName },
      ...(!checkTotal ? [{ label: "Check", value: "No roll required" }] : []),
    ],
    rolls: [
      ...(checkTotal
        ? [{
            label: "Check",
            total: checkTotal,
            formula: checkFormula,
            html: checkRollHtml,
          }]
        : []),
      ...(damageTotal
        ? [{
            label: "Potential damage",
            total: damageTotal,
            formula: damageFormula,
            html: damageRollHtml,
          }]
        : []),
    ],
    result: automated
      ? "Supported state change automated."
      : "GM adjudication required.",
    guidance,
  });
}

export function renderDemonDamageChatCard({
  title = "Demon Damage",
  demonName = "",
  damage = 0,
  guidance = "",
} = {}) {
  return renderCwnCeChatCard({
    variants: ["network", "demon", "damage"],
    icon: "fa-solid fa-ghost",
    title,
    rows: [
      { label: "Demon", value: demonName },
      { label: "Damage", value: Math.max(0, Math.trunc(Number(damage) || 0)) },
    ],
    guidance,
  });
}

export function buildDemonDamageMessageData({
  moduleId,
  damage,
  networkId = "",
  nodeId = "",
  demonId = "",
  label = "Hacker program damage",
} = {}) {
  const amount = Math.max(0, Math.trunc(Number(damage) || 0));
  return {
    content: renderDemonDamageChatCard({ title: label, damage: amount }),
    flags: {
      [moduleId]: {
        demonDamage: {
          kind: "demon-damage",
          producer: moduleId,
          damage: amount,
          networkId,
          nodeId,
          demonId,
        },
      },
    },
  };
}
