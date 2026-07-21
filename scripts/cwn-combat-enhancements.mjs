const MODULE_ID = "cwn-combat-enhancements";
const ATTACK_FLAG = "attack";
const DAMAGE_APPLICATION_FLAG = "damageApplication";
const NPC_ARMOR_PATCH = Symbol.for("cwn-combat-enhancements.npcArmorPatch");

let swnrApplyHealthDrop = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "showExactAc", {
    name: "CWNCE.Settings.ShowExactAc.Name",
    hint: "CWNCE.Settings.ShowExactAc.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
  });

  game.settings.register(MODULE_ID, "automateNpcArmor", {
    name: "CWNCE.Settings.AutomateNpcArmor.Name",
    hint: "CWNCE.Settings.AutomateNpcArmor.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
  });
});

Hooks.once("setup", () => {
  installNpcArmorCalculation();
});

/**
 * Changing where armor is carried always unequips it. This prevents armor that
 * was equipped while Readied from silently remaining active after it is stowed,
 * and requires newly Readied armor to be equipped deliberately.
 */
Hooks.on("preUpdateItem", (item, changes, _options, userId) => {
  if (
    game.system.id !== "swnr" ||
    userId !== game.user.id ||
    item.type !== "armor" ||
    item.parent?.type !== "npc" ||
    !game.settings.get(MODULE_ID, "automateNpcArmor")
  ) return;

  const location = foundry.utils.getProperty(changes, "system.location");
  if (location === undefined) return;
  foundry.utils.setProperty(changes, "system.use", false);
});

/** Disable the NPC sheet's Equipped checkbox until the armor is Readied. */
Hooks.on("renderApplicationV2", (application, element) => {
  if (
    game.system.id !== "swnr" ||
    !game.settings.get(MODULE_ID, "automateNpcArmor")
  ) return;

  const actor = application.actor ?? application.document;
  if (actor?.type !== "npc") return;

  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  for (const checkbox of root.querySelectorAll(
    'input[type="checkbox"][data-action="toggleArmor"][data-item-id]',
  )) {
    const armor = actor.items.get(checkbox.dataset.itemId);
    if (armor?.type !== "armor" || armor.system?.location === "readied") continue;
    checkbox.checked = false;
    checkbox.disabled = true;
    checkbox.title = game.i18n.localize("CWNCE.Armor.ReadyBeforeEquipping");
  }
});

/**
 * Extend SWNR's NPC derived-data preparation without storing calculated AC on
 * the actor. The original manual fields remain the fallback whenever no active
 * armor improves them.
 */
function installNpcArmorCalculation() {
  if (game.system.id !== "swnr") return;

  const NpcDataModel = CONFIG.Actor.dataModels?.npc;
  const prototype = NpcDataModel?.prototype;
  if (!prototype || prototype[NPC_ARMOR_PATCH]) return;

  const prepareDerivedData = prototype.prepareDerivedData;
  if (typeof prepareDerivedData !== "function") {
    console.warn(`${MODULE_ID} | SWNR NPC data model is unavailable; NPC armor automation was not installed.`);
    return;
  }

  Object.defineProperty(prototype, NPC_ARMOR_PATCH, { value: true });
  prototype.prepareDerivedData = function (...args) {
    const result = prepareDerivedData.apply(this, args);
    if (game.settings.get(MODULE_ID, "automateNpcArmor")) {
      applyNpcArmorCalculation(this);
    }
    return result;
  };
}

/**
 * Correct SWNR 2.3.0's NPC armor derivation. SWNR currently leaves NPC AC at
 * its manual values and counts every owned armor item's Soak and Trauma bonus,
 * even when its use checkbox is clear.
 */
