import {
  FAMILY_EDITING_MODES,
  MODULE_ID,
  WEAPON_FAMILIES,
  MagazineReloadError,
  calculateRoundsNeeded,
  canEditWeaponFamily,
  compatibleMagazines,
  familyLabel,
  formatMagazineOption,
  normalizeFamilyKey,
  qualifiesForExactMagazineHandling,
  readWeaponFamilyChange,
  resolveReloadMagazine,
  resolveWeaponFamily,
  transferMagazineRounds,
} from "./weapon-family.mjs";
import { renderReloadChatCard } from "./chat-card.mjs";

const SUPPORTED_SWNR_MINOR = "2.3";
const warnedCompatibilityMessages = new Set();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "weaponFamilyEditing", {
    name: "CWNCE.Settings.WeaponFamilyEditing.Name",
    hint: "CWNCE.Settings.WeaponFamilyEditing.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [FAMILY_EDITING_MODES.GM_ONLY]: "CWNCE.Settings.WeaponFamilyEditing.GmOnly",
      [FAMILY_EDITING_MODES.ITEM_OWNERS]: "CWNCE.Settings.WeaponFamilyEditing.ItemOwners",
      [FAMILY_EDITING_MODES.NOBODY]: "CWNCE.Settings.WeaponFamilyEditing.Nobody",
    },
    default: FAMILY_EDITING_MODES.GM_ONLY,
    restricted: true,
  });

  game.settings.register(MODULE_ID, "exactMagazineAutomation", {
    name: "CWNCE.Settings.ExactMagazineAutomation.Name",
    hint: "CWNCE.Settings.ExactMagazineAutomation.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
  });

  game.settings.register(MODULE_ID, "autoSelectCompatibleMagazine", {
    name: "CWNCE.Settings.AutoSelectCompatibleMagazine.Name",
    hint: "CWNCE.Settings.AutoSelectCompatibleMagazine.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
  });
});

Hooks.on("renderApplicationV2", (application, element) => {
  if (!isSupportedSwnr()) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  if (application.actor && typeof application._getEmbeddedDocument === "function") {
    installActorReloadHandlers(application, root);
  }

  const item = application.item ?? application.document;
  if (item?.type !== "weapon") return;

  if (root.querySelector(".cwnce-weapon-family-field")) return;
  enhanceWeaponSheet(application, item, root);
});

Hooks.on("preUpdateItem", (item, changes, _options, userId) => {
  if (!isSupportedSwnr() || item.type !== "weapon") return;
  const familyChange = readWeaponFamilyChange(changes);
  if (!familyChange.changed) return;

  const mode = game.settings.get(MODULE_ID, "weaponFamilyEditing");
  const user = game.users.get(userId);
  if (!canEditWeaponFamily(item, user, mode)) {
    if (userId === game.user.id) {
      ui.notifications?.error(
        game.i18n.localize("CWNCE.WeaponFamily.Errors.NotAuthorized"),
      );
    }
    return false;
  }

  if (
    familyChange.value !== null
    && familyChange.value !== ""
    && normalizeFamilyKey(familyChange.value) !== familyChange.value.trim()
  ) {
    if (userId === game.user.id) {
      ui.notifications?.error(
        game.i18n.localize("CWNCE.WeaponFamily.Errors.InvalidKey"),
      );
    }
    return false;
  }
});

Hooks.on("deleteItem", (item, _options, userId) => {
  if (
    !isSupportedSwnr()
    || userId !== game.user.id
    || !game.settings.get(MODULE_ID, "exactMagazineAutomation")
  ) return;
  clearDeletedMagazineReferences(item).catch((error) => {
    console.error(`${MODULE_ID} | Failed to clear a deleted magazine reference`, error);
  });
});

