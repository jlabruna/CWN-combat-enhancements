const MODULE_ID = "cwn-combat-enhancements";
const SUPPRESSIVE_FLAG = "suppressiveFire";
const SUPPRESSIVE_DAMAGE_FLAG = "suppressiveDamageApplication";
const WEAPON_ROLL_PATCH = Symbol.for(`${MODULE_ID}.weaponRollPatch`);
const WEAPON_ATTACK_PATCH = Symbol.for(`${MODULE_ID}.weaponAttackPatch`);

const pendingDialogs = [];
const fireModeSelections = new WeakMap();
let swnrApplyHealthDrop = null;

Hooks.once("setup", () => {
  installWeaponFireModePatches();
});

Hooks.on("renderApplicationV2", (_application, element) => {
  if (game.system.id !== "swnr") return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  enhanceWeaponAttackDialog(root);
});

/* Never persist Burst Fire as an automatic default. */
Hooks.on("preUpdateItem", (item, changes) => {
  if (game.system.id !== "swnr" || item.type !== "weapon") return;
  if (foundry.utils.getProperty(changes, "system.remember.burst") === true) {
    foundry.utils.setProperty(changes, "system.remember.burst", false);
  }
});

Hooks.on("renderChatMessage", (message, html) => {
  if (game.system.id !== "swnr") return;
  const context = message.getFlag(MODULE_ID, SUPPRESSIVE_FLAG);
  if (!context) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  const card = root?.querySelector(".cwnce-suppressive-card");
  if (!card || card.querySelector(".cwnce-suppressive-action")) return;
  if (game.user.isGM) card.append(buildSuppressiveDamageAction(message, context));
});

function installWeaponFireModePatches() {
  if (game.system.id !== "swnr") return;
  const prototype = CONFIG.Item.dataModels?.weapon?.prototype;
  if (!prototype) {
    console.warn(`${MODULE_ID} | SWNR weapon data model is unavailable.`);
    return;
  }

  if (!prototype[WEAPON_ROLL_PATCH] && typeof prototype.roll === "function") {
    const originalRoll = prototype.roll;
    Object.defineProperty(prototype, WEAPON_ROLL_PATCH, { value: true });
    prototype.roll = async function (...args) {
      if (!supportsFireModes(this)) return originalRoll.apply(this, args);

      const context = {
        model: this,
        actorId: this.parent?.actor?.id ?? null,
        itemId: this.parent?.id ?? null,
        mode: "none",
        bound: false,
        rememberedModifier: finiteNumber(this.remember?.modifier) ?? 0,
      };
      pendingDialogs.push(context);
      fireModeSelections.set(this, context);

      try {
        /* Shift forces SWNR to show its dialog instead of quick-rolling a saved Burst. */
        return await originalRoll.call(this, true);
      } finally {
        const index = pendingDialogs.indexOf(context);
        if (index >= 0) pendingDialogs.splice(index, 1);
      }
    };
  }

  if (!prototype[WEAPON_ATTACK_PATCH] && typeof prototype.rollAttack === "function") {
    const originalRollAttack = prototype.rollAttack;
    Object.defineProperty(prototype, WEAPON_ATTACK_PATCH, { value: true });
    prototype.rollAttack = async function (...args) {
      const context = fireModeSelections.get(this);
      fireModeSelections.delete(this);

      if (context?.mode === "suppress") {
        return resolveSuppressiveFire({
          weaponModel: this,
          damageBonus: finiteNumber(args[0]) ?? 0,
          statModifier: finiteNumber(args[1]) ?? 0,
        });
      }

      /* An ordinary attack only bursts after the user explicitly ticks Burst Fire. */
      if (context?.mode !== "burst") args[4] = false;
      return originalRollAttack.apply(this, args);
    };
  }
}

function supportsFireModes(weaponModel) {
  const ammo = weaponModel?.ammo;
  return Boolean(ammo?.type !== "none" && (ammo?.burst || ammo?.suppress));
}