function applyNpcArmorCalculation(system) {
  const actor = system?.parent;
  if (
    !actor ||
    actor.type !== "npc" ||
    !game.settings.get("swnr", "useCWNArmor")
  ) return;

  const activeArmor = Array.from(actor.items ?? []).filter(
    (item) =>
      item.type === "armor" &&
      item.system?.use === true &&
      item.system?.location === "readied",
  );
  const bodyArmor = activeArmor.filter((item) => !item.system?.shield);
  const shields = activeArmor.filter((item) => item.system?.shield);
  const primaryArmor = bodyArmor.reduce((best, item) => {
    if (!best) return item;
    const itemAc = toFiniteNumber(item.system?.ac) ?? -Infinity;
    const bestAc = toFiniteNumber(best.system?.ac) ?? -Infinity;
    return itemAc > bestAc ? item : best;
  }, null);

  const source = actor._source?.system ?? {};
  const fallbackRangedAc =
    toFiniteNumber(source.baseAc) ?? toFiniteNumber(system.baseAc) ?? 10;
  const fallbackMeleeAc =
    toFiniteNumber(source.meleeAc) ?? toFiniteNumber(system.meleeAc) ?? fallbackRangedAc;

  let rangedAc = Math.max(
    fallbackRangedAc,
    toFiniteNumber(primaryArmor?.system?.ac) ?? fallbackRangedAc,
  );
  let meleeAc = Math.max(
    fallbackMeleeAc,
    toFiniteNumber(primaryArmor?.system?.meleeAc) ?? fallbackMeleeAc,
  );

  for (const shield of shields) {
    rangedAc += toFiniteNumber(shield.system?.shieldACBonus) ?? 0;
    meleeAc += toFiniteNumber(shield.system?.shieldMeleeACBonus) ?? 0;
  }

  system.ac = rangedAc;
  system.meleeAc = meleeAc;

  const baseSoak = system.baseSoakTotal ?? source.baseSoakTotal ?? {};
  const soakTotal = {
    value: toFiniteNumber(baseSoak.value) ?? 0,
    max: toFiniteNumber(baseSoak.max) ?? 0,
  };
  const protectiveArmor = [primaryArmor, ...shields].filter(Boolean);
  for (const armor of protectiveArmor) {
    soakTotal.value += toFiniteNumber(armor.system?.soak?.value) ?? 0;
    soakTotal.max += toFiniteNumber(armor.system?.soak?.max) ?? 0;
  }
  system.soakTotal = soakTotal;

  if (game.settings.get("swnr", "useTrauma")) {
    const traumaTarget = toFiniteNumber(system.traumaTarget) ?? 6;
    const armorPenalty =
      toFiniteNumber(primaryArmor?.system?.traumaDiePenalty) ?? 0;
    system.modifiedTraumaTarget = traumaTarget + armorPenalty;
  }
}

/**
 * SWNR does not persist targets on weapon attack messages. Capture the rolling
 * user's current targets before the ChatMessage is created so later renders use
 * the original attack context rather than the user's current target set.
 */
Hooks.on("preCreateChatMessage", (message, data, _options, userId) => {
  if (game.system.id !== "swnr" || userId !== game.user.id) return;

  const source = readAttackCardSource(data.content ?? message.content);
  if (!source) return;

  const attackerToken = resolveAttackerToken(message.speaker, source.actorId);
  const actor = attackerToken?.actor ?? game.actors.get(source.actorId);
  const weapon = actor?.items.get(source.itemId);
  if (weapon?.type !== "weapon") return;

  const targetRefs = Array.from(game.user.targets)
    .map((token) => ({
      sceneId: token.document?.parent?.id ?? canvas.scene?.id ?? null,
      tokenId: token.id,
    }))
    .filter((ref) => ref.sceneId && ref.tokenId);

  const attackContext = {
    actorId: source.actorId,
    itemId: source.itemId,
    sceneId: attackerToken?.parent?.id ?? canvas.scene?.id ?? null,
    attackerTokenId: attackerToken?.id ?? message.speaker?.token ?? null,
    targets: targetRefs,
    damage: source.damage,
  };

  message.updateSource({ [`flags.${MODULE_ID}.${ATTACK_FLAG}`]: attackContext });
});

