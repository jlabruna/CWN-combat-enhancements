/**
 * Simplified linked-NPC pilot handling for SWNR drone weapon attacks.
 *
 * SWNR drones store their pilot as the first `system.crewMembers` Actor ID and
 * expose the resolved Actor as `system.pilot`. NPC pilots do not have PC-style
 * Stats or Skills, so their complete ranged Attack Bonus is substituted only
 * for the attack roll while SWNR retains ownership of every later roll step.
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
      `${MODULE_ID} | SWNR weapon roll methods are unavailable; NPC drone attack compatibility was not installed.`,
    );
    return { installed: false, reason: "missing-roll-methods" };
  }
  if (prototype[NPC_DRONE_ATTACK_PATCH]) {
    return { installed: true, alreadyInstalled: true };
  }

  Object.defineProperty(prototype, NPC_DRONE_ATTACK_PATCH, { value: true });
  prototype.roll = async function cwnNpcPilotedDroneWeaponRoll(...args) {
    const context = getNpcDroneAttackContext(this, gameRef);
    if (context.kind === "not-drone" || context.kind === "character") {
      return originalRoll.apply(this, args);
    }
    if (context.kind !== "npc") {
      notifications?.warn("This drone has no valid NPC pilot assigned.");
      return undefined;
    }
    return rollNpcPilotedDroneAttack({
      weaponModel: this,
      pilotBonus: context.pilotBonus,
      gameRef,
      dialogApi,
    });
  };

  return { installed: true, alreadyInstalled: false };
}
