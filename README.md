# CWN Combat Enhancements

A minimal Foundry VTT v13 companion module for **Cities Without Number** games
running on **Systems Without Number Redux (SWNR) 2.3.0**.

## Current scope

- Captures the user's targeted tokens when an SWNR weapon attack is rolled.
- Detects melee attacks through `weapon.system.isMelee`.
- Uses `actor.system.meleeAc` for melee and `actor.system.ac` for ranged attacks.
- Measures token-center distance with Foundry's grid path measurement.
- Treats SWNR weapon ranges as meters and converts common scene units.
- Applies CWN's −2 modifier beyond normal range and up to maximum range.
- Reports hit, miss, or out of range separately for each target.
- Keeps exact enemy AC hidden from players by default; GMs always see it.
- Gives the GM one **Apply damage to HIT targets** action on attack cards with a
  completed damage roll.
- Applies damage to every attack-time target marked HIT, even when the weapon
  would ordinarily attack only one target. Target selection is treated as the
  user's declaration of every intended damage recipient.
- Compares the attack's Trauma Die against each target's modified Trauma Target
  and applies either normal or multiplied Trauma damage independently.
- Delegates actual health changes to SWNR so Damage Reduction, Soak, HP, defeated
  status, and floating damage numbers retain the system's standard behavior.

The module does not change the original attack roll, spend ammunition, or
automate cover. Target checks and the optional GM damage action are displayed
below SWNR's existing card.

## Install on The Forge

Install the module using this manifest URL:

```text
https://github.com/jlabruna/CWN-combat-enhancements/releases/latest/download/module.json
```

Then enable **CWN Combat Enhancements** in the world's Manage Modules screen and
ensure SWNR's **CWN Armor** setting is enabled so melee AC is derived.

For a manual Forge import, upload the versioned
`cwn-combat-enhancements-v0.2.0.zip` release asset. The ZIP must contain
`module.json` at its root.

For development testing, target one or more tokens, control the attacker's token,
and roll a weapon from that actor's sheet. Use a scene whose distance units are
meters, feet, yards, kilometres, or miles.

## SWNR 2.3.0 integration notes

- Attack entry point: `module/data/items/item-weapon.mjs`, `SWNWeapon.rollAttack()`.
- Attack card: `templates/chat/attack-roll.hbs`.
- Card linkage: `data-actor-id` and `data-item-id` on `.chat-card.item-card`.
- Attack roll: first roll on the resulting `ChatMessage` (`message.rolls[0]`).
- Weapon item type: `weapon`.
- Attack classification: `weapon.system.isMelee`.
- Range fields: `weapon.system.range.normal` and `.max`.
- Base/derived AC schema: `module/data/actors/base-actor.mjs`.
- Character AC derivation: `module/data/actors/actor-character.mjs`.
- Ranged AC: `actor.system.ac`; melee AC: `actor.system.meleeAc`.

## Known limitations

- Results require the attacker's token and targets to be on the currently viewed
  scene when the card renders. Otherwise distance is marked unavailable.
- Unknown/custom scene distance units cannot be converted to weapon-range meters.
- Melee attacks select melee AC and report distance, but v0.1 does not enforce a
  reach limit because SWNR's melee compendium entries contain generic range data.
- The module recognizes SWNR's existing attack-card HTML because SWNR 2.3.0 does
  not attach weapon/target metadata to every attack message. A future SWNR card
  markup change may require a compatibility update.
- Multi-level/elevation distance and wall/line-of-sight checks are not included.

## Target-aware damage behavior

- The damage action is GM-only because it can update NPC actors.
- It appears when SWNR rolls damage on the original attack card. If the world is
  configured to roll damage later in a separate chat message, use SWNR's normal
  damage buttons for that attack.
- Every captured target marked HIT receives damage. The module intentionally
  does not restrict ordinary weapons to one recipient; targeting multiple tokens
  is treated as an explicit request to apply that attack to all successful ones.
- Targets marked MISS or OUT OF RANGE never receive damage from the action.
- Each target is processed separately through SWNR's health helper so one
  target's Damage Reduction or Soak cannot reduce another target's damage.
- After a successful application, the chat message records that damage was
  applied and replaces the action with a completed summary. SWNR's original
  buttons remain available for GM corrections or exceptional rules.

## Changes

### 0.2.0

- Added target-aware normal and Trauma damage application for all targets marked
  HIT by the attack card.
- Added per-target modified Trauma Target checks.
- Preserved SWNR's existing Damage Reduction, Soak, HP, and defeat handling.
- Added natural 1 automatic misses and natural 20 automatic hits.

### 0.1.1

- Read weapons from the attacking token's synthetic actor before falling back to
  the original world actor. This fixes stale melee and range values for unlinked
  NPC tokens whose embedded weapons were edited on the token sheet.

### 0.1.0

- Initial target-aware attack, AC, and ranged-distance checks.