Hooks.on("renderChatMessage", (message, html) => {
  if (game.system.id !== "swnr") return;

  const context = message.getFlag(MODULE_ID, ATTACK_FLAG);
  if (!context) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".cwnce-results")) return;

  const card = root.querySelector(
    `.chat-card.item-card[data-actor-id="${CSS.escape(context.actorId)}"]` +
      `[data-item-id="${CSS.escape(context.itemId)}"]`,
  );
  if (!card) return;

  const actor = resolveContextActor(context);
  const weapon = actor?.items.get(context.itemId);
  const attackTotal = Number(message.rolls?.[0]?.total);
  if (weapon?.type !== "weapon" || !Number.isFinite(attackTotal)) return;

  const naturalAttackRoll = Number(message.rolls?.[0]?.dice?.[0]?.total);
  const results = buildResults({
    context,
    weapon,
    attackTotal,
    naturalAttackRoll,
  });
  card.append(
    buildResultsElement({
      results,
      weapon,
      attackTotal,
      damage: context.damage,
      message,
    }),
  );
});

function readAttackCardSource(content) {
  if (typeof content !== "string" || !content.includes("chat-card item-card")) return null;

  const document = new DOMParser().parseFromString(content, "text/html");
  const card = document.querySelector(".chat-card.item-card[data-actor-id][data-item-id]");
  if (!card) return null;

  return {
    actorId: card.dataset.actorId,
    itemId: card.dataset.itemId,
    damage: readDamageData(card),
  };
}

function readDamageData(card) {
  const damageRolls = Array.from(
    card.querySelectorAll("span.roll.roll-damage:not(.roll-shock)"),
  );
  const traumaRoll = Array.from(card.querySelectorAll("span.roll")).find(
    (element) =>
      !element.classList.contains("roll-hit") &&
      !element.classList.contains("roll-damage") &&
      !element.classList.contains("roll-shock"),
  );

  return {
    normal: readDiceTotal(damageRolls[0]),
    traumaRoll: readDiceTotal(traumaRoll),
    traumaDamage: readDiceTotal(damageRolls[1]),
  };
}

function readDiceTotal(element) {
  if (!element) return null;
  const value = Number(element.querySelector(".dice-total")?.textContent?.trim());
  return Number.isFinite(value) ? value : null;
}

function resolveAttackerToken(speaker, actorId) {
  if (speaker?.token) {
    const scene = game.scenes.get(speaker.scene) ?? canvas.scene;
    const tokenDocument = scene?.tokens.get(speaker.token);
    if (tokenDocument) return tokenDocument;
  }

  const controlled = canvas.ready
    ? canvas.tokens.controlled.find((token) => token.actor?.id === actorId)
    : null;
  return controlled?.document ?? null;
}

/**
 * Prefer the token actor because unlinked tokens have synthetic actors whose
 * embedded weapon data can differ from the original world actor.
 */
function resolveContextActor(context) {
  const scene = game.scenes.get(context.sceneId);
  const tokenDocument = scene?.tokens.get(context.attackerTokenId);
  return tokenDocument?.actor ?? game.actors.get(context.actorId);
}

function buildResults({ context, weapon, attackTotal, naturalAttackRoll }) {
  const isMelee = Boolean(weapon.system.isMelee);
  const normalRange = Number(weapon.system.range?.normal);
  const maximumRange = Number(weapon.system.range?.max);

  if (!context.targets?.length) {
    return [{ status: "no-targets" }];
  }

  return context.targets.map((targetRef) => {
    const scene = game.scenes.get(targetRef.sceneId);
    const tokenDocument = scene?.tokens.get(targetRef.tokenId);
    const targetActor = tokenDocument?.actor;
    if (!scene || !tokenDocument || !targetActor) {
      return { status: "unavailable", name: "Unavailable target" };
    }

    const ac = Number(isMelee ? targetActor.system.meleeAc : targetActor.system.ac);
    const traumaTarget = toFiniteNumber(
      targetActor.system.modifiedTraumaTarget ?? targetActor.system.traumaTarget,
    );
    const distance = measureDistanceInMeters({
      scene,
      attackerTokenId: context.attackerTokenId,
      targetTokenId: targetRef.tokenId,
    });

    let rangeBand = isMelee ? "melee" : "normal";
    let rangeModifier = 0;

    if (!isMelee && distance.status === "ok") {
      if (Number.isFinite(maximumRange) && distance.meters > maximumRange) {
        rangeBand = "out";
      } else if (Number.isFinite(normalRange) && distance.meters > normalRange) {
        rangeBand = "extreme";
        rangeModifier = -2;
      }
    } else if (!isMelee && distance.status !== "ok") {
      rangeBand = "unknown";
    }

    const adjustedTotal = attackTotal + rangeModifier;
    let result = "unknown";
    if (rangeBand === "out") result = "out";
    else if (naturalAttackRoll === 1) result = "miss";
    else if (naturalAttackRoll === 20) result = "hit";
    else if (Number.isFinite(ac)) result = adjustedTotal >= ac ? "hit" : "miss";

    return {
      status: "ready",
      name: tokenDocument.name,
      sceneId: targetRef.sceneId,
      tokenId: targetRef.tokenId,
      ac,
      traumaTarget,
      isMelee,
      distance,
      rangeBand,
      rangeModifier,
      adjustedTotal,
      result,
    };
  });
}

