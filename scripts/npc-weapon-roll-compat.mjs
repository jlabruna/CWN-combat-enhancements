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
 * matching actor-owned Skill ID and restore its intended native Stat if SWNR
 * imported it as `ask`, without altering untagged or custom weapons.
 */

export const NPC_WEAPON_ROLL_PATCH = Symbol.for(
  "cwn-combat-enhancements.npcWeaponRollCompatibility",
);

const MODULE_ID = "cwn-combat-enhancements";
const CONTENT_PACK_SCOPE = "harbour-city-stories";
const SKILL_PROMPT = "ask";
const STAT_PROMPT = "ask";
const NATIVE_STATS = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const LEGACY_SKILL_STATS = new Map([
  ["shoot", "dex"],
  ["stab", "str"],
]);

export function shouldUseNativeNpcWeaponDialog(weaponData) {
  return weaponData?.parent?.actor?.type === "npc";
}

export function getContentPackNativeSkillName(item) {
  const name = item?.flags?.[CONTENT_PACK_SCOPE]?.nativeSkill;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function getContentPackNativeStat(item) {
  const stat = item?.flags?.[CONTENT_PACK_SCOPE]?.nativeStat;
  if (typeof stat === "string" && NATIVE_STATS.has(stat)) return stat;

  // Content Pack 0.7.5 introduced the trusted semantic Skill marker before
  // nativeStat was added. Preserve compatibility with those generated pack
  // entries and actor copies: CWN firearms use Shoot/Dexterity and melee or
  // thrown weapons use Stab/Strength. Explicit nativeStat always wins, which
  // keeps exceptional mappings such as Mortar/Wisdom authoritative.
  const baseWeapon = item?.flags?.[CONTENT_PACK_SCOPE]?.baseWeapon;
  if (baseWeapon === "Mortar") return "wis";

  const skillName = getContentPackNativeSkillName(item)?.toLocaleLowerCase();
  return skillName ? LEGACY_SKILL_STATS.get(skillName) ?? null : null;
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

export function shouldBindCharacterWeaponRollDefaults(item) {
  const hasPortableSkill = (
    item?.system?.skill === SKILL_PROMPT &&
    getContentPackNativeSkillName(item) !== null
  );
  const hasPortableStat = (
    item?.system?.stat === STAT_PROMPT &&
    getContentPackNativeStat(item) !== null
  );
  return (
    item?.type === "weapon" &&
    item.actor?.type === "character" &&
    (hasPortableSkill || hasPortableStat)
  );
}

export async function bindCharacterWeaponRollDefaults(item) {
  if (!shouldBindCharacterWeaponRollDefaults(item)) return null;

  const changes = {};
  const skill = item.system?.skill === SKILL_PROMPT
    ? findActorSkillByName(item.actor, getContentPackNativeSkillName(item))
    : null;
  const nativeStat = getContentPackNativeStat(item);

  if (skill?.id) changes["system.skill"] = skill.id;
  if (item.system?.stat === STAT_PROMPT && nativeStat) {
    changes["system.stat"] = nativeStat;
  }
  if (!Object.keys(changes).length) return null;

  await item.update(changes);
  return changes;
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
    const item = this?.parent;
    const changes = await bindCharacterWeaponRollDefaults(item);

    // Item.update() rebuilds Foundry's embedded System DataModel. Calling
    // SWNR with the pre-update model leaves `this.stat`/`this.skill` at their
    // old portable `ask` values for the entire dialog callback. Use the
    // document's current model after binding so the dialog and eventual roll
    // both see the restored Content Pack defaults. This is especially visible
    // on the second attack, after SWNR has also updated the weapon's ammo.
    const currentModel = changes && item?.system ? item.system : this;
    return originalRoll.apply(currentModel, args);
  };

  return { installed: true, alreadyInstalled: false };
}