function enhanceWeaponAttackDialog(root) {
  if (root.querySelector(".cwnce-fire-mode-controls")) return;
  const form = root.querySelector('form input[name="actorId"]')?.form;
  if (!form || !form.elements.modifier) return;

  const actorId = form.elements.actorId?.value;
  const context = [...pendingDialogs]
    .reverse()
    .find((entry) => !entry.bound && entry.actorId === actorId);
  if (!context) return;
  context.bound = true;

  const weapon = context.model;
  const burst = form.elements.burstFire;
  if (burst) burst.checked = false;
  form.elements.modifier.value = String(context.rememberedModifier);

  const controls = document.createElement("div");
  controls.className = "cwnce-fire-mode-controls";

  if (burst) {
    const burstLabel = burst.closest("div");
    burstLabel?.classList.add("cwnce-burst-control");
    if (burstLabel) controls.append(burstLabel);
  }

  let suppress = null;
  if (weapon.ammo?.suppress && weapon.ammo?.type !== "none") {
    const label = document.createElement("label");
    label.className = "cwnce-suppress-control";
    suppress = document.createElement("input");
    suppress.type = "checkbox";
    suppress.name = "suppressiveFire";
    suppress.checked = false;
    label.append(suppress, document.createTextNode(` ${game.i18n.localize("CWNCE.Suppress.Dialog.UseSuppressive")}`));
    controls.append(label);

    const hint = document.createElement("p");
    hint.className = "cwnce-fire-mode-hint";
    hint.textContent = game.i18n.localize("CWNCE.Suppress.Dialog.AimHint");
    controls.append(hint);
  }

  const modifierGroup = form.elements.modifier.closest("div");
  const row = modifierGroup?.parentElement;
  if (row) row.insertAdjacentElement("afterend", controls);
  else form.prepend(controls);

  const updateMode = () => {
    if (suppress?.checked) {
      if (burst) burst.checked = false;
      context.mode = "suppress";
    } else if (burst?.checked) {
      context.mode = "burst";
    } else {
      context.mode = "none";
    }

    const suppressing = context.mode === "suppress";
    form.elements.modifier.disabled = suppressing;
    if (form.elements.skill) form.elements.skill.disabled = suppressing;
    if (form.elements.remember) form.elements.remember.disabled = suppressing;
  };

  burst?.addEventListener("change", () => {
    if (burst.checked && suppress) suppress.checked = false;
    updateMode();
  });
  suppress?.addEventListener("change", () => {
    if (suppress.checked && burst) burst.checked = false;
    updateMode();
  });
  updateMode();
}

