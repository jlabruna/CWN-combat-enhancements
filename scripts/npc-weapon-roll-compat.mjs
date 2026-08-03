/**
 * SWNR NPC weapon-roll compatibility.
 *
 * SWNR stores a remembered weapon skill as an actor-owned Item ID. When a PC
 * weapon is copied to an NPC, that ID cannot resolve on the NPC. SWNR then
 * warns and substitutes -2. NPCs do not use PC skills, so route only NPC
 * weapon rolls through SWNR's ordinary dialog path and leave PC roll/remember
 * behaviour completely untouched.
 */

export const NPC_WEAPON_ROLL_PATCH = Symbol.for(
  "cwn-combat-enhancements.npcWeaponRollCompatibility",
);

const MODULE_ID = "cwn-combat-enhancements";

export function shouldUseNativeNpcWeaponDialog(weaponData) {
  return weaponData?.parent?.type === "npc";
}

export function installNpcWeaponRollCompatibility({
  gameRef = globalThis.game,
  config = globalThis.CONFIG,
  logger = console,
} = {}) {
  if (gameRef?.system?.id !== "swnr") {
    return { installed: false, reason: "unexpected-system" };
  }

  const prototype = config?.Item?.dataModels?.weapon?.prototype;
  const originalRoll = prototype?.roll;
  if (!prototype || typeof originalRoll !== "function") {
    logger.warn(
      `${MODULE_ID} | SWNR weapon roll data model is unavailable; NPC weapon-roll compatibility was not installed.`,
    );
    return { installed: false, reason: "missing-roll" };
  }
  if (prototype[NPC_WEAPON_ROLL_PATCH]) {
    return { installed: true, alreadyInstalled: true };
  }

  Object.defineProperty(prototype, NPC_WEAPON_ROLL_PATCH, { value: true });
  prototype.roll = function cwnNpcCompatibleWeaponRoll(...args) {
    if (shouldUseNativeNpcWeaponDialog(this)) {
      // `true` is SWNR's own "ask instead of remembered settings" path. It
      // preserves native NPC attack bonus, manual modifier, Burst, damage, and
      // ammunition handling, while never resolving a copied PC skill ID.
      return originalRoll.call(this, true);
    }
    return originalRoll.apply(this, args);
  };

  return { installed: true, alreadyInstalled: false };
}