function installActorReloadHandlers(application, root) {
  for (const target of root.querySelectorAll('[data-action="reload"]')) {
    if (target.dataset.cwnceReloadHandler !== undefined) continue;
    target.dataset.cwnceReloadHandler = "";
    target.addEventListener("click", (event) => {
      const weapon = application._getEmbeddedDocument?.(target);
      if (!shouldUseExactMagazineReload(weapon)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      reloadFromSelectedMagazine({ application, event, weapon }).catch((error) => {
        console.error(`${MODULE_ID} | Exact magazine reload failed`, error);
        ui.notifications?.error(
          game.i18n.localize("CWNCE.Magazine.Errors.Failed"),
        );
      });
    });
  }
}

function shouldUseExactMagazineReload(weapon) {
  return qualifiesForExactMagazineHandling(weapon, {
    supportedSwnr: isSupportedSwnr(),
    exactMagazineAutomation: game.settings.get(
      MODULE_ID,
      "exactMagazineAutomation",
    ),
  });
}

async function reloadFromSelectedMagazine({ application, event, weapon }) {
  event?.preventDefault?.();
  const actor = application.actor;
  if (!actor || weapon.parent !== actor) {
    ui.notifications?.error(
      game.i18n.localize("CWNCE.Magazine.Errors.ActorUnavailable"),
    );
    return;
  }

  const weaponFamily = resolveWeaponFamily(weapon);
  const selectedId = weapon.system?.ammo?.current ?? "";
  const selectedItem = selectedId ? actor.items.get(selectedId) : null;
  const roundsNeeded = calculateRoundsNeeded(weapon);
  const selection = resolveReloadMagazine({
    items: actor.items,
    selectedId,
    weaponFamily,
    roundsNeeded,
    autoSelect: game.settings.get(MODULE_ID, "autoSelectCompatibleMagazine"),
  });
  const magazine = selection.magazine;

  if (!magazine) {
    if (selectedId) {
      await weapon.update({ "system.ammo.current": "" });
      updateVisibleMagazineSelector(application, "");
    }
    ui.notifications?.error(
      game.i18n.localize(
        selection.reason === "no-compatible"
          ? "CWNCE.Magazine.Errors.NoCompatible"
          : selectedItem
            ? "CWNCE.Magazine.Errors.InvalidSelection"
            : "CWNCE.Magazine.Errors.NoSelection",
      ),
    );
    return;
  }

  if (roundsNeeded <= 0) {
    ui.notifications?.error(
      game.i18n.localize("CWNCE.Magazine.Errors.WeaponFull"),
    );
    return;
  }

  try {
    if (selection.automaticallySelected) {
      await weapon.update({ "system.ammo.current": magazine.id });
      updateVisibleMagazineSelector(application, magazine.id);
    }
    const result = await transferMagazineRounds({ actor, weapon, magazine });
    updateVisibleMagazineSelector(
      application,
      result.magazineDeleted ? "" : result.magazineId,
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: renderReloadChatCard({
        actorName: actor.name,
        weaponName: result.weaponName,
        magazineName: result.magazineName,
        roundsTransferred: result.roundsTransferred,
        weaponAfter: result.weaponAfter,
        weaponMaximum: result.weaponMaximum,
        magazineAfter: result.magazineAfter,
        magazineMaximum: result.magazineMaximum,
        magazineDeleted: result.magazineDeleted,
        automaticallySelected: selection.automaticallySelected,
      }),
    });
  } catch (error) {
    const key = error instanceof MagazineReloadError
      ? {
          "weapon-full": "CWNCE.Magazine.Errors.WeaponFull",
          "empty-magazine": "CWNCE.Magazine.Errors.Empty",
          "wrong-family": "CWNCE.Magazine.Errors.WrongFamily",
          "invalid-magazine": "CWNCE.Magazine.Errors.InvalidSelection",
          "invalid-weapon": "CWNCE.Magazine.Errors.InvalidWeapon",
          "not-embedded": "CWNCE.Magazine.Errors.ActorUnavailable",
        }[error.code]
      : null;
    console.error(`${MODULE_ID} | Exact magazine reload failed`, error);
    ui.notifications?.error(
      game.i18n.localize(key ?? "CWNCE.Magazine.Errors.Failed"),
    );
  }
}

function updateVisibleMagazineSelector(application, itemId) {
  const element = application?.element ?? application?._element;
  const root = element?.querySelector
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const selector = root?.querySelector?.("[data-cwnce-magazine-selector]");
  if (selector) selector.value = itemId;
}

function enhanceWeaponSheet(application, item, root) {
  const nativeAmmoType = root.querySelector('[name="system.ammo.type"]');
  const nativeAmmoGroup = nativeAmmoType?.closest(".resource.grid-span-2")
    ?? nativeAmmoType?.closest(".resource")
    ?? nativeAmmoType?.parentElement;
  const ammoGrid = nativeAmmoGroup?.closest(".grid");
  if (!nativeAmmoType || !nativeAmmoGroup || !ammoGrid) {
    warnCompatibility(
      "weapon-sheet",
      "The expected SWNR weapon-sheet ammunition controls were not found.",
    );
    return;
  }

  const mode = game.settings.get(MODULE_ID, "weaponFamilyEditing");
  const editable = canEditWeaponFamily(item, game.user, mode);
  const family = resolveWeaponFamily(item);
  const familyField = document.createElement("div");
  familyField.className = "resource grid-span-2 cwnce-weapon-family-field";

  const label = document.createElement("label");
  label.className = "resource-label";
  label.textContent = game.i18n.localize("CWNCE.WeaponFamily.Label");
  familyField.append(label);

  if (editable) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = family ?? "";
    input.placeholder = game.i18n.localize("CWNCE.WeaponFamily.Unassigned");
    input.setAttribute("list", `cwnce-weapon-families-${item.id}`);
    input.dataset.cwnceWeaponFamily = "";
    input.addEventListener("change", async () => {
      await updateWeaponFamily(item, input);
    });

    const datalist = document.createElement("datalist");
    datalist.id = `cwnce-weapon-families-${item.id}`;
    for (const entry of WEAPON_FAMILIES) {
      const option = document.createElement("option");
      option.value = entry.key;
      option.label = entry.label;
      datalist.append(option);
    }
    familyField.append(input, datalist);
  } else {
    const value = document.createElement("div");
    value.className = "cwnce-weapon-family-value";
    value.textContent = family
      ? `${familyLabel(family)} (${family})`
      : game.i18n.localize("CWNCE.WeaponFamily.Unassigned");
    familyField.append(value);
  }
  ammoGrid.insertBefore(familyField, nativeAmmoGroup);

  const nativeLabel = nativeAmmoGroup.querySelector("label");
  if (nativeLabel) {
    nativeLabel.textContent = game.i18n.localize("CWNCE.WeaponFamily.NativeAmmoType");
  }
  if (game.user.isGM) {
    const advanced = document.createElement("details");
    advanced.className = "grid-span-4 cwnce-native-ammo-compatibility";
    const summary = document.createElement("summary");
    summary.textContent = game.i18n.localize(
      "CWNCE.WeaponFamily.AdvancedCompatibility",
    );
    advanced.append(summary, nativeAmmoGroup);
    ammoGrid.append(advanced);
  } else {
    nativeAmmoGroup.hidden = true;
  }

  if (
    family
    && game.settings.get(MODULE_ID, "exactMagazineAutomation")
    && item.system?.ammo?.type !== "none"
    && item.system?.ammo?.type !== "infinite"
  ) {
    installExactMagazineSelector({ application, item, family, ammoGrid, root });
  }
}

