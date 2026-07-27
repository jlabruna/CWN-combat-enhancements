# CWN Combat Enhancements

A minimal Foundry VTT v13 companion module for **Cities Without Number** games
running on **Systems Without Number Redux (SWNR) 2.3.0**.

## Current scope

- Captures the user's targeted tokens when an SWNR weapon attack is rolled.
- Detects melee attacks through `weapon.system.isMelee`.
- Uses `actor.system.meleeAc` for melee and `actor.system.ac` for ranged attacks.
- Measures token-center distance with Foundry's grid path measurement.
- Treats SWNR weapon ranges as meters and converts common scene units.
- Applies CWN's Prone attack modifiers using condition state captured when the
  attack is rolled. Touching or diagonally touching token footprints count as
  adjacent.
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
- Includes an optional experimental **Network Console** for mapping CWN network
  nodes, connections, hidden connections, Barriers, and visible network
  contents. It is disabled by default.
- Adds Weapon Family metadata to SWNR weapon sheets without overwriting the
  native Ammo Type field.
- Optionally reloads family-aware weapons from a selected, actor-owned physical
  magazine with the exact same family, preserving partial magazines and deleting
  depleted magazine Items.

Ordinary attacks continue to use SWNR's original rolls and loaded-ammunition
expenditure. The optional magazine feature only replaces the actor-sheet reload
action for family-aware weapons. Suppressive Fire has its own rules workflow and
spends two rounds. Hard cover is selected manually in its confirmation window.

## Install on The Forge

Install the module using this manifest URL:

```text
https://github.com/jlabruna/CWN-combat-enhancements/releases/latest/download/module.json
```

Then enable **CWN Combat Enhancements** in the world's Manage Modules screen and
ensure SWNR's **CWN Armor** setting is enabled so melee AC is derived.

For a manual Forge import, upload the versioned
`cwn-combat-enhancements-v0.12.0.zip` release asset. The ZIP must contain
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
- Weapon sheet: `templates/item/attribute-parts/weapon.hbs`.
- Native ammunition source: `weapon.system.ammo.current`.
- Loaded rounds: `weapon.system.ammo.value/max`.
- Count-based magazine rounds: `item.system.uses.value/max`, with
  `item.system.uses.consumable === "count"`.
- Actor-sheet reload action: `SWNActorSheet.DEFAULT_OPTIONS.actions.reload`,
  originally inherited from `SWNBaseSheet._onReload()`.

## Weapon Families and physical magazines

Weapon Family is semantic compatibility metadata, not a displayed-name match.
Family keys are lowercase slugs such as `combat-rifle` or `heavy-pistol`.

The module resolves a weapon family in this order:

1. `flags["cwn-combat-enhancements"].weaponFamily`
2. `flags["cwn-content-pack"].weaponFamily`
3. Recognized legacy
   `flags["harbour-city-stories"].baseWeapon` values through a controlled map
4. No family, which preserves native SWNR behavior

Magazine family resolution uses:

1. `flags["cwn-combat-enhancements"].magazineFamily`
2. `flags["cwn-content-pack"].magazineFamily`

The **Weapon Family Editing** world setting controls whether the override is
editable by the GM only (default), Item owners, or nobody. The permission is
enforced on both the sheet and `preUpdateItem`; disabling an input is not the
only protection.

The **Enable exact magazine automation** world setting defaults to enabled.
When enabled, a family-aware weapon can reload only from its selected,
actor-owned `count` consumable with the exact same Magazine Family and at least
one round. Readied and Stowed magazines are both accepted; location is
deliberately ignored.

The **Automatically select compatible magazine** world setting also defaults to
enabled. Reload keeps a valid current selection. If that reference is missing,
stale, empty, or incompatible, the module selects the compatible magazine with
the smallest remaining amount that can completely fill the weapon. If none can
fill it, the module selects the compatible magazine with the most rounds.
Otherwise-equal candidates use their Item ID as a deterministic tie-breaker.
Disable this setting to retain the v0.10.3 requirement to choose a magazine
manually.

Reloading transfers only the lesser of the weapon's missing rounds and the
selected magazine's remaining rounds. A partial magazine remains a distinct
Item. A depleted magazine is set to zero, its stale weapon reference is cleared,
and the embedded Item is deleted. Empty magazines are not created, magazines
are never merged, and this module does not provide refilling or Encumbrance
rules.

