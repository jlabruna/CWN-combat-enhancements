# SWNR 2.3.0 code-path audit

## Foundry V14 / SWNR 2.3.1 compatibility validation

The original source-path audit below remains the design record for the
module's integrations. Release 0.13.1 revalidated those paths against SWNR
2.3.1 and Foundry VTT 14.365. Chat DOM enhancement now uses
`renderChatMessageHTML`; chat visibility supports V14 `messageMode` and
`ChatMessage.applyMode`; and template rendering uses the namespaced Foundry
Handlebars API. V13 fallbacks remain isolated in `scripts/foundry-compat.mjs`.

This audit was performed against the `v2.3.0` tag (commit
`551564ac6aad1f9d143cc8b42e00080c44211602`) of `wintersleepAI/swnr`.

## Cyberware

Native Cyberware Items store `system.cost`, `system.strain`, `system.tl`,
`system.type`, `system.concealment`, `system.disabled`,
`system.complication`, `system.effect`, and `system.description`. Foundry
Active Effects remain in the Item's ordinary `effects` array.

SWNR actor preparation sums the Strain of every actor-owned Cyberware Item.
Removing the Item reverses that contribution. The native `disabled` field does
not exclude the Item from this calculation and does not itself suppress an
embedded Active Effect. No cyberware-specific derived-data handlers,
item-name handlers, or Active Effects were found in SWNR's native Cyberware
catalogue.

Consequently, Combat Enhancements treats all actor-owned cyberware as installed
for monthly upkeep but never writes to native Strain. Content Pack 0.6.0 embeds
no speculative Active Effects: conditional effects, AC floors, attribute
minimums, activated abilities, limited-use abilities, and similar rules remain
classified for contextual, manual, or future handler-based automation.

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

### Linked drone pilots

SWNR 2.3.1 represents a Drone as actor type `drone`. Its native linked pilot ID
is the first entry in `system.crewMembers`, and derived preparation exposes the
resolved Actor at `system.pilot`. NPC actors use type `npc`; their complete
ranged Attack Bonus is `system.ab`.

Release 0.14.0 wraps only `SWNWeapon.roll()` for weapons owned by a Drone whose
native pilot resolves to an NPC. The reduced dialog retains Burst Fire and the
manual modifier, then delegates to native `rollAttack()` with Stat, Skill, and
damage bonus set to zero. A temporary, synchronous `getRollData()` boundary
supplies the NPC pilot bonus as both `ab` and `meleeAb`, because SWNR substitutes
`meleeAb` for melee-tagged attacks while CWN Armor is enabled. The override is
removed immediately after SWNR captures its roll data. This keeps the bonus in
To Hit only and preserves the rest of SWNR's attack pipeline.

Release 0.15.0 extends that same narrow boundary to native links resolving to a
player Character. The character calculation reads `system.ab`, compares
`system.stats.dex.mod` with `system.stats.int.mod` (Dexterity wins ties), and
compares the actor-owned Drive and Program Skill ranks (Program wins ties).
The combined pilot value is supplied only through the temporary `ab` boundary;
Stat, Skill, and damage-bonus arguments remain zero so no pilot contribution
enters damage, Shock, Trauma Die, or Trauma damage. A genuine untrained rank of
`-1` remains `-1` rather than passing through SWNR's weapon-skill `-2` fallback.

The native Remote Control Unit cyberware Item is recognized for compatibility
purposes, but SWNR 2.3.1 exposes no unambiguous per-attack remote/control-board
state. This release therefore applies neither an RCU bonus nor a missing-RCU
penalty. Missing, deleted, malformed, and unsupported pilot links stop safely
rather than falling through to an incorrect native formula.

## Chat card

`templates/chat/attack-roll.hbs` renders `.chat-card.item-card` and includes:

- `data-actor-id="{{actor._id}}"`
- `data-item-id="{{weapon._id}}"`

SWNR 2.3.0 does not persist the user's targeted tokens on this message. The
companion module therefore reads the actor/item IDs from the card during
`preCreateChatMessage` and adds a namespaced flag containing the attacker's token
and the targets selected at roll time. Its `renderChatMessageHTML` hook then appends
the result block to the existing card.

