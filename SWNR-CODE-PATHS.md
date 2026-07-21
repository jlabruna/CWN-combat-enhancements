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

CWN compendium weapon entries store these range numbers in meters. Examples in
`src/packs/cwn-items` include Heavy Pistol `10/100` and Rifle `200/400`.

The v0.1 module converts common scene units to meters, applies no modifier within
normal range, applies −2 beyond normal and up to maximum range, and reports out
of range beyond maximum.

## Item type

`system.json` declares `weapon` as a native Item document type. The module only
handles chat cards whose linked embedded item exists and has `item.type ===
"weapon"`; other SWNR roll cards are ignored.

## Extension boundary

This approach does not replace `SWNWeapon.roll()` or `rollAttack()`. It uses core
Foundry chat lifecycle hooks and reads SWNR documents. That keeps v0.1 isolated
from the system's attack/damage implementation while still preserving the target
context that SWNR currently omits.
