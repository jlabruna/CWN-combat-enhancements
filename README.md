# CWN Combat Enhancements

A minimal Foundry VTT v13 companion module for **Cities Without Number** games
running on **Systems Without Number Redux (SWNR) 2.3.0**.

## v0.1 scope

- Captures the user's targeted tokens when an SWNR weapon attack is rolled.
- Detects melee attacks through `weapon.system.isMelee`.
- Uses `actor.system.meleeAc` for melee and `actor.system.ac` for ranged attacks.
- Measures token-center distance with Foundry's grid path measurement.
- Treats SWNR weapon ranges as meters and converts common scene units.
- Applies CWN's −2 modifier beyond normal range and up to maximum range.
- Reports hit, miss, or out of range separately for each target.
- Keeps exact enemy AC hidden from players by default; GMs always see it.

The module does not change the original attack roll, spend ammunition, apply
damage, update actors, or automate cover. The adjusted result is displayed below
SWNR's existing card.

## Install on The Forge

Install the module using this manifest URL:

```text
https://github.com/jlabruna/CWN-combat-enhancements/releases/latest/download/module.json
```

Then enable **CWN Combat Enhancements** in the world's Manage Modules screen and
ensure SWNR's **CWN Armor** setting is enabled so melee AC is derived.

For a manual Forge import, upload the versioned
`cwn-combat-enhancements-v0.1.0.zip` release asset. The ZIP must contain
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

## Known v0.1 limitations

- Results require the attacker's token and targets to be on the currently viewed
  scene when the card renders. Otherwise distance is marked unavailable.
- Unknown/custom scene distance units cannot be converted to weapon-range meters.
- Melee attacks select melee AC and report distance, but v0.1 does not enforce a
  reach limit because SWNR's melee compendium entries contain generic range data.
- The module recognizes SWNR's existing attack-card HTML because SWNR 2.3.0 does
  not attach weapon/target metadata to every attack message. A future SWNR card
  markup change may require a compatibility update.
- Multi-level/elevation distance and wall/line-of-sight checks are not included.