function measureDistanceInMeters({ scene, attackerTokenId, targetTokenId }) {
  if (!canvas.ready || canvas.scene?.id !== scene.id) {
    return { status: "scene-unavailable" };
  }

  const attacker = canvas.tokens.get(attackerTokenId);
  const target = canvas.tokens.get(targetTokenId);
  if (!attacker || !target) return { status: "token-unavailable" };

  const measured = canvas.grid.measurePath([attacker.center, target.center], {
    gridSpaces: true,
  });
  const sceneDistance = Number(measured.distance);
  const converted = convertToMeters(sceneDistance, scene.grid.units);
  if (!Number.isFinite(converted)) {
    return {
      status: "unsupported-units",
      value: sceneDistance,
      units: scene.grid.units || "units",
    };
  }

  return {
    status: "ok",
    meters: converted,
    sceneValue: sceneDistance,
    sceneUnits: scene.grid.units || "m",
  };
}

function convertToMeters(value, units) {
  if (!Number.isFinite(value)) return NaN;

  const normalized = String(units ?? "m").trim().toLowerCase();
  const factors = {
    m: 1,
    meter: 1,
    meters: 1,
    metre: 1,
    metres: 1,
    ft: 0.3048,
    foot: 0.3048,
    feet: 0.3048,
    km: 1000,
    kilometer: 1000,
    kilometers: 1000,
    kilometre: 1000,
    kilometres: 1000,
    mi: 1609.344,
    mile: 1609.344,
    miles: 1609.344,
    yd: 0.9144,
    yard: 0.9144,
    yards: 0.9144,
  };

  return normalized in factors ? value * factors[normalized] : NaN;
}

function buildResultsElement({ results, weapon, attackTotal, damage, message }) {
  const section = document.createElement("section");
  section.className = "cwnce-results";

  const heading = document.createElement("h5");
  heading.textContent = game.i18n.localize("CWNCE.Chat.Heading");
  section.append(heading);

  for (const result of results) {
    if (result.status === "no-targets") {
      section.append(makeNotice(game.i18n.localize("CWNCE.Chat.NoTargets")));
      continue;
    }
    if (result.status === "unavailable") {
      section.append(makeNotice(game.i18n.localize("CWNCE.Chat.TargetUnavailable")));
      continue;
    }

    const damageDecision =
      result.result === "hit" ? decideDamage(result, damage, weapon) : null;
    const displayOutcome = classifyDisplayOutcome(result, damageDecision);

    const target = document.createElement("article");
    target.className = `cwnce-target cwnce-${displayOutcome}`;

    const name = document.createElement("div");
    name.className = "cwnce-target-name";
    name.textContent = result.name;
    target.append(name);

    const details = document.createElement("dl");
    addDetail(details, game.i18n.localize("CWNCE.Chat.Distance"), formatDistance(result.distance));
    addDetail(details, game.i18n.localize("CWNCE.Chat.Range"), formatRangeBand(result.rangeBand));

    if (result.rangeModifier) {
      addDetail(
        details,
        game.i18n.localize("CWNCE.Chat.Attack"),
        `${attackTotal} ${formatSigned(result.rangeModifier)} = ${result.adjustedTotal}`,
      );
    } else {
      addDetail(details, game.i18n.localize("CWNCE.Chat.Attack"), String(attackTotal));
    }

    if (game.user.isGM || game.settings.get(MODULE_ID, "showExactAc")) {
      const acLabel = result.isMelee ? "CWNCE.Chat.MeleeAc" : "CWNCE.Chat.RangedAc";
      addDetail(details, game.i18n.localize(acLabel), Number.isFinite(result.ac) ? String(result.ac) : "—");
    }

    target.append(details);

    const outcome = document.createElement("div");
    outcome.className = "cwnce-outcome";
    outcome.textContent = formatOutcome(displayOutcome);
    target.append(outcome);

    if (game.user.isGM && result.result === "hit") {
      if (damageDecision) {
        const damagePreview = document.createElement("div");
        damagePreview.className = "cwnce-damage-preview";
        damagePreview.textContent = formatDamageDecision(damageDecision);
        target.append(damagePreview);
      }
    }

    section.append(target);
  }

  if (game.user.isGM) {
    const hitResults = results.filter(
      (result) => result.status === "ready" && result.result === "hit",
    );
    const damageAction = buildDamageAction({
      hitResults,
      damage,
      weapon,
      message,
    });
    if (damageAction) section.append(damageAction);
  }

  if (!weapon.system.isMelee) {
    const ranges = document.createElement("div");
    ranges.className = "cwnce-weapon-ranges";
    ranges.textContent = game.i18n.format("CWNCE.Chat.WeaponRanges", {
      normal: weapon.system.range?.normal ?? "—",
      maximum: weapon.system.range?.max ?? "—",
    });
    section.append(ranges);
  }

  return section;
}

