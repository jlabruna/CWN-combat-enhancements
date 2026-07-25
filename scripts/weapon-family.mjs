export const MODULE_ID = "cwn-combat-enhancements";

export const FAMILY_EDITING_MODES = Object.freeze({
  GM_ONLY: "gm-only",
  ITEM_OWNERS: "item-owners",
  NOBODY: "nobody",
});

export const WEAPON_FAMILIES = Object.freeze([
  { key: "advanced-big-sword", label: "Advanced Big Sword" },
  { key: "advanced-club", label: "Advanced Club" },
  { key: "advanced-knife", label: "Advanced Knife" },
  { key: "advanced-sword", label: "Advanced Sword" },
  { key: "anti-materiel-rifle", label: "Anti-Materiel Rifle" },
  { key: "automatic-rifle", label: "Automatic Rifle" },
  { key: "big-sword", label: "Big Sword" },
  { key: "club", label: "Club" },
  { key: "combat-rifle", label: "Combat Rifle" },
  { key: "combat-shotgun", label: "Combat Shotgun" },
  { key: "heavy-machine-gun", label: "Heavy Machine Gun" },
  { key: "heavy-pistol", label: "Heavy Pistol" },
  { key: "knife", label: "Knife" },
  { key: "light-pistol", label: "Light Pistol" },
  { key: "mortar", label: "Mortar" },
  { key: "rifle", label: "Rifle" },
  { key: "rocket-launcher", label: "Rocket Launcher" },
  { key: "semi-auto-shotgun", label: "Semi-Auto Shotgun" },
  { key: "shotgun", label: "Shotgun" },
  { key: "sniper-rifle", label: "Sniper Rifle" },
  { key: "spear", label: "Spear" },
  { key: "submachine-gun", label: "Submachine Gun" },
  { key: "sword", label: "Sword" },
  { key: "taser-pistol", label: "Taser Pistol" },
]);

const FAMILY_LABELS = new Map(WEAPON_FAMILIES.map(({ key, label }) => [key, label]));
const LEGACY_BASE_WEAPON_FAMILIES = new Map(
  WEAPON_FAMILIES.map(({ key, label }) => [label.toLocaleLowerCase(), key]),
);

export class MagazineReloadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MagazineReloadError";
    this.code = code;
  }
}

export function normalizeFamilyKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLocaleLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ? key : null;
}

export function familyLabel(key) {
  return FAMILY_LABELS.get(key) ?? key ?? "";
}

export function resolveWeaponFamily(item) {
  return (
    normalizeFamilyKey(readFlag(item, MODULE_ID, "weaponFamily"))
    ?? normalizeFamilyKey(readFlag(item, "cwn-content-pack", "weaponFamily"))
    ?? resolveLegacyBaseWeapon(readFlag(item, "harbour-city-stories", "baseWeapon"))
  );
}

export function resolveMagazineFamily(item) {
  return (
    normalizeFamilyKey(readFlag(item, MODULE_ID, "magazineFamily"))
    ?? normalizeFamilyKey(readFlag(item, "cwn-content-pack", "magazineFamily"))
  );
}

export function isCountBasedMagazine(item) {
  const uses = item?.system?.uses;
  return Boolean(
    item?.type === "item"
    && uses?.consumable === "count"
    && finiteNumber(uses.max) > 0
    && finiteNumber(uses.value) > 0,
  );
}

export function compatibleMagazines(items, weaponFamily) {
  const family = normalizeFamilyKey(weaponFamily);
  if (!family) return [];
  return Array.from(items ?? []).filter(
    (item) =>
      isCountBasedMagazine(item)
      && resolveMagazineFamily(item) === family,
  );
}

export function formatMagazineOption(item) {
  const current = Math.max(0, finiteNumber(item?.system?.uses?.value) ?? 0);
  const maximum = Math.max(0, finiteNumber(item?.system?.uses?.max) ?? 0);
  return `${item?.name ?? "Magazine"} — ${current}/${maximum}`;
}

export function calculateMagazineTransfer({
  weaponCurrent,
  weaponMaximum,
  magazineCurrent,
  magazineMaximum,
}) {
  const weaponMax = Math.max(0, finiteNumber(weaponMaximum) ?? 0);
  const weaponValue = Math.min(
    weaponMax,
    Math.max(0, finiteNumber(weaponCurrent) ?? 0),
  );
  const magazineMax = Math.max(0, finiteNumber(magazineMaximum) ?? 0);
  const magazineValue = Math.min(
    magazineMax,
    Math.max(0, finiteNumber(magazineCurrent) ?? 0),
  );
  const roundsTransferred = Math.min(
    weaponMax - weaponValue,
    magazineValue,
  );

  return {
    weaponCurrent: weaponValue,
    weaponMaximum: weaponMax,
    magazineCurrent: magazineValue,
    magazineMaximum: magazineMax,
    roundsTransferred,
    weaponAfter: weaponValue + roundsTransferred,
    magazineAfter: magazineValue - roundsTransferred,
  };
}