async function resolveSuppressiveFire({ weaponModel, damageBonus, statModifier }) {
  const weapon = weaponModel.parent;
  const actor = weapon?.actor;
  if (!weapon || !actor || !canvas.ready) {
    ui.notifications?.error(game.i18n.localize("CWNCE.Suppress.Errors.Scene"));
    return;
  }
  if (!weaponModel.ammo?.suppress) {
    ui.notifications?.error(game.i18n.localize("CWNCE.Suppress.Errors.Ineligible"));
    return;
  }

  const attacker = resolveAttacker(actor);
  const aimTargets = Array.from(game.user.targets).filter(
    (token) => token.document?.parent?.id === canvas.scene?.id && token.id !== attacker?.id,
  );
  const aimTarget = aimTargets.length === 1 ? aimTargets[0] : null;
  if (!attacker || !aimTarget) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Suppress.Errors.AimTarget"));
    return;
  }

  const normalRange = finiteNumber(weaponModel.range?.normal);
  if (normalRange === null || normalRange <= 0) {
    ui.notifications?.error(game.i18n.localize("CWNCE.Suppress.Errors.Range"));
    return;
  }
  if (!hasSuppressiveAmmo(weaponModel.ammo)) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Suppress.Errors.Ammo"));
    return;
  }

  const direction = directionDegrees(attacker.center, aimTarget.center);
  const affected = findTokensInCone({ attacker, direction, rangeMeters: normalRange });
  if (!affected.length) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Suppress.Errors.NoTargets"));
    return;
  }

  const template = await createTemporaryCone({ attacker, direction, rangeMeters: normalRange });
  const choices = await confirmSuppressiveTargets({
    affected,
    weaponName: weapon.name,
    attackerProne: tokenHasStatus(attacker, "prone"),
  });
  if (!choices?.braced) {
    if (choices) ui.notifications?.warn(game.i18n.localize("CWNCE.Suppress.Errors.NotBraced"));
    await deleteTemplate(template);
    return;
  }

  if (!hasSuppressiveAmmo(weaponModel.ammo)) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Suppress.Errors.Ammo"));
    await deleteTemplate(template);
    return;
  }

  try {
    const damageRoll = await new Roll(
      `${weaponModel.damage} + @stat + @damageBonus`,
      { stat: statModifier, damageBonus },
    ).roll();
    const halfDamage = Math.max(0, Math.ceil(Number(damageRoll.total) / 2));
    const results = [];
    const rolls = [damageRoll];

    for (const token of affected) {
      const target = buildTargetReference(token);
      if (choices.hardCover.has(token.id)) {
        results.push({ ...target, outcome: "cover" });
        continue;
      }

      const evasionTarget = readEvasionTarget(token.actor);
      if (evasionTarget === null) {
        results.push({ ...target, outcome: "manual" });
        continue;
      }

      const saveRoll = await new Roll("1d20").roll();
      rolls.push(saveRoll);
      const saveTotal = Number(saveRoll.total);
      if (saveTotal >= evasionTarget) {
        results.push({
          ...target,
          outcome: "saved",
          evasionTarget,
          saveTotal,
          saveFormula: saveRoll.formula,
          saveRollHtml: await saveRoll.render(),
        });
        continue;
      }

      const trauma = await rollSuppressiveTrauma({ weaponModel, targetActor: token.actor });
      if (trauma.roll) rolls.push(trauma.roll);
      results.push({
        ...target,
        outcome: trauma.traumatic ? "trauma" : "failed",
        evasionTarget,
        saveTotal,
        saveFormula: saveRoll.formula,
        saveRollHtml: await saveRoll.render(),
        traumaRoll: trauma.total,
        traumaTarget: trauma.target,
        traumaFormula: trauma.roll?.formula ?? null,
        traumaRollHtml: trauma.roll ? await trauma.roll.render() : null,
        traumaRating: trauma.rating,
        amount: trauma.traumatic ? halfDamage * trauma.rating : halfDamage,
      });
    }

    await spendSuppressiveAmmo(weapon, weaponModel.ammo);
    const context = {
      actorId: actor.id,
      itemId: weapon.id,
      sceneId: canvas.scene.id,
      attackerTokenId: attacker.id,
      direction,
      rangeMeters: normalRange,
      ammoSpent: weaponModel.ammo.type === "infinite" ? 0 : 2,
      damageTotal: Number(damageRoll.total),
      halfDamage,
      damageBreakdown: buildSuppressiveDamageBreakdown({
        damageRoll,
        statModifier,
        damageBonus,
      }),
      results,
    };

    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor, token: attacker.document }),
      content: await buildSuppressiveChatContent({ weapon, damageRoll, context }),
      rolls,
      flags: { [MODULE_ID]: { [SUPPRESSIVE_FLAG]: context } },
    };
    getDocumentClass("ChatMessage").applyRollMode(
      chatData,
      game.settings.get("core", "rollMode"),
    );
    await getDocumentClass("ChatMessage").create(chatData);
  } catch (error) {
    console.error(`${MODULE_ID} | Suppressive fire failed`, error);
    ui.notifications?.error(game.i18n.localize("CWNCE.Suppress.Errors.Failed"));
  } finally {
    setTimeout(() => deleteTemplate(template), 8000);
  }
}

