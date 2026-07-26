# SWNR 2.3.0 code-path audit

This audit was performed against the `v2.3.0` tag (commit
`551564ac6aad1f9d143cc8b42e00080c44211602`) of `wintersleepAI/swnr`.

## Attack roll

`module/data/items/item-weapon.mjs` defines the `SWNWeapon` item data model.

- `roll()` opens SWNR's attack dialog and resolves the selected ability, skill,
  manual modifier, and burst-fire choice.
- `rollAttack()` builds the actual d20 formula, evaluates the hit roll, optionally
  evaluates damage/trauma/shock, renders the attack card, and creates a
  `ChatMessage`.
- When CWN Armor is enabled and `item.system.isMelee` is true, SWNR swaps the
  attacker's normal attack bonus for `actor.system.meleeAb`.
- The created message places the hit roll first in `rolls`, followed by any shock
  roll. This makes `message.rolls[0].total` the complete displayed attack total.

## Chat card

`templates/chat/attack-roll.hbs` renders `.chat-card.item-card` and includes:

- `data-actor-id="{{actor._id}}"`
- `data-item-id="{{weapon._id}}"`

SWNR 2.3.0 does not persist the user's targeted tokens on this message. The
companion module therefore reads the actor/item IDs from the card during
`preCreateChatMessage` and adds a namespaced flag containing the attacker's token
and the targets selected at roll time. Its `renderChatMessage` hook then appends
the result block to the existing card.

## Actor AC

`module/data/actors/base-actor.mjs` defines:

- `system.baseAc`
- `system.meleeAc`

`module/data/actors/actor-character.mjs` derives:

- `system.ac` as the best readied ranged AC plus Dexterity and shield bonuses.
- `system.meleeAc` as the best readied melee AC plus Dexterity and melee shield
  bonuses when SWNR's CWN Armor setting is enabled.

`module/data/actors/actor-npc.mjs` exposes the same base fields. NPC ranged AC is
derived as `system.ac = system.baseAc`; its melee AC remains the stored
`system.meleeAc` value.

For the module, the correct comparison is therefore:

- ranged weapon: `target.actor.system.ac`
- melee weapon: `target.actor.system.meleeAc`

Trauma checks use the target's derived
`target.actor.system.modifiedTraumaTarget`, falling back to
`target.actor.system.traumaTarget` when necessary.

## v0.2 damage integration

The attack card renders normal damage, the Trauma Die, and (when SWNR's fixed
threshold of 6 is met) multiplied Trauma damage as HTML dice rolls. The module
captures the normal and Trauma totals when the message is created, then compares
the Trauma result against each victim's own derived Trauma Target.

SWNR exports `applyHealthDrop()` from `module/helpers/chat.mjs`. That helper reads
controlled tokens and mutates its local damage value while processing armor. The
companion therefore controls and processes each HIT target separately, awaits
the helper, and restores the user's original controlled tokens afterward.
Calling the helper once with every target controlled could incorrectly carry one
target's Soak or Damage Reduction into the next target.

## Weapon type and range

`module/data/items/item-weapon.mjs` defines weapon fields:

- `system.isMelee` (Boolean)
- `system.range.normal` (Number)
- `system.range.max` (Number)
- `system.ammo.burst` (Boolean)
- `system.ammo.suppress` (Boolean)

CWN compendium weapon entries store these range numbers in meters. Examples in
`src/packs/cwn-items` include Heavy Pistol `10/100` and Rifle `200/400`.

The v0.1 module converts common scene units to meters, applies no modifier within
normal range, applies −2 beyond normal and up to maximum range, and reports out
of range beyond maximum.

## Item type

`system.json` declares `weapon` as a native Item document type. The module only
handles chat cards whose linked embedded item exists and has `item.type ===
"weapon"`; other SWNR roll cards are ignored.

## Suppressive Fire integration

SWNR 2.3.0 stores a Suppressive Fire capability flag on weapons but its
`templates/dialogs/roll-attack.hbs` dialog only exposes Burst Fire. Its `roll()`
method also pre-checks Burst Fire whenever enough ammunition is loaded.

