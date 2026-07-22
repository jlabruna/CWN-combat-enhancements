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
- Highlights successful Trauma hits separately in blue. A high Trauma Die never
  changes a missed or out-of-range attack into a Trauma hit.
- Adds labelled modifier breakdowns to expanded attack, damage, Trauma, and
  Trauma-damage rolls.
- Adds explicit Burst Fire and Suppressive Fire choices to eligible weapon
  attack dialogs. Both choices start unticked and cannot be selected together.
- Resolves CWN Suppressive Fire with a 90-degree cone, normal-range limit,
  two-round ammunition cost, hard-cover exclusions, Evasion Saves, half damage
  rounded up, and separate Trauma checks for each struck target.
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
- Calculates NPC ranged AC, melee AC, Soak, and Trauma protection from armor
  that is both Readied and Equipped. Manual NPC AC remains the fallback when
  active armor does not improve it.

Ordinary attacks continue to use SWNR's original rolls and ammunition handling.
Suppressive Fire has its own rules workflow and spends two rounds. Hard cover is
selected manually in its confirmation window.

## Install on The Forge

Install the module using this manifest URL:

```text
https://github.com/jlabruna/CWN-combat-enhancements/releases/latest/download/module.json
```

Then enable **CWN Combat Enhancements** in the world's Manage Modules screen and
ensure SWNR's **CWN Armor** setting is enabled so melee AC is derived.

For a manual Forge import, upload the versioned
`cwn-combat-enhancements-v0.6.2.zip` release asset. The ZIP must contain
`module.json` at its root.

For development testing, target one or more tokens, control the attacker's token,
and roll a weapon from that actor's sheet. Use a scene whose distance units are
meters, feet, yards, kilometres, or miles.

## SWNR 2.3.0 integration notes

- Attack entry point: `module/data/items/item-weapon.mjs`, `SWNWeapon.rollAttack()`.
- Weapon dialog entry point: `SWNWeapon.roll()` and
  `templates/dialogs/roll-attack.hbs`.
- Attack card: `templates/chat/attack-roll.hbs`.
- Card linkage: `data-actor-id` and `data-item-id` on `.chat-card.item-card`.
- Attack roll: first roll on the resulting `ChatMessage` (`message.rolls[0]`).
- Weapon item type: `weapon`.
- Attack classification: `weapon.system.isMelee`.
- Range fields: `weapon.system.range.normal` and `.max`.
- Fire-mode fields: `weapon.system.ammo.burst` and `.suppress`.
- Character Evasion Save: `actor.system.save.evasion`; NPC Evasion Save:
  `actor.system.saves`.
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

## Suppressive Fire workflow

1. Control the firing token and target exactly one token to aim the cone.
2. Roll a weapon whose **Suppressive Fire** box is enabled on its item sheet.
3. Leave Burst Fire unticked and tick **Use Suppressive Fire**.
4. The module places a temporary 90-degree cone from the shooter toward the aim
   target and finds every non-hidden token inside the weapon's normal range.
5. In the confirmation window, confirm that the weapon is braced against a
   solid support or that the gunner has gone prone, and tick **Hard cover**
   beside any protected targets.
6. The module spends two rounds, rolls weapon damage once, and rolls an Evasion
   Save separately for every uncovered token. Failed saves take half damage,
   rounded up. Every failed target gets its own Trauma Die and Trauma Target
   comparison.
7. The GM can use **Apply Suppressive Damage** on the resulting chat card. SWNR
   still processes Damage Reduction, Soak, HP, defeat, and floating numbers.

Suppressive Fire does not roll to hit or compare AC. The temporary cone is an
aiming preview; this release does not automatically determine hard cover from
walls. If a custom actor has no readable Evasion Save, the card marks that
target for manual resolution and does not apply damage automatically.

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

### 0.6.1

- Added expanded modifier breakdowns to Suppressive Fire weapon-damage,
  Evasion Save, and Trauma rolls.
- Evasion details now identify the rolled die, target number, and success or
  failure; Trauma details identify the Trauma Target and resulting outcome.

### 0.6.0

- Added an automated CWN Suppressive Fire workflow for weapons carrying SWNR's
  Suppressive Fire flag.
- Added mutually exclusive Burst Fire and Suppressive Fire choices, both
  unticked by default on every attack dialog.
- Added temporary 90-degree cone targeting, normal-range filtering, bracing and
  hard-cover confirmation, two-round ammo use, per-target Evasion Saves, half
  damage, Trauma checks, and GM damage application.

### 0.5.1

- Fixed labelled modifier breakdowns remaining visible while Foundry's dice
  details were collapsed.

### 0.5.0

- Added detailed, labelled modifier breakdowns inside SWNR's existing expanded
  weapon-roll details.
- Captured the breakdown at roll time so historical cards remain accurate.

### 0.4.0

- Added a blue **TRAUMA HIT!** outcome for successful attacks whose Trauma Die
  meets or exceeds that target's modified Trauma Target.
- Kept misses and out-of-range attacks independent from the Trauma result.

### 0.3.1

- Prevented multiple active body-armour suits from stacking Soak.
- Retained additive Soak from active armor accessories.
- Required NPC armor and accessories to be both Readied and Equipped.
- Disabled equipping stowed NPC armor and unequipped armor whenever its carried
  location changes.

### 0.3.0

- Added active-armor-derived AC, Soak, and Trauma Target protection for NPCs.
- Retained the NPC's manual Base AC and Melee AC as fallback values.
- Added a world setting to disable NPC armor automation.

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