function resolveAttacker(actor) {
  return canvas.tokens.controlled.find((token) => token.actor?.id === actor.id)
    ?? actor.getActiveTokens?.().find(
      (token) => token.document?.parent?.id === canvas.scene?.id,
    )
    ?? null;
}

function hasSuppressiveAmmo(ammo) {
  if (ammo?.type === "infinite") return true;
  return ammo?.type !== "none" && (finiteNumber(ammo?.value) ?? 0) >= 2;
}

async function spendSuppressiveAmmo(weapon, ammo) {
  if (ammo.type === "infinite") return;
  const current = finiteNumber(ammo.value) ?? 0;
  await weapon.update({ "system.ammo.value": Math.max(0, current - 2) });
}

function directionDegrees(origin, target) {
  return (Math.atan2(target.y - origin.y, target.x - origin.x) * 180 / Math.PI + 360) % 360;
}

function findTokensInCone({ attacker, direction, rangeMeters }) {
  return canvas.tokens.placeables.filter((token) => {
    if (!token.actor || token.id === attacker.id) return false;
    if (token.document.hidden) return false;
    const distance = measureTokenDistanceMeters(attacker, token);
    if (distance === null || distance > rangeMeters) return false;
    const targetDirection = directionDegrees(attacker.center, token.center);
    return angularDifference(direction, targetDirection) <= 45;
  });
}

function angularDifference(first, second) {
  return Math.abs(((first - second + 540) % 360) - 180);
}

function measureTokenDistanceMeters(attacker, target) {
  const measured = canvas.grid.measurePath([attacker.center, target.center], {
    gridSpaces: true,
  });
  const value = finiteNumber(measured.distance);
  const factor = unitToMetersFactor(canvas.scene.grid.units);
  return value === null || factor === null ? null : value * factor;
}

function unitToMetersFactor(units) {
  const normalized = String(units ?? "m").trim().toLowerCase();
  const factors = {
    m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
    ft: 0.3048, foot: 0.3048, feet: 0.3048,
    km: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000,
    mi: 1609.344, mile: 1609.344, miles: 1609.344,
    yd: 0.9144, yard: 0.9144, yards: 0.9144,
  };
  return normalized in factors ? factors[normalized] : null;
}

