import test from "node:test";
import assert from "node:assert/strict";

import {
  FAMILY_EDITING_MODES,
  MODULE_ID,
  MagazineReloadError,
  calculateRoundsNeeded,
  calculateMagazineTransfer,
  canEditWeaponFamily,
  compatibleMagazines,
  qualifiesForExactMagazineHandling,
  readWeaponFamilyChange,
  resolveMagazineFamily,
  resolveReloadMagazine,
  resolveWeaponFamily,
  selectCompatibleMagazine,
  transferMagazineRounds,
} from "../scripts/weapon-family.mjs";

function weapon({
  id = "weapon",
  family = "combat-rifle",
  current = 0,
  maximum = 30,
  legacy = null,
} = {}) {
  return {
    id,
    name: "Test Weapon",
    type: "weapon",
    parent: null,
    flags: {
      [MODULE_ID]: family ? { weaponFamily: family } : {},
      "harbour-city-stories": legacy ? { baseWeapon: legacy } : {},
    },
    system: {
      ammo: {
        current: "",
        type: "standard",
        value: current,
        max: maximum,
      },
    },
  };
}

function magazine({
  id = "magazine",
  family = "combat-rifle",
  current = 30,
  maximum = 30,
  location = "stowed",
} = {}) {
  return {
    id,
    name: `Magazine ${id}`,
    type: "item",
    parent: null,
    flags: {
      [MODULE_ID]: { magazineFamily: family },
    },
    system: {
      location,
      uses: {
        consumable: "count",
        value: current,
        max: maximum,
      },
    },
  };
}

class MockActor {
  constructor(items) {
    this.items = new Map(items.map((item) => [item.id, item]));
    this.deleted = [];
    this.updateBatches = [];
    for (const item of items) item.parent = this;
  }

  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "Item");
    this.updateBatches.push(structuredClone(updates));
    for (const update of updates) {
      const item = this.items.get(update._id);
      assert.ok(item);
      applyUpdate(item, update);
    }
  }

  async deleteEmbeddedDocuments(type, ids) {
    assert.equal(type, "Item");
    this.deleted.push(...ids);
    for (const id of ids) this.items.delete(id);
  }
}

function applyUpdate(document, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key === "_id") continue;
    const parts = key.split(".");
    let target = document;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= {};
      target = target[part];
    }
    target[parts.at(-1)] = value;
  }
}

test("weapon family resolution follows override, Content Pack, then legacy priority", () => {
  const item = weapon();
  item.flags["cwn-content-pack"] = { weaponFamily: "heavy-pistol" };
  item.flags["harbour-city-stories"] = { baseWeapon: "Light Pistol" };
  assert.equal(resolveWeaponFamily(item), "combat-rifle");

  delete item.flags[MODULE_ID].weaponFamily;
  assert.equal(resolveWeaponFamily(item), "heavy-pistol");

  delete item.flags["cwn-content-pack"].weaponFamily;
  assert.equal(resolveWeaponFamily(item), "light-pistol");
});

test("untagged and unrecognised legacy weapons preserve native fallback", () => {
  assert.equal(resolveWeaponFamily(weapon({ family: null })), null);
  assert.equal(resolveWeaponFamily(weapon({ family: null, legacy: "Unknown Gun" })), null);
});

test("inactive optional flag scopes do not abort family resolution", () => {
  const item = weapon({ family: null });
  delete item.flags["harbour-city-stories"];
  item.getFlag = () => {
    throw new Error("Flag scope is not valid or not currently active");
  };

  assert.equal(resolveWeaponFamily(item), null);
});

test("magazine family resolution follows Combat Enhancements before Content Pack", () => {
  const item = magazine();
  item.flags["cwn-content-pack"] = { magazineFamily: "heavy-pistol" };
  assert.equal(resolveMagazineFamily(item), "combat-rifle");
  delete item.flags[MODULE_ID].magazineFamily;
  assert.equal(resolveMagazineFamily(item), "heavy-pistol");
});

