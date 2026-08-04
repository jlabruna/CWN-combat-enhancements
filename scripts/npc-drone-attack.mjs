/**
 * Pilot-aware handling for SWNR drone weapon attacks.
 *
 * SWNR drones store their pilot as the first `system.crewMembers` Actor ID and
 * expose the resolved Actor as `system.pilot`. NPC pilots use their complete
 * ranged Attack Bonus. Character pilots use Attack Bonus plus the better of
 * Dexterity/Intelligence and Drive/Program. In both cases the contribution is
 * substituted only for To Hit while SWNR retains every later roll step.
 */

const MODULE_ID = "cwn-combat-enhancements";
const DRONE_TYPE = "drone";
const NPC_TYPE = "npc";
const CHARACTER_TYPE = "character";

export const NPC_DRONE_ATTACK_PATCH = Symbol.for(
  `${MODULE_ID}.npcDroneAttackCompatibility`,
);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveNativeDronePilot(actor, gameRef = globalThis.game) {
  if (actor?.type !== DRONE_TYPE) {
    return { kind: "not-drone", pilot: null };
  }

  const crewId = actor.system?.crewMembers?.[0] ?? null;
  const pilot = actor.system?.pilot ?? (crewId ? gameRef?.actors?.get?.(crewId) : null);
  if (!pilot) return { kind: "invalid", pilot: null, crewId };
  if (pilot.type === NPC_TYPE) return { kind: "npc", pilot, crewId };
  if (pilot.type === CHARACTER_TYPE) return { kind: "character", pilot, crewId };
  return { kind: "invalid", pilot, crewId };
}

export function getNpcDroneAttackContext(weaponModel, gameRef = globalThis.game) {
  const actor = weaponModel?.parent?.actor;
  const relationship = resolveNativeDronePilot(actor, gameRef);
  if (relationship.kind !== "npc") return { ...relationship, actor };
  return {
    ...relationship,
    actor,
    pilotBonus: finiteNumber(relationship.pilot.system?.ab),
  };
}

function findPilotSkill(pilot, name) {
  const wanted = String(name).trim().toLocaleLowerCase();
  return (pilot?.itemTypes?.skill ?? []).find(
    (skill) => String(skill?.name ?? "").trim().toLocaleLowerCase() === wanted,
  ) ?? null;
}

export function resolveCharacterPilotAttack(pilot) {
  if (pilot?.type !== CHARACTER_TYPE) return null;

  const dexterity = finiteNumber(pilot.system?.stats?.dex?.mod);
  const intelligence = finiteNumber(pilot.system?.stats?.int?.mod);
  const attribute = intelligence > dexterity
    ? { key: "int", label: "Intelligence", value: intelligence }
    : { key: "dex", label: "Dexterity", value: dexterity };

  const driveItem = findPilotSkill(pilot, "Drive");
  const programItem = findPilotSkill(pilot, "Program");
  if (!driveItem && !programItem) return null;

  const drive = driveItem ? finiteNumber(driveItem.system?.rank, -1) : null;
  const program = programItem ? finiteNumber(programItem.system?.rank, -1) : null;
  // Program wins equal-rank ties. If one Item is absent, use the Skill that is
  // actually represented by the character rather than fabricating a rank.
  const skill = drive != null && (program == null || drive > program)
    ? { key: "drive", label: "Drive", value: drive }
    : { key: "program", label: "Program", value: program };
  const attackBonus = finiteNumber(pilot.system?.ab);

  return {
    pilot,
    attackBonus,
    attribute,
    skill,
    pilotTotal: attackBonus + attribute.value + skill.value,
    // SWNR has no unambiguous per-attack control-board state. Recognising the
    // native RCU Item is informational only; neither path adds a bonus/penalty.
    hasRemoteControlUnit: (pilot.itemTypes?.cyberware ?? pilot.items ?? []).some(
      (item) => item?.type === "cyberware" &&
        String(item?.name ?? "").trim().toLocaleLowerCase() === "remote control unit",
    ),
  };
}

export function getDroneAttackContext(weaponModel, gameRef = globalThis.game) {
  const actor = weaponModel?.parent?.actor;
  const relationship = resolveNativeDronePilot(actor, gameRef);
  if (relationship.kind === "npc") {
    return {
      ...relationship,
      actor,
      pilotBonus: finiteNumber(relationship.pilot.system?.ab),
    };
  }
  if (relationship.kind === "character") {
    const calculation = resolveCharacterPilotAttack(relationship.pilot);
    return { ...relationship, actor, calculation };
  }
  return { ...relationship, actor };
}