export async function transferMagazineRounds({ actor, weapon, magazine }) {
  const currentWeapon = actor?.items?.get?.(weapon?.id);
  const currentMagazine = actor?.items?.get?.(magazine?.id);
  if (
    !actor
    || !currentWeapon
    || !currentMagazine
    || currentWeapon.parent !== actor
    || currentMagazine.parent !== actor
  ) {
    throw new MagazineReloadError(
      "not-embedded",
      "The weapon and magazine must belong to the same actor.",
    );
  }

  const weaponFamily = resolveWeaponFamily(currentWeapon);
  const magazineFamily = resolveMagazineFamily(currentMagazine);
  if (!weaponFamily || weaponFamily !== magazineFamily) {
    throw new MagazineReloadError(
      "wrong-family",
      "The selected magazine is not compatible with this weapon family.",
    );
  }
  if (!isCountBasedMagazine(currentMagazine)) {
    throw new MagazineReloadError(
      "invalid-magazine",
      "The selected item is not a non-empty count-based magazine.",
    );
  }

  const transfer = calculateMagazineTransfer({
    weaponCurrent: currentWeapon.system?.ammo?.value,
    weaponMaximum: currentWeapon.system?.ammo?.max,
    magazineCurrent: currentMagazine.system?.uses?.value,
    magazineMaximum: currentMagazine.system?.uses?.max,
  });
  if (transfer.weaponMaximum <= 0) {
    throw new MagazineReloadError(
      "invalid-weapon",
      "The weapon has no positive ammunition capacity.",
    );
  }
  if (transfer.roundsTransferred <= 0) {
    throw new MagazineReloadError(
      transfer.weaponAfter >= transfer.weaponMaximum ? "weapon-full" : "empty-magazine",
      "No rounds can be transferred.",
    );
  }

  const weaponUpdate = {
    _id: currentWeapon.id,
    "system.ammo.value": transfer.weaponAfter,
  };
  if (transfer.magazineAfter === 0) {
    weaponUpdate["system.ammo.current"] = "";
  }

  await actor.updateEmbeddedDocuments("Item", [
    weaponUpdate,
    {
      _id: currentMagazine.id,
      "system.uses.value": transfer.magazineAfter,
    },
  ]);

  if (transfer.magazineAfter === 0) {
    await actor.deleteEmbeddedDocuments("Item", [currentMagazine.id]);
  }

  return {
    ...transfer,
    weaponId: currentWeapon.id,
    weaponName: currentWeapon.name,
    magazineId: currentMagazine.id,
    magazineName: currentMagazine.name,
    magazineDeleted: transfer.magazineAfter === 0,
  };
}

export function canEditWeaponFamily(item, user, mode) {
  if (!item || !user) return false;
  if (mode === FAMILY_EDITING_MODES.NOBODY) return false;
  if (user.isGM) return true;
  if (mode !== FAMILY_EDITING_MODES.ITEM_OWNERS) return false;
  return item.canUserModify?.(user, "update") === true;
}

export function readWeaponFamilyChange(changes) {
  const flatKey = `flags.${MODULE_ID}.weaponFamily`;
  const flatDeleteKey = `flags.${MODULE_ID}.-=weaponFamily`;
  if (Object.prototype.hasOwnProperty.call(changes ?? {}, flatKey)) {
    return { changed: true, value: changes[flatKey] };
  }
  if (Object.prototype.hasOwnProperty.call(changes ?? {}, flatDeleteKey)) {
    return { changed: true, value: null };
  }

  const moduleChanges = changes?.flags?.[MODULE_ID];
  if (!moduleChanges || typeof moduleChanges !== "object") {
    return { changed: false, value: undefined };
  }
  if (Object.prototype.hasOwnProperty.call(moduleChanges, "weaponFamily")) {
    return { changed: true, value: moduleChanges.weaponFamily };
  }
  if (Object.prototype.hasOwnProperty.call(moduleChanges, "-=weaponFamily")) {
    return { changed: true, value: null };
  }
  return { changed: false, value: undefined };
}

function resolveLegacyBaseWeapon(value) {
  if (typeof value !== "string") return null;
  return LEGACY_BASE_WEAPON_FAMILIES.get(value.trim().toLocaleLowerCase()) ?? null;
}

function readFlag(item, scope, key) {
  if (typeof item?.getFlag === "function") return item.getFlag(scope, key);
  return item?.flags?.[scope]?.[key];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