/**
 * Trauma only changes the displayed outcome after the attack itself is a hit.
 * A high Trauma roll can never turn a miss or out-of-range attack into a
 * Trauma Hit.
 */
function classifyDisplayOutcome(result, damageDecision) {
  if (result.result !== "hit") return result.result;
  return damageDecision?.kind === "trauma" ? "trauma" : "hit";
}

function decideDamage(result, damage, weapon) {
  const normalDamage = toFiniteNumber(damage?.normal);
  if (normalDamage === null) return null;

  const traumaRoll = toFiniteNumber(damage?.traumaRoll);
  const traumaTarget = toFiniteNumber(result.traumaTarget);
  const traumaRating = toFiniteNumber(weapon.system.trauma?.rating);
  const isTraumatic =
    traumaRoll !== null &&
    traumaTarget !== null &&
    traumaRating !== null &&
    traumaRoll >= traumaTarget;

  return {
    amount: isTraumatic ? normalDamage * traumaRating : normalDamage,
    kind: isTraumatic ? "trauma" : "normal",
    normalDamage,
    traumaRoll,
    traumaTarget,
    traumaRating,
  };
}

function formatDamageDecision(decision) {
  if (decision.kind === "trauma") {
    return game.i18n.format("CWNCE.Chat.TraumaDamagePreview", {
      amount: decision.amount,
      roll: decision.traumaRoll,
      target: decision.traumaTarget,
    });
  }

  if (decision.traumaRoll !== null && decision.traumaTarget !== null) {
    return game.i18n.format("CWNCE.Chat.NormalDamagePreview", {
      amount: decision.amount,
      roll: decision.traumaRoll,
      target: decision.traumaTarget,
    });
  }

  return game.i18n.format("CWNCE.Chat.DamagePreview", {
    amount: decision.amount,
  });
}

function buildDamageAction({ hitResults, damage, weapon, message }) {
  if (!hitResults.length || toFiniteNumber(damage?.normal) === null) return null;

  const container = document.createElement("div");
  container.className = "cwnce-damage-action";

  const existing = message.getFlag(MODULE_ID, DAMAGE_APPLICATION_FLAG);
  if (existing?.entries?.length) {
    const summary = document.createElement("div");
    summary.className = "cwnce-damage-applied";
    summary.textContent = game.i18n.format("CWNCE.Chat.DamageApplied", {
      count: existing.entries.length,
    });
    container.append(summary);
    return container;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "cwnce-apply-damage";
  button.textContent = game.i18n.format("CWNCE.Chat.ApplyDamage", {
    count: hitResults.length,
  });
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    await applyDamageToHitTargets({
      hitResults,
      damage,
      weapon,
      message,
    });
  });

  const hint = document.createElement("div");
  hint.className = "cwnce-damage-hint";
  hint.textContent = game.i18n.localize("CWNCE.Chat.ApplyDamageHint");
  container.append(button, hint);
  return container;
}