async function createTemporaryCone({ attacker, direction, rangeMeters }) {
  const factor = unitToMetersFactor(canvas.scene.grid.units);
  if (factor === null) return null;
  try {
    const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: CONST.MEASURED_TEMPLATE_TYPES?.CONE ?? "cone",
      user: game.user.id,
      x: attacker.center.x,
      y: attacker.center.y,
      direction,
      distance: rangeMeters / factor,
      angle: 90,
      fillColor: game.user.color?.css ?? String(game.user.color ?? "#ff6400"),
      flags: { [MODULE_ID]: { suppressivePreview: true } },
    }]);
    return template;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not create suppressive cone preview`, error);
    return null;
  }
}

async function deleteTemplate(template) {
  if (!template) return;
  try {
    await template.delete();
  } catch (_error) {
    /* The user may already have deleted the temporary template. */
  }
}

async function confirmSuppressiveTargets({ affected, weaponName, attackerProne }) {
  const rows = affected.map((token) => `
    <label class="cwnce-cover-choice">
      <input type="checkbox" data-token-id="${escapeHtml(token.id)}">
      <span>${escapeHtml(token.name)}</span>
      <small>${escapeHtml(game.i18n.localize("CWNCE.Suppress.Dialog.HardCover"))}</small>
    </label>`).join("");
  const content = `
    <form class="cwnce-suppress-confirmation">
      <p>${escapeHtml(game.i18n.format("CWNCE.Suppress.Dialog.ConfirmText", { weapon: weaponName }))}</p>
      <label class="cwnce-braced-choice">
        <input type="checkbox" name="braced" ${attackerProne ? "checked" : ""}>
        ${escapeHtml(game.i18n.localize("CWNCE.Suppress.Dialog.Braced"))}
      </label>
      <fieldset>
        <legend>${escapeHtml(game.i18n.localize("CWNCE.Suppress.Dialog.Affected"))}</legend>
        ${rows}
      </fieldset>
    </form>`;

  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("CWNCE.Suppress.Dialog.Title") },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "resolve",
        label: game.i18n.localize("CWNCE.Suppress.Dialog.Resolve"),
        default: true,
        callback: (_event, button) => ({
          braced: Boolean(button.form.elements.braced?.checked),
          hardCover: new Set(
            Array.from(button.form.querySelectorAll("[data-token-id]:checked"))
              .map((input) => input.dataset.tokenId),
          ),
        }),
      },
      {
        action: "cancel",
        label: game.i18n.localize("Cancel"),
        callback: () => null,
      },
    ],
  });
}

function readEvasionTarget(actor) {
  if (actor?.type === "character") return finiteNumber(actor.system?.save?.evasion);
  if (actor?.type === "npc") return finiteNumber(actor.system?.saves);
  return finiteNumber(actor?.system?.save?.evasion ?? actor?.system?.saves);
}

async function rollSuppressiveTrauma({ weaponModel, targetActor }) {
  const formula = String(weaponModel.trauma?.die ?? "").trim();
  const rating = finiteNumber(weaponModel.trauma?.rating);
  const target = finiteNumber(
    targetActor.system?.modifiedTraumaTarget ?? targetActor.system?.traumaTarget,
  );
  if (
    !game.settings.get("swnr", "useTrauma")
    || !formula
    || formula === "-"
    || formula.toLowerCase() === "none"
    || rating === null
    || target === null
  ) {
    return { roll: null, total: null, target, rating, traumatic: false };
  }
  const roll = await new Roll(formula).roll();
  const total = Number(roll.total);
  return { roll, total, target, rating, traumatic: total >= target };
}

function buildTargetReference(token) {
  return {
    sceneId: canvas.scene.id,
    tokenId: token.id,
    name: token.name,
  };
}

async function buildSuppressiveChatContent({ weapon, damageRoll, context }) {
  const card = document.createElement("div");
  card.className = "chat-card cwnce-suppressive-card";

  const heading = document.createElement("h4");
  heading.textContent = game.i18n.format("CWNCE.Suppress.Chat.Title", { weapon: weapon.name });
  card.append(heading);

  const summary = document.createElement("div");
  summary.className = "cwnce-suppressive-summary";
  summary.textContent = game.i18n.format("CWNCE.Suppress.Chat.Summary", {
    range: context.rangeMeters,
    ammo: context.ammoSpent,
  });
  card.append(summary);

  const damageLabel = document.createElement("strong");
  damageLabel.textContent = game.i18n.localize("CWNCE.Suppress.Chat.Damage");
  const damage = document.createElement("div");
  damage.className = "cwnce-suppressive-roll";
  damage.innerHTML = await damageRoll.render();
  appendSuppressiveBreakdown(damage, context.damageBreakdown);
  const half = document.createElement("div");
  half.className = "cwnce-suppressive-half";
  half.textContent = game.i18n.format("CWNCE.Suppress.Chat.HalfDamage", {
    amount: context.halfDamage,
  });
  card.append(damageLabel, damage, half);

  const results = document.createElement("section");
  results.className = "cwnce-suppressive-results";
  for (const result of context.results) results.append(buildSuppressiveTarget(result));
  card.append(results);
  return card.outerHTML;
}

function buildSuppressiveTarget(result) {
  const target = document.createElement("article");
  target.className = `cwnce-suppressive-target cwnce-suppressive-${result.outcome}`;
  const name = document.createElement("div");
  name.className = "cwnce-target-name";
  name.textContent = result.name;
  target.append(name);

  if (result.saveRollHtml) {
    const row = document.createElement("div");
    row.className = "cwnce-suppressive-save";
    row.innerHTML = result.saveRollHtml;
    appendSuppressiveBreakdown(row, [
      {
        label: "CWNCE.Breakdown.EvasionDie",
        value: String(result.saveTotal),
        formula: result.saveFormula ?? "1d20",
      },
      {
        label: "CWNCE.Breakdown.SaveTarget",
        value: String(result.evasionTarget),
      },
      {
        label: "CWNCE.Breakdown.SaveResult",
        value: game.i18n.localize(
          result.outcome === "saved"
            ? "CWNCE.Breakdown.Success"
            : "CWNCE.Breakdown.Failure",
        ),
        total: true,
      },
    ]);
    const detail = document.createElement("span");
    detail.textContent = game.i18n.format("CWNCE.Suppress.Chat.SaveCheck", {
      roll: result.saveTotal,
      target: result.evasionTarget,
    });
    row.append(detail);
    target.append(row);
  }

  if (result.traumaRollHtml) {
    const row = document.createElement("div");
    row.className = "cwnce-suppressive-trauma-roll";
    row.innerHTML = result.traumaRollHtml;
    appendSuppressiveBreakdown(row, [
      {
        label: "CWNCE.Breakdown.TraumaDie",
        value: String(result.traumaRoll),
        formula: result.traumaFormula,
      },
      {
        label: "CWNCE.Breakdown.TraumaTarget",
        value: String(result.traumaTarget),
      },
      {
        label: "CWNCE.Breakdown.TraumaResult",
        value: game.i18n.localize(
          result.outcome === "trauma"
            ? "CWNCE.Breakdown.TraumaSuccess"
            : "CWNCE.Breakdown.NoTrauma",
        ),
        total: true,
      },
    ]);
    target.append(row);
  }

  const outcome = document.createElement("div");
  outcome.className = "cwnce-outcome";
  outcome.textContent = formatSuppressiveOutcome(result);
  target.append(outcome);
  return target;
}

function formatSuppressiveOutcome(result) {
  const keys = {
    cover: "CWNCE.Suppress.Chat.Cover",
    saved: "CWNCE.Suppress.Chat.Saved",
    manual: "CWNCE.Suppress.Chat.Manual",
    failed: "CWNCE.Suppress.Chat.Failed",
    trauma: "CWNCE.Suppress.Chat.Trauma",
  };
  if (result.outcome === "failed") {
    return game.i18n.format(keys.failed, { amount: result.amount });
  }
  if (result.outcome === "trauma") {
    return game.i18n.format(keys.trauma, {
      amount: result.amount,
      roll: result.traumaRoll,
      target: result.traumaTarget,
    });
  }
  return game.i18n.localize(keys[result.outcome] ?? keys.manual);
}

function buildSuppressiveDamageBreakdown({ damageRoll, statModifier, damageBonus }) {
  const stat = finiteNumber(statModifier) ?? 0;
  const bonus = finiteNumber(damageBonus) ?? 0;
  return [
    {
      label: "CWNCE.Breakdown.WeaponDamage",
      value: String(Number(damageRoll.total) - stat - bonus),
      formula: String(damageRoll.formula).split(/\s*\+\s*/)[0],
    },
    {
      label: "CWNCE.Breakdown.AttributeModifier",
      value: String(stat),
      modifier: true,
    },
    {
      label: "CWNCE.Breakdown.DamageBonus",
      value: String(bonus),
      modifier: true,
    },
    {
      label: "CWNCE.Breakdown.Total",
      value: String(damageRoll.total),
      total: true,
    },
  ];
}

function appendSuppressiveBreakdown(container, entries) {
  if (!entries?.length) return;
  const tooltip = container.querySelector(".dice-tooltip");
  if (!tooltip || tooltip.querySelector(".cwnce-modifier-breakdown")) return;

  const section = document.createElement("section");
  section.className = "cwnce-modifier-breakdown";
  const heading = document.createElement("h4");
  heading.textContent = game.i18n.localize("CWNCE.Breakdown.Heading");
  section.append(heading);

  const list = document.createElement("dl");
  for (const entry of entries) {
    const term = document.createElement("dt");
    term.textContent = game.i18n.localize(entry.label);
    if (entry.formula) {
      const formula = document.createElement("small");
      formula.textContent = ` (${entry.formula})`;
      term.append(formula);
    }

    const value = document.createElement("dd");
    value.textContent = entry.modifier
      ? formatSuppressiveSigned(Number(entry.value))
      : entry.value;
    if (entry.total) {
      term.classList.add("cwnce-breakdown-total");
      value.classList.add("cwnce-breakdown-total");
    }
    list.append(term, value);
  }
  section.append(list);
  tooltip.append(section);
}

function formatSuppressiveSigned(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function buildSuppressiveDamageAction(message, context) {
  const container = document.createElement("div");
  container.className = "cwnce-suppressive-action";
  const damageTargets = context.results.filter(
    (result) => result.outcome === "failed" || result.outcome === "trauma",
  );
  const existing = message.getFlag(MODULE_ID, SUPPRESSIVE_DAMAGE_FLAG);

  if (existing?.entries?.length) {
    const summary = document.createElement("div");
    summary.className = "cwnce-damage-applied";
    summary.textContent = game.i18n.format("CWNCE.Suppress.Chat.Applied", {
      count: existing.entries.length,
    });
    container.append(summary);
    return container;
  }
  if (!damageTargets.length) return container;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = game.i18n.format("CWNCE.Suppress.Chat.Apply", {
    count: damageTargets.length,
  });
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    await applySuppressiveDamage({ message, damageTargets });
  });
  container.append(button);
  return container;
}

async function applySuppressiveDamage({ message, damageTargets }) {
  if (message.getFlag(MODULE_ID, SUPPRESSIVE_DAMAGE_FLAG)?.entries?.length) {
    ui.notifications?.warn(game.i18n.localize("CWNCE.Chat.AlreadyApplied"));
    return;
  }
  if (!canvas.ready) {
    ui.notifications?.error(game.i18n.localize("CWNCE.Chat.SceneUnavailable"));
    return;
  }

  const controlled = canvas.tokens.controlled.map((token) => token.id);
  const entries = [];
  try {
    const applyHealthDrop = await getSwnrApplyHealthDrop();
    for (const result of damageTargets) {
      if (result.sceneId !== canvas.scene.id) continue;
      const token = canvas.tokens.get(result.tokenId);
      if (!token?.actor || !Number.isFinite(Number(result.amount))) continue;
      canvas.tokens.releaseAll();
      token.control({ releaseOthers: false });
      await applyHealthDrop(Number(result.amount));
      entries.push({
        sceneId: result.sceneId,
        tokenId: result.tokenId,
        name: result.name,
        amount: Number(result.amount),
        outcome: result.outcome,
      });
      await message.setFlag(MODULE_ID, SUPPRESSIVE_DAMAGE_FLAG, {
        entries,
        userId: game.user.id,
        appliedAt: Date.now(),
      });
    }
    if (entries.length) {
      ui.notifications?.info(game.i18n.format("CWNCE.Suppress.Chat.Applied", {
        count: entries.length,
      }));
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to apply suppressive damage`, error);
    ui.notifications?.error(game.i18n.localize("CWNCE.Chat.DamageFailed"));
  } finally {
    canvas.tokens.releaseAll();
    for (const id of controlled) canvas.tokens.get(id)?.control({ releaseOthers: false });
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

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tokenHasStatus(tokenLike, statusId) {
  const token = tokenLike?.document ?? tokenLike;
  const actor = tokenLike?.actor ?? token?.actor;
  if (actor?.statuses?.has?.(statusId)) return true;

  return Array.from(actor?.effects ?? []).some((effect) => {
    if (effect.disabled || effect.isSuppressed) return false;
    if (effect.statuses?.has?.(statusId)) return true;
    return effect.getFlag?.("core", "statusId") === statusId;
  });
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