CWN Content Pack integration is optional. Untagged weapons and worlds with exact
magazine automation disabled use SWNR's native ammunition source selection and
reload logic. GMs can still find **Native Ammo Type** under **Advanced SWNR
Compatibility** on the weapon sheet.

## Visual Network Console

Enable **Experimental Network Console** under **Configure Settings > CWN Combat
Enhancements**, then reload the world. Open it from the network icon in the
Token controls or from the module's settings submenu.

Version 0.12.0 turns the GM console into a visual network editor and a
GM-controlled Demon encounter runner while retaining
the existing Journal storage, player projection, sockets, and program-request
validation:

- drag any of the eleven supported node types from the palette to the canvas;
- drag existing nodes with live connection geometry and persistent positions;
- use **Auto Arrange** when a saved layout needs to be rebuilt;
- select nodes or connections to edit them in the contextual inspector;
- add structured datafiles, source-backed CWN Demons, and Watchdogs to nodes;
- reveal each node, connection, datafile, Demon, or Watchdog independently.

Dropping a palette node while another node is selected creates one default
connection between them. The compact Nodes and Connections lists remain as
collapsed keyboard/admin fallbacks, and the original Add Connection dialog is
still available.

The Demon selector uses the CWN table exactly: Tripwire, Mastiff, Siren,
Cataphract, Ogre, Headsman, Hydra, and Nemesis, plus a validated **Custom
Demon** option. Standard classes keep their fixed HP, skill, command-line limit,
and cost. Programming is separate from class and offers Bouncer, Patroller,
Gatekeeper, Shieldbearer, Repairman, Trapper, Executioner, and Custom
Programming profiles. Profile commands are shown in priority order; GMs can add
controlled Common Command Lines without losing profile defaults.

Expand a Demon in the right inspector to change HP/state, reveal it, apply
damage, restore it, or trigger its rule-aware command buttons. Supported
actions include confirmed Alert, Send Message, Reboot, and Move workflows;
Demon-side opposed rolls for Stun, Paralyze, and Kill Avatar; and clear
GM-guidance cards for commands whose complete encounter state is not tracked.
The module never chooses a priority or action automatically. Zero HP marks the
Demon **Fragged** and disables its actions; no reboot timer is run.

Node Description and Private GM Notes now live behind the inspector's
**Details/Notes** button. The main inspector order is node essentials, Demons,
Datafiles, then Watchdogs. Network Console window size and position are stored
as a client setting and restored within the current viewport.

The schema is version 3. Old string datafiles, Demons, and Watchdogs are
preserved as hidden structured legacy entries, and old nodes receive one
persisted automatic layout. Legacy Verb/Subject choices and free-text commands
are preserved as legacy programming lines. Migration only updates the module's network flag.
The full network remains in a GM-only Journal Entry. Players receive a sanitized
projection containing only revealed nodes, connections, entity names and
player-safe datafile fields. Positions are included only for revealed nodes.
Private notes, Demon HP, skill, commands, and current programs are never
published.

Players can select a revealed node and send CWN-labelled requests to the GM,
including **Jack In**, **Move Nodes**, **Look for Hidden Connections**, **Run a
Program**, **Copy File**, and **Issue Command**.

**Run a Program** finds SWNR cyberdeck Actors linked to a hacker controlled by
the requesting player. The player can only choose Verbs and Subjects embedded
on that cyberdeck, which are the programs prepared on it. The request is blocked
when the Verb's allowed target types do not match the selected Subject. The GM
receives the hacker, cyberdeck, combined program, Access cost, check modifier,
and selected node.

The encounter controls remain deliberately GM-directed. The console does not:

- autonomously execute Demon priorities or resolve the player's opposed roll;
- spend Access or CPU;
- track avatar locations, cybercombat initiative, or one-hour Demon reboots;
- create or automate Watchdog actors;
- enforce server limits or limit a published network to a designated player.

The saved network schema already reserves an authorization list so
designated-player sharing can be added without redesigning saved networks.

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
- Prone affects Target Check attack totals, but this module does not restrict
  token movement or spend the Move action required to stand.
- Weapon-sheet and reload integration targets SWNR 2.3.x. If SWNR changes the
  weapon template or `SWNActorSheet.DEFAULT_OPTIONS.actions.reload`, the module
  logs a compatibility warning and leaves the affected integration unpatched.
