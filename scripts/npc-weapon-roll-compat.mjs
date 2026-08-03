/**
 * SWNR NPC weapon-roll compatibility.
 *
 * SWNR stores a remembered weapon skill as an actor-owned Item ID. When a PC
 * weapon is copied to an NPC, that ID cannot resolve on the NPC. SWNR then
 * warns and substitutes -2. NPCs do not use PC skills, so route only NPC
 * weapon rolls through SWNR's ordinary dialog path.
 *
 * Content Pack weapons deliberately store `system.skill` as SWNR's portable
 * `ask` value: a compendium cannot know the ID of the receiving actor's Shoot
 * or Stab Item. Its semantic skill name is stored in an opt-in Content Pack
 * flag. When such a weapon belongs to a character, resolve that name to the
 * matching actor-owned Skill ID without altering untagged or custom weapons.
 */

export const NPC_WEAPON_ROLL_PATCH = Symbol.for(
  "cwn-combat-enhancements.npcWeaponRollCompatibility",
);

const MODULE_ID = "cwn-combat-enhancements";
const CONTENT_PACK_SCOPE = "harbour-city-stories";
const SKILL_PROMPT = "ask";

export function shouldUseNativeNpcWeaponDialog(weaponData) {
  return weaponData?.parent?.actor?.type === "npc";
}

export function getContentPackNativeSkillName(item) {
  const name = item?.flags?.[CONTENT_PACK_SCOPE]?.nativeSkill;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function findActorSkillByName(actor, skillName) {
  if (!actor || !skillName) return null;
  const normalized = skillName.trim().toLocaleLowerCase();
  const skills = actor.itemTypes?.skill ?? Array.from(actor.items ?? []).filter(
    (item) => item.type === "skill",
  );
  return skills.find(
    (skill) => skill.name?.trim?.().toLocaleLowerCase() === normalized,
  ) ?? null;
}

export function shouldBindCharacterWeaponSkill(item) {
  return (
    item?.type === "weapon" &&
    item.actor?.type === "character" &&
    item.system?.skill === SKILL_PROMPT &&
    getContentPackNativeSkillName(item) !== null
  );
}

export async function bindCharacterWeaponSkill(item) {
  if (!shouldBindCharacterWeaponSkill(item)) return null;
  const skill = findActorSkillByName(item.actor, getContentPackNativeSkillName(item));
  if (!skill?.id) return null;
  await item.update({ "system.skill": skill.id });
  return skill.id;
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
  prototype.roll = async function cwnNpcCompatibleWeaponRoll(...args) {
    if (shouldUseNativeNpcWeaponDialog(this)) {
      // `true` is SWNR's own "ask instead of remembered settings" path. It
      // preserves native NPC attack bonus, manual modifier, Burst, damage, and
      // ammunition handling, while never resolving a copied PC skill ID.
      return originalRoll.call(this, true);
    }
    await bindCharacterWeaponSkill(this?.parent);
    return originalRoll.apply(this, args);
  };

  return { installed: true, alreadyInstalled: false };
}