Version 0.12.3 adds the module-owned `scripts/chat-card.mjs` renderer for exact
reload and Network Console/Demon messages. It emits the stable wrapper
`.cwn-ce-chat-card` plus purpose modifiers `--reload`, `--network`, `--demon`,
and `--damage`, and semantic `__header`, `__title`, `__subtitle`, `__body`,
`__row`, `__label`, `__value`, `__result`, `__guidance`, and `__actions`
elements. User-controlled text is escaped; only module-owned action markup is
accepted as trusted HTML. The scoped defaults live in
`styles/cwn-combat-enhancements.css`. Optional themes own any suite-specific
overrides and must not be required by this module.

Version 0.12.4 also emits Foundry/SWNR's `.chat-card.item-card` compatibility
classes so existing optional themes recognize these cards. Demon rolls use
standard `.dice-roll`, `.dice-formula`, and `.dice-total` presentation nested
inside module-owned `__roll` and `__roll-label` elements.

Version 0.12.5 places the trusted result of `await Roll.render()` into each
Demon roll slot. This preserves Foundry's `.dice-tooltip` details and native
expand/collapse behavior rather than reproducing only the formula and total.

Version 0.12.6 stores a typed modifier breakdown flag on each Demon action
message. Its render hook appends the same `.cwnce-modifier-breakdown` structure
used by weapon cards to the matching Check and Potential damage tooltips. Check
entries identify Skill Bonus, action modifier, and total modifier; damage
entries identify Skill Bonus and the derived number of d10s.

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
persisted atomically with the existing exact transfer; a depleted magazine
clears the reference while a retained partial magazine remains selected. This
avoids asking SWNR to migrate a sparse standalone weapon update before the full
embedded-document transfer.

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

## Network Console rules and program data

The Network Console remains module-owned and stores its schema-v3 data in a
GM-only Journal flag. Prepared player requests and Demon program compatibility
use the program names, targets, and modifiers supplied by SWNR 2.3.0 under:

- `src/packs/cwn-items/*` for the CWN program Items;
- `module/data/items/item-program.mjs` for the program data model;
- `module/sheets/cyberdeck-sheet.mjs` for prepared cyberdeck programs.

The allowed Verb + Subject pair is validated against the same target categories
used by `programsAreCompatible()` in the existing console request workflow:
Avatar, Cyber, Data, Device, and Program. Demon class defaults come from the CWN
SRD table rather than SWNR actor data; SWNR does not provide Demon actor stat
blocks. Network editing does not modify the SWNR system or any SWNR compendium.

Version 0.12.0 also cross-checks the SWNR 2.3.x program Items for Stun,
Paralyze, Kill, Lock, Defend, Erase and Terminate targets and modifiers. Demon
class statistics, programming profiles, command priorities, Alert actions,
movement, fragging and reboot boundaries come from the CWN rules rather than an
SWNR Demon Actor model. SWNR does not provide a persistent Demon Actor or
avatar-node tracker, so opposed player results, active hostile programs,
Pursue destinations, and physical effects remain GM-adjudicated.

Version 0.12.3 centralizes Demon profile counts, class capacities,
compatibility, and total configured command counts in
`scripts/network-console/demon-rules.mjs`. Standard profiles are compatible
when their profile command count is less than or equal to the standard class
line limit. Custom Programming is always selectable, but its configured lines
still count against a fixed class limit. A Custom Demon uses a positive stored
`lineLimit` when present; zero or absent retains the existing no-fixed-limit
behavior. Normalization preserves incompatible legacy data for explicit GM
correction rather than truncating it.

## Extension boundary

Normal target checking and damage integration use Foundry chat lifecycle hooks
and do not replace SWNR's attack implementation. The Suppressive Fire feature
adds the scoped weapon-method wrappers described above because SWNR has no
native Suppressive Fire dialog or resolution path. The wrappers are marked with
module-specific symbols to prevent duplicate installation.

The magazine feature similarly marks its actor-sheet action wrapper with a
module-specific symbol. It expects SWNR 2.3.x and logs a one-time warning if the
version, action reference, or weapon-sheet ammunition structure is unavailable.