test("22/30 weapon plus 30/30 magazine transfers 8 and retains 22", async () => {
  const w = weapon({ current: 22 });
  const m = magazine();
  const actor = new MockActor([w, m]);
  w.system.ammo.current = m.id;

  const result = await transferMagazineRounds({ actor, weapon: w, magazine: m });
  assert.equal(result.roundsTransferred, 8);
  assert.equal(w.system.ammo.value, 30);
  assert.equal(m.system.uses.value, 22);
  assert.deepEqual(actor.deleted, []);
  assert.equal(w.system.ammo.current, m.id);
});

test("0/30 weapon plus 30/30 magazine fills and deletes the depleted item", async () => {
  const w = weapon();
  const m = magazine();
  const actor = new MockActor([w, m]);
  w.system.ammo.current = m.id;

  const result = await transferMagazineRounds({ actor, weapon: w, magazine: m });
  assert.equal(result.roundsTransferred, 30);
  assert.equal(w.system.ammo.value, 30);
  assert.equal(w.system.ammo.current, "");
  assert.equal(m.system.uses.value, 0);
  assert.deepEqual(actor.deleted, [m.id]);
  assert.equal(actor.items.has(m.id), false);
});

test("0/30 weapon plus 8/30 magazine transfers 8 and deletes it", async () => {
  const w = weapon();
  const m = magazine({ current: 8 });
  const actor = new MockActor([w, m]);
  w.system.ammo.current = m.id;

  const result = await transferMagazineRounds({ actor, weapon: w, magazine: m });
  assert.equal(result.roundsTransferred, 8);
  assert.equal(w.system.ammo.value, 8);
  assert.deepEqual(actor.deleted, [m.id]);
});

test("wrong-family magazines are omitted and rejected at reload time", async () => {
  const w = weapon();
  const wrong = magazine({ family: "heavy-pistol" });
  const actor = new MockActor([w, wrong]);
  assert.deepEqual(compatibleMagazines(actor.items.values(), "combat-rifle"), []);

  await assert.rejects(
    transferMagazineRounds({ actor, weapon: w, magazine: wrong }),
    (error) => error instanceof MagazineReloadError && error.code === "wrong-family",
  );
  assert.equal(w.system.ammo.value, 0);
  assert.equal(wrong.system.uses.value, 30);
});

test("stowed matching magazines are accepted", () => {
  const stowed = magazine({ location: "stowed" });
  assert.deepEqual(compatibleMagazines([stowed], "combat-rifle"), [stowed]);
});

test("multiple partial magazines remain separate candidates", () => {
  const first = magazine({ id: "first", current: 17 });
  const second = magazine({ id: "second", current: 4 });
  assert.deepEqual(
    compatibleMagazines([first, second], "combat-rifle").map((item) => item.id),
    ["first", "second"],
  );
});

test("a valid current selection remains selected", () => {
  const current = magazine({ id: "current", current: 5 });
  const larger = magazine({ id: "larger", current: 30 });
  const result = resolveReloadMagazine({
    items: [current, larger],
    selectedId: current.id,
    weaponFamily: "combat-rifle",
    roundsNeeded: 20,
    autoSelect: true,
  });
  assert.equal(result.magazine, current);
  assert.equal(result.automaticallySelected, false);
});

test("stale, empty, and wrong-family selections are replaced", () => {
  const replacement = magazine({ id: "replacement", current: 12 });
  const empty = magazine({ id: "empty", current: 0 });
  const wrong = magazine({
    id: "wrong",
    family: "heavy-pistol",
    current: 30,
  });
  for (const selectedId of ["missing", empty.id, wrong.id]) {
    const result = resolveReloadMagazine({
      items: [empty, wrong, replacement],
      selectedId,
      weaponFamily: "combat-rifle",
      roundsNeeded: 8,
      autoSelect: true,
    });
    assert.equal(result.magazine, replacement);
    assert.equal(result.automaticallySelected, true);
    assert.equal(result.invalidSelection, true);
  }
});

test("one compatible magazine is selected automatically", () => {
  const only = magazine({ id: "only", current: 5 });
  const result = resolveReloadMagazine({
    items: [only],
    selectedId: "",
    weaponFamily: "combat-rifle",
    roundsNeeded: 8,
    autoSelect: true,
  });
  assert.equal(result.magazine, only);
  assert.equal(result.automaticallySelected, true);
});