async function applyDamageToHitTargets({ hitResults, damage, weapon, message }) {
  if (message.getFlag(MODULE_ID, DAMAGE_APPLICATION_FLAG)?.entries?.length) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Chat.AlreadyApplied"));
    return;
  }

  if (!canvas.ready) {
    ui.notifications?.error(game.i18n.localize("CWNCE.Chat.SceneUnavailable"));
    return;
  }

  const originalControlledIds = canvas.tokens.controlled.map((token) => token.id);
  const entries = [];

  try {
    const applyHealthDrop = await getSwnrApplyHealthDrop();

    for (const result of hitResults) {
      if (result.sceneId !== canvas.scene?.id) continue;
      const token = canvas.tokens.get(result.tokenId);
      const decision = decideDamage(result, damage, weapon);
      if (!token?.actor || !decision) continue;

      canvas.tokens.releaseAll();
      token.control({ releaseOthers: false });
      await applyHealthDrop(decision.amount);

      entries.push({
        sceneId: result.sceneId,
        tokenId: result.tokenId,
        name: result.name,
        amount: decision.amount,
        kind: decision.kind,
        traumaRoll: decision.traumaRoll,
        traumaTarget: decision.traumaTarget,
      });

      await message.setFlag(MODULE_ID, DAMAGE_APPLICATION_FLAG, {
        entries,
        userId: game.user.id,
        appliedAt: Date.now(),
      });
    }

    if (!entries.length) {
      ui.notifications?.warn(game.i18n.localize("CWNCE.Chat.NoDamageTargets"));
    } else {
      ui.notifications?.info(
        game.i18n.format("CWNCE.Chat.DamageApplied", { count: entries.length }),
      );
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to apply damage`, error);
    ui.notifications?.error(game.i18n.localize("CWNCE.Chat.DamageFailed"));
  } finally {
    canvas.tokens.releaseAll();
    for (const tokenId of originalControlledIds) {
      canvas.tokens.get(tokenId)?.control({ releaseOthers: false });
    }
  }
}

async function getSwnrApplyHealthDrop() {
  if (swnrApplyHealthDrop) return swnrApplyHealthDrop;

  const path = foundry.utils.getRoute("systems/swnr/module/helpers/chat.mjs");
  const helpers = await import(path);
  if (typeof helpers.applyHealthDrop !== "function") {
    throw new Error("SWNR applyHealthDrop helper is unavailable.");
  }

  swnrApplyHealthDrop = helpers.applyHealthDrop;
  return swnrApplyHealthDrop;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function makeNotice(text) {
  const notice = document.createElement("p");
  notice.className = "cwnce-notice";
  notice.textContent = text;
  return notice;
}

function addDetail(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  list.append(term, description);
}

function formatDistance(distance) {
  if (distance.status === "ok") {
    const rounded = Math.round(distance.meters * 10) / 10;
    return `${rounded} m`;
  }
  if (distance.status === "unsupported-units") {
    return `${distance.value} ${distance.units}`;
  }
  return game.i18n.localize("CWNCE.Chat.Unavailable");
}

function formatRangeBand(rangeBand) {
  const keys = {
    melee: "CWNCE.Chat.RangeMelee",
    normal: "CWNCE.Chat.RangeNormal",
    extreme: "CWNCE.Chat.RangeExtreme",
    out: "CWNCE.Chat.RangeOut",
    unknown: "CWNCE.Chat.RangeUnknown",
  };
  return game.i18n.localize(keys[rangeBand] ?? keys.unknown);
}

function formatOutcome(result) {
  const keys = {
    hit: "CWNCE.Chat.Hit",
    trauma: "CWNCE.Chat.TraumaHit",
    miss: "CWNCE.Chat.Miss",
    out: "CWNCE.Chat.OutOfRange",
    unknown: "CWNCE.Chat.Unknown",
  };
  return game.i18n.localize(keys[result] ?? keys.unknown);
}

function formatSigned(value) {
  return value >= 0 ? `+ ${value}` : `− ${Math.abs(value)}`;
}