function installExactMagazineSelector({ application, item, family, ammoGrid, root }) {
  const nativeSelect = root.querySelector('[name="system.ammo.current"]');
  const nativeSelectContainer = nativeSelect?.closest(".grid-span-3")
    ?? nativeSelect?.parentElement;
  const nativeSelectLabel = nativeSelectContainer?.previousElementSibling;
  if (nativeSelectContainer) nativeSelectContainer.hidden = true;
  if (nativeSelectLabel) nativeSelectLabel.hidden = true;

  const wrapper = document.createElement("div");
  wrapper.className = "grid-span-4 cwnce-magazine-selector";
  const label = document.createElement("label");
  label.className = "resource-label";
  label.textContent = game.i18n.localize("CWNCE.Magazine.Selector");

  const select = document.createElement("select");
  select.dataset.cwnceMagazineSelector = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = game.i18n.localize("CWNCE.Magazine.Unassigned");
  select.append(blank);

  const magazines = compatibleMagazines(item.parent?.items, family);
  for (const magazine of magazines) {
    const option = document.createElement("option");
    option.value = magazine.id;
    option.textContent = formatMagazineOption(magazine);
    option.selected = magazine.id === item.system?.ammo?.current;
    select.append(option);
  }
  select.disabled =
    !application.isEditable
    || item.canUserModify?.(game.user, "update") !== true
    || magazines.length === 0;
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await item.update({ "system.ammo.current": select.value });
    } finally {
      select.disabled = false;
    }
  });
  wrapper.append(label, select);
  ammoGrid.insertBefore(wrapper, ammoGrid.firstElementChild);
}

async function updateWeaponFamily(item, input) {
  const previous = resolveWeaponFamily(item) ?? "";
  const raw = input.value.trim();
  const family = raw ? normalizeFamilyKey(raw) : null;
  if (raw && !family) {
    input.value = previous;
    ui.notifications?.error(
      game.i18n.localize("CWNCE.WeaponFamily.Errors.InvalidKey"),
    );
    return;
  }

  input.disabled = true;
  try {
    if (family) {
      await item.update({ [`flags.${MODULE_ID}.weaponFamily`]: family });
      input.value = family;
    } else if (item.getFlag(MODULE_ID, "weaponFamily") !== undefined) {
      await item.unsetFlag(MODULE_ID, "weaponFamily");
      input.value = "";
    }
  } catch (error) {
    input.value = previous;
    console.error(`${MODULE_ID} | Failed to update Weapon Family`, error);
  } finally {
    input.disabled = false;
  }
}

async function clearDeletedMagazineReferences(item) {
  const actor = item?.parent;
  if (!actor?.items || item.type !== "item") return;

  const updates = Array.from(actor.items)
    .filter(
      (candidate) =>
        candidate.type === "weapon"
        && resolveWeaponFamily(candidate)
        && candidate.system?.ammo?.current === item.id,
    )
    .map((weapon) => ({
      _id: weapon.id,
      "system.ammo.current": "",
    }));
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }
}

function isSupportedSwnr() {
  if (game.system.id !== "swnr") return false;
  const version = String(game.system.version ?? "");
  if (version === SUPPORTED_SWNR_MINOR || version.startsWith(`${SUPPORTED_SWNR_MINOR}.`)) {
    return true;
  }
  warnCompatibility(
    "swnr-version",
    `Expected SWNR ${SUPPORTED_SWNR_MINOR}.x but found ${version || "an unknown version"}; magazine and sheet integration were not installed.`,
  );
  return false;
}

function warnCompatibility(key, message, error = null) {
  if (warnedCompatibilityMessages.has(key)) return;
  warnedCompatibilityMessages.add(key);
  console.warn(`${MODULE_ID} | ${message}`, error ?? "");
}