export function buildNpcDroneAttackDialogContent({ actorId = "", canBurst = false } = {}) {
  return `<form class="flex cwnce-npc-drone-attack-dialog">
    <input type="hidden" name="actorId" value="${String(actorId).replaceAll('"', "&quot;")}">
    <div class="flex flex-col">
      <div class="flex flexrow p-2 gap-2">
        ${canBurst ? `<div class="flex flex-col">
          <label for="burstFire">Burst Fire:</label>
          <input type="checkbox" name="burstFire" id="burstFire">
        </div>` : ""}
        <div class="flex flex-col">
          <label for="modifier">Modifier:</label>
          <input name="modifier" type="number" step="1" value="0">
        </div>
      </div>
    </div>
  </form>`;
}

function signed(value) {
  const number = finiteNumber(value);
  return number >= 0 ? `+${number}` : String(number);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildCharacterDroneAttackDialogContent({
  actorId = "",
  canBurst = false,
  calculation,
} = {}) {
  return `<form class="flex cwnce-npc-drone-attack-dialog">
    <input type="hidden" name="actorId" value="${String(actorId).replaceAll('"', "&quot;")}">
    <div class="flex flex-col">
      <dl class="cwnce-drone-pilot-summary">
        <dt>Pilot</dt><dd>${escapeHtml(calculation?.pilot?.name)}</dd>
        <dt>Attack Bonus</dt><dd>${signed(calculation?.attackBonus)}</dd>
        <dt>Attribute</dt><dd>${calculation?.attribute?.label ?? ""} ${signed(calculation?.attribute?.value)}</dd>
        <dt>Skill</dt><dd>${calculation?.skill?.label ?? ""} ${signed(calculation?.skill?.value)}</dd>
        <dt>Pilot Total</dt><dd>${signed(calculation?.pilotTotal)}</dd>
      </dl>
      <div class="flex flexrow p-2 gap-2">
        ${canBurst ? `<div class="flex flex-col">
          <label for="burstFire">Burst Fire:</label>
          <input type="checkbox" name="burstFire" id="burstFire">
        </div>` : ""}
        <div class="flex flex-col">
          <label for="modifier">Modifier:</label>
          <input name="modifier" type="number" step="1" value="0">
        </div>
      </div>
    </div>
  </form>`;
}

/**
 * Supply the NPC pilot bonus through SWNR's actor Attack Bonus term. The
 * override lasts only until SWNR synchronously captures getRollData(), so the
 * native damage formula receives Stat 0 and cannot add the pilot bonus.
 */
export function callNativeAttackWithNpcPilot({ weaponModel, pilotBonus, args }) {
  const actor = weaponModel?.parent?.actor;
  const getRollData = actor?.getRollData;
  if (!actor || typeof getRollData !== "function" || typeof weaponModel?.rollAttack !== "function") {
    throw new Error("SWNR drone attack data is unavailable.");
  }

  const ownDescriptor = Object.getOwnPropertyDescriptor(actor, "getRollData");
  Object.defineProperty(actor, "getRollData", {
    configurable: true,
    value(...rollArgs) {
      return {
        ...getRollData.apply(this, rollArgs),
        ab: finiteNumber(pilotBonus),
        // SWNR substitutes meleeAb for ab on melee-tagged weapons while CWN
        // Armor is enabled. NPC-controlled drones still use their pilot's
        // complete ranged Attack Bonus under this simplified rule.
        meleeAb: finiteNumber(pilotBonus),
      };
    },
  });

  try {
    // An async function runs synchronously until its first await. SWNR captures
    // actor.getRollData() before that boundary, after which this override can
    // be removed without affecting the pending native attack.
    return weaponModel.rollAttack(...args);
  } finally {
    if (ownDescriptor) Object.defineProperty(actor, "getRollData", ownDescriptor);
    else delete actor.getRollData;
  }
}

export async function rollNpcPilotedDroneAttack({
  weaponModel,
  pilotBonus,
  gameRef = globalThis.game,
  dialogApi = globalThis.foundry?.applications?.api?.DialogV2,
} = {}) {
  if (!dialogApi?.wait) throw new Error("Foundry DialogV2 is unavailable.");

  const actor = weaponModel.parent.actor;
  const title = gameRef.i18n.format("swnr.dialog.attackRoll", {
    actorName: actor.name,
    weaponName: weaponModel.parent.name,
  });
  const ammo = weaponModel.ammo;
  const canBurst = Boolean(
    ammo?.burst && ammo.type !== "none" && ammo.type !== "infinite" && ammo.value >= 3,
  ) || Boolean(ammo?.burst && ammo.type === "infinite");

  return dialogApi.wait({
    window: { title },
    content: buildNpcDroneAttackDialogContent({ actorId: actor.id, canBurst }),
    modal: false,
    rejectClose: false,
    buttons: [{
      label: gameRef.i18n.localize("swnr.chat.roll"),
      callback: async (_event, button) => {
        const modifier = finiteNumber(button.form.elements.modifier?.value);
        const burst = Boolean(button.form.elements.burstFire?.checked);
        return callNativeAttackWithNpcPilot({
          weaponModel,
          pilotBonus,
          // damageBonus, Stat and Skill are deliberately zero. The pilot's
          // complete ranged Attack Bonus is already in actor.ab for To Hit.
          args: [0, 0, 0, modifier, burst],
        });
      },
    }],
  });
}

export async function rollCharacterPilotedDroneAttack({
  weaponModel,
  calculation,
  gameRef = globalThis.game,
  dialogApi = globalThis.foundry?.applications?.api?.DialogV2,
} = {}) {
  if (!dialogApi?.wait) throw new Error("Foundry DialogV2 is unavailable.");

  const actor = weaponModel.parent.actor;
  const title = gameRef.i18n.format("swnr.dialog.attackRoll", {
    actorName: actor.name,
    weaponName: weaponModel.parent.name,
  });
  const ammo = weaponModel.ammo;
  const canBurst = Boolean(
    ammo?.burst && ammo.type !== "none" && ammo.type !== "infinite" && ammo.value >= 3,
  ) || Boolean(ammo?.burst && ammo.type === "infinite");

  return dialogApi.wait({
    window: { title },
    content: buildCharacterDroneAttackDialogContent({ actorId: actor.id, canBurst, calculation }),
    modal: false,
    rejectClose: false,
    buttons: [{
      label: gameRef.i18n.localize("swnr.chat.roll"),
      callback: async (_event, button) => {
        const modifier = finiteNumber(button.form.elements.modifier?.value);
        const burst = Boolean(button.form.elements.burstFire?.checked);
        return callNativeAttackWithNpcPilot({
          weaponModel,
          pilotBonus: calculation.pilotTotal,
          // Pilot AB, attribute and Skill are carried only by actor.ab. Passing
          // Stat 0 prevents the chosen attribute from increasing damage/Shock.
          args: [0, 0, 0, modifier, burst],
        });
      },
    }],
  });
}

export function stripDroneAttackDescription(content) {
  if (typeof content !== "string") return content;
  // SWNR's attack-roll template injects weapon.system.description only as the
  // weapon heading's title attribute. Remove that distinct field from this
  // qualifying attack message; normal Item-posted description cards bypass
  // this function entirely.
  return content.replace(
    /(<div\b[^>]*class="[^"]*\bchat-card\b[^"]*\bitem-card\b[^"]*"[^>]*>[\s\S]*?<h4)\s+title="[^"]*"/iu,
    "$1",
  );
}

export function installNpcDroneAttackCompatibility({
  gameRef = globalThis.game,
  config = globalThis.CONFIG,
  notifications = globalThis.ui?.notifications,
  dialogApi = globalThis.foundry?.applications?.api?.DialogV2,
  logger = console,
} = {}) {
  if (gameRef?.system?.id !== "swnr") {
    return { installed: false, reason: "unexpected-system" };
  }

  const prototype = config?.Item?.dataModels?.weapon?.prototype;
  const originalRoll = prototype?.roll;
  if (!prototype || typeof originalRoll !== "function" || typeof prototype.rollAttack !== "function") {
    logger.warn(
      `${MODULE_ID} | SWNR weapon roll methods are unavailable; drone pilot attack compatibility was not installed.`,
    );
    return { installed: false, reason: "missing-roll-methods" };
  }
  if (prototype[NPC_DRONE_ATTACK_PATCH]) {
    return { installed: true, alreadyInstalled: true };
  }

  Object.defineProperty(prototype, NPC_DRONE_ATTACK_PATCH, { value: true });
  prototype.roll = async function cwnNpcPilotedDroneWeaponRoll(...args) {
    const context = getDroneAttackContext(this, gameRef);
    if (context.kind === "not-drone") {
      return originalRoll.apply(this, args);
    }
    if (context.kind === "npc") {
      return rollNpcPilotedDroneAttack({
        weaponModel: this,
        pilotBonus: context.pilotBonus,
        gameRef,
        dialogApi,
      });
    }
    if (context.kind === "character" && context.calculation) {
      return rollCharacterPilotedDroneAttack({
        weaponModel: this,
        calculation: context.calculation,
        gameRef,
        dialogApi,
      });
    }
    if (context.kind === "character") {
      notifications?.warn("Unable to resolve this drone pilot's Drive or Program skill.");
      return undefined;
    }
    notifications?.warn("This drone has no valid pilot assigned.");
    return undefined;
  };

  return { installed: true, alreadyInstalled: false };
}