- Physical magazine Items are expected to be supplied by a content module or
  created by the user. Version 0.11.0 does not create or migrate weapons or
  magazines.

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

### 0.12.0

- Added source-backed Demon programming profiles, controlled Common Command
  Lines, Custom Demons, schema-v3 migration, and expandable inspector controls.
- Added GM-triggered, rule-aware Demon actions, target validation, chat cards,
  Alert and movement state changes, and confirmed Demon damage handling.
- Moved node details behind a compact dialog and added client-specific Network
  Console geometry persistence.

### 0.11.0

- Redesigned the GM Network Console around a draggable node palette, persistent
  canvas positions, live connection updates, and contextual node/connection
  inspectors.
- Added guarded automatic connections for palette drops, duplicate connection
  prevention, node duplication, safe deletion, and explicit Auto Arrange.
- Added structured datafiles, source-backed CWN Demon templates and encounter
  bookkeeping, structured Watchdogs, per-entry reveal controls, and player-safe
  node-card displays.
- Migrated legacy Network Console data to schema version 2 without rewriting
  unrelated Journal content.
- Added pure schema, migration, projection, graph-integrity, and rules-data
  tests while preserving the v0.10.6 resize-safe connection renderer.

### 0.10.6

- Fixed Network Console connections shifting relative to stationary node cards
  when the application canvas changed size.
- The SVG viewBox now tracks its rendered CSS-pixel dimensions so resizing
  cannot introduce aspect-ratio scaling or letterbox offsets.

### 0.10.5

- Fixed Network Console connection lines becoming detached from their rendered
  source and target node cards.
- Connections now use post-layout node measurements converted into SVG-local
  coordinates and terminate at the node-card edges.
- Geometry refreshes after console rerenders, graph or node resizing,
  application/window resizing, and graph scrolling.
- Hidden connections, one-way arrows and barrier markers use the same corrected
  geometry.

### 0.10.4

- Automatically selects a compatible physical magazine when the current
  selection is missing, stale, empty, or incompatible.
- Prefers the smallest magazine that can fill the weapon, otherwise the
  compatible magazine with the most rounds, with deterministic Item-ID
  tie-breaking.
- Added an enabled-by-default world setting that can restore v0.10.3 manual
  selection behavior.
- Preserved exact transfer, depleted-magazine deletion, partial-magazine
  retention, visible selector updates, and native SWNR fallbacks.

### 0.10.3

- Fixed family-aware actor-sheet reload clicks falling through to SWNR's native
  one-use reload handler.
- Attached exact-magazine handling directly to rendered reload controls while
  preserving native SWNR behavior for all fallback cases.

### 0.10.2

- Prevented inactive optional Content Pack and legacy flag scopes from aborting
  weapon-sheet rendering.
- Added a regression test for family resolution when an optional flag scope is
  unavailable.

### 0.10.1

- Fixed the Weapon Family field failing to appear because the sheet integration
  targeted SWNR's nested Ammo Type form group instead of its direct grid child.
- Restored the GM-only Advanced SWNR Compatibility section on weapon sheets.

### 0.10.0

- Added centralized Weapon Family and Magazine Family resolution with optional
  CWN Content Pack and controlled legacy metadata support.
- Replaced the ordinary weapon-sheet Ammo Type presentation with a
  permission-controlled Weapon Family field while retaining native Ammo Type in
  a GM-only advanced compatibility section.
- Added optional exact-family magazine selection and partial-round transfer.
- Depleted embedded magazine Items are deleted after their remaining rounds and
  the weapon's stale source reference are safely updated.
- Added automated family, permission, compatibility, and reload-calculation
  tests plus a focused Foundry manual regression checklist.
- Added repeatable release staging and a tag-driven GitHub Actions build.

### 0.9.0

- Run a Program now reads the acting player's linked SWNR cyberdeck.
- Only Verbs and Subjects prepared on that deck can be requested.
- Incompatible program target types are rejected before sending the request.
- GM notifications include the hacker, cyberdeck, program, Access cost, check
  modifier, and network node.

### 0.8.1

- Fixed the Network Console template so the console window opens correctly.

### 0.8.0

- Added an opt-in experimental Network Console with GM editing, player reveal,
  persistent sanitized sharing, and player-to-GM action requests.
- Added the Network Console world setting and launcher.
- Prepared the saved-data schema for later designated-player sharing.

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