For v0.6.0, the module narrowly wraps the SWNR weapon data model's `roll()` and
`rollAttack()` methods. Eligible weapons are forced through the normal SWNR
dialog, the pre-checked Burst choice is cleared, and a Suppressive Fire choice
is injected. Ordinary and Burst attacks return to the original SWNR
`rollAttack()` method; only the explicit Suppressive Fire branch uses the
module's custom cone, Evasion Save, damage, Trauma, ammunition, and chat-card
workflow.

Saving throw targets are read from:

- Characters: `actor.system.save.evasion`
- NPCs: `actor.system.saves`

## Weapon Family and magazine reload integration

`module/data/items/item-weapon.mjs` defines the native weapon ammunition fields:

- `system.ammo.type`
- `system.ammo.current`
- `system.ammo.value`
- `system.ammo.max`

`module/data/items/item-item.mjs` defines count-based consumables through:

- `system.uses.consumable === "count"`
- `system.uses.value`
- `system.uses.max`

`module/sheets/item-sheet.mjs`, `_getRelatedItems()`, filters native ammunition
sources by `system.uses.ammo === weapon.system.ammo.type`. In SWNR 2.3.0 that
item-sheet list is only populated for character parents.

`templates/item/attribute-parts/weapon.hbs` renders the source selector as
`system.ammo.current` and the visible native Ammo Type control as
`system.ammo.type`. Version 0.10.0 uses a narrow `renderApplicationV2` hook to
add Weapon Family controls, filter family-aware magazine choices, and move the
unchanged native type field into a GM-only advanced compatibility section.

`module/sheets/base-sheet.mjs`, `SWNBaseSheet._onReload()`, is the native reload
implementation. `module/sheets/actor-sheet.mjs` registers that inherited
function by reference at
`SWNActorSheet.DEFAULT_OPTIONS.actions.reload`. Foundry caches that action table
before module `setup`, so mutating the static options afterward does not replace
the live handler. Version 0.10.3 therefore attaches a direct handler to rendered
`[data-action="reload"]` controls and stops propagation only for qualifying
family-aware weapons. All fallback cases continue to the cached native action.
that one action reference rather than broadly patching Item or Actor documents.

The wrapper intercepts only family-aware non-infinite weapons while the feature
setting is enabled. Everything else calls the original action. It resolves the
weapon from `this._getEmbeddedDocument(target)` and uses `this.actor`, retaining
SWNR's actor-sheet behavior for linked actors and synthetic/unlinked token
actors.

Version 0.10.4 validates `system.ammo.current` against the actor's current
embedded Items before each exact reload. With automatic selection enabled, an
invalid reference is replaced by the smallest compatible magazine that can fill
the weapon, or by the compatible magazine with the most rounds when none is
sufficient. Item-ID ordering breaks otherwise-equal ties. The chosen ID is
persisted before the existing exact transfer runs; a depleted magazine clears
the reference while a retained partial magazine remains selected.

SWNR's `SWNActor` and `SWNItem` document classes do not override Foundry's
embedded update or delete APIs. The module updates the embedded weapon and
selected magazine together through `actor.updateEmbeddedDocuments()`. A
depleted magazine is first persisted at zero with the weapon reference cleared,
then removed through `actor.deleteEmbeddedDocuments()`, preventing duplicated
rounds if deletion fails.

Ordinary and Burst attacks continue through `SWNWeapon.rollAttack()`, which
spends loaded rounds from `system.ammo.value`. Suppressive Fire continues to
spend two loaded rounds through the module's existing weapon update. The
magazine wrapper does not replace either attack path.

## Extension boundary

Normal target checking and damage integration use Foundry chat lifecycle hooks
and do not replace SWNR's attack implementation. The Suppressive Fire feature
adds the scoped weapon-method wrappers described above because SWNR has no
native Suppressive Fire dialog or resolution path. The wrappers are marked with
module-specific symbols to prevent duplicate installation.

The magazine feature similarly marks its actor-sheet action wrapper with a
module-specific symbol. It expects SWNR 2.3.x and logs a one-time warning if the
version, action reference, or weapon-sheet ammunition structure is unavailable.
