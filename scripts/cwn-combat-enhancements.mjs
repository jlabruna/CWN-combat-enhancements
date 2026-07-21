const MODULE_ID = "cwn-combat-enhancements";
const ATTACK_FLAG = "attack";

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
});

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

  const results = buildResults({ context, weapon, attackTotal });
  card.append(buildResultsElement(results, weapon, attackTotal));
});

function readAttackCardSource(content) {
  if (typeof content !== "string" || !content.includes("chat-card item-card")) return null;

  const document = new DOMParser().parseFromString(content, "text/html");
  const card = document.querySelector(".chat-card.item-card[data-actor-id][data-item-id]");
  if (!card) return null;

  return {
    actorId: card.dataset.actorId,
    itemId: card.dataset.itemId,
  };
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

function buildResults({ context, weapon, attackTotal }) {
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
    else if (Number.isFinite(ac)) result = adjustedTotal >= ac ? "hit" : "miss";

    return {
      status: "ready",
      name: tokenDocument.name,
      ac,
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

function buildResultsElement(results, weapon, attackTotal) {
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

    const target = document.createElement("article");
    target.className = `cwnce-target cwnce-${result.result}`;

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
    outcome.textContent = formatOutcome(result.result);
    target.append(outcome);
    section.append(target);
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
    miss: "CWNCE.Chat.Miss",
    out: "CWNCE.Chat.OutOfRange",
    unknown: "CWNCE.Chat.Unknown",
  };
  return game.i18n.localize(keys[result] ?? keys.unknown);
}

function formatSigned(value) {
  return value >= 0 ? `+ ${value}` : `− ${Math.abs(value)}`;
}