test("the smallest sufficient magazine is selected", () => {
  const five = magazine({ id: "five", current: 5 });
  const twelve = magazine({ id: "twelve", current: 12 });
  const thirty = magazine({ id: "thirty", current: 30 });
  assert.equal(
    selectCompatibleMagazine(
      [thirty, five, twelve],
      "combat-rifle",
      8,
    ),
    twelve,
  );
});

test("the largest insufficient magazine is selected", () => {
  const five = magazine({ id: "five", current: 5 });
  const twelve = magazine({ id: "twelve", current: 12 });
  const eighteen = magazine({ id: "eighteen", current: 18 });
  assert.equal(
    selectCompatibleMagazine(
      [five, eighteen, twelve],
      "combat-rifle",
      20,
    ),
    eighteen,
  );
});

test("automatic selection uses deterministic Item-ID tie-breaking", () => {
  const later = magazine({ id: "z-item", current: 12 });
  const earlier = magazine({ id: "a-item", current: 12 });
  assert.equal(
    selectCompatibleMagazine(
      [later, earlier],
      "combat-rifle",
      8,
    ),
    earlier,
  );
  assert.equal(
    selectCompatibleMagazine(
      [later, earlier],
      "combat-rifle",
      20,
    ),
    earlier,
  );
});

test("no compatible magazine returns no automatic selection", () => {
  const wrong = magazine({ family: "heavy-pistol" });
  const result = resolveReloadMagazine({
    items: [wrong],
    selectedId: "",
    weaponFamily: "combat-rifle",
    roundsNeeded: 8,
    autoSelect: true,
  });
  assert.equal(result.magazine, null);
  assert.equal(result.automaticallySelected, true);
  assert.equal(result.reason, "no-compatible");
});

test("disabled automatic selection preserves manual-selection behavior", () => {
  const available = magazine({ id: "available" });
  const missing = resolveReloadMagazine({
    items: [available],
    selectedId: "",
    weaponFamily: "combat-rifle",
    roundsNeeded: 8,
    autoSelect: false,
  });
  assert.equal(missing.magazine, null);
  assert.equal(missing.automaticallySelected, false);
  assert.equal(missing.reason, "no-selection");

  const selected = resolveReloadMagazine({
    items: [available],
    selectedId: available.id,
    weaponFamily: "combat-rifle",
    roundsNeeded: 8,
    autoSelect: false,
  });
  assert.equal(selected.magazine, available);
  assert.equal(selected.automaticallySelected, false);
});

test("a depleted auto-selected magazine is deleted and its reference clears", async () => {
  const w = weapon({ current: 22 });
  const m = magazine({ id: "auto", current: 8 });
  const actor = new MockActor([w, m]);
  const selection = resolveReloadMagazine({
    items: actor.items.values(),
    selectedId: "",
    weaponFamily: "combat-rifle",
    roundsNeeded: calculateRoundsNeeded(w),
    autoSelect: true,
  });
  w.system.ammo.current = selection.magazine.id;

  await transferMagazineRounds({ actor, weapon: w, magazine: selection.magazine });
  assert.equal(w.system.ammo.current, "");
  assert.equal(actor.items.has(m.id), false);
  assert.deepEqual(actor.deleted, [m.id]);
});

test("a partial auto-selected magazine remains selected", async () => {
  const w = weapon({ current: 22 });
  const m = magazine({ id: "auto", current: 12 });
  const actor = new MockActor([w, m]);
  const selection = resolveReloadMagazine({
    items: actor.items.values(),
    selectedId: "",
    weaponFamily: "combat-rifle",
    roundsNeeded: calculateRoundsNeeded(w),
    autoSelect: true,
  });
  w.system.ammo.current = selection.magazine.id;

  await transferMagazineRounds({ actor, weapon: w, magazine: selection.magazine });
  assert.equal(w.system.ammo.current, m.id);
  assert.equal(m.system.uses.value, 4);
  assert.deepEqual(actor.deleted, []);
});

test("native fallback qualification remains unchanged", () => {
  const familyAware = weapon();
  assert.equal(qualifiesForExactMagazineHandling(familyAware), true);
  assert.equal(
    qualifiesForExactMagazineHandling(familyAware, {
      exactMagazineAutomation: false,
    }),
    false,
  );
  assert.equal(
    qualifiesForExactMagazineHandling(weapon({ family: null })),
    false,
  );

  const infinite = weapon();
  infinite.system.ammo.type = "infinite";
  assert.equal(qualifiesForExactMagazineHandling(infinite), false);

  const none = weapon();
  none.system.ammo.type = "none";
  assert.equal(qualifiesForExactMagazineHandling(none), false);
});

test("a 30-round magazine transfers only 30 into a 60-round weapon", async () => {
  const w = weapon({ maximum: 60 });
  const m = magazine();
  const actor = new MockActor([w, m]);
  const result = await transferMagazineRounds({ actor, weapon: w, magazine: m });
  assert.equal(result.weaponAfter, 30);
  assert.equal(result.weaponMaximum, 60);
  assert.deepEqual(actor.deleted, [m.id]);
});

test("full weapons and empty magazines do not change either item", async () => {
  const full = weapon({ current: 30 });
  const loaded = magazine();
  const actor = new MockActor([full, loaded]);
  await assert.rejects(
    transferMagazineRounds({ actor, weapon: full, magazine: loaded }),
    (error) => error instanceof MagazineReloadError && error.code === "weapon-full",
  );
  assert.equal(loaded.system.uses.value, 30);

  const calculation = calculateMagazineTransfer({
    weaponCurrent: 0,
    weaponMaximum: 30,
    magazineCurrent: 0,
    magazineMaximum: 30,
  });
  assert.equal(calculation.roundsTransferred, 0);

  const empty = magazine({ id: "empty", current: 0 });
  const emptyActor = new MockActor([weapon(), empty]);
  await assert.rejects(
    transferMagazineRounds({
      actor: emptyActor,
      weapon: emptyActor.items.get("weapon"),
      magazine: empty,
    }),
    (error) =>
      error instanceof MagazineReloadError && error.code === "invalid-magazine",
  );
  assert.equal(emptyActor.items.get("weapon").system.ammo.value, 0);
  assert.equal(empty.system.uses.value, 0);
});

test("only the selected partial magazine is updated", async () => {
  const w = weapon({ current: 20 });
  const selected = magazine({ id: "selected", current: 17 });
  const untouched = magazine({ id: "untouched", current: 4 });
  const actor = new MockActor([w, selected, untouched]);
  await transferMagazineRounds({ actor, weapon: w, magazine: selected });
  assert.equal(selected.system.uses.value, 7);
  assert.equal(untouched.system.uses.value, 4);
});

test("family editing permissions enforce GM Only, Item Owners, and Nobody", () => {
  const item = {
    canUserModify(user, action) {
      return action === "update" && user.id === "owner";
    },
  };
  const gm = { id: "gm", isGM: true };
  const owner = { id: "owner", isGM: false };
  const other = { id: "other", isGM: false };

  assert.equal(canEditWeaponFamily(item, gm, FAMILY_EDITING_MODES.GM_ONLY), true);
  assert.equal(canEditWeaponFamily(item, owner, FAMILY_EDITING_MODES.GM_ONLY), false);
  assert.equal(canEditWeaponFamily(item, gm, FAMILY_EDITING_MODES.ITEM_OWNERS), true);
  assert.equal(canEditWeaponFamily(item, owner, FAMILY_EDITING_MODES.ITEM_OWNERS), true);
  assert.equal(canEditWeaponFamily(item, other, FAMILY_EDITING_MODES.ITEM_OWNERS), false);
  assert.equal(canEditWeaponFamily(item, gm, FAMILY_EDITING_MODES.NOBODY), false);
});

test("family update detection is narrow and ignores unrelated item changes", () => {
  assert.deepEqual(
    readWeaponFamilyChange({ "system.ammo.value": 10 }),
    { changed: false, value: undefined },
  );
  assert.deepEqual(
    readWeaponFamilyChange({
      [`flags.${MODULE_ID}.weaponFamily`]: "combat-rifle",
    }),
    { changed: true, value: "combat-rifle" },
  );
});
