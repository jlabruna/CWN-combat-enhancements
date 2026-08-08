# Changelog

## 0.16.1

- Fixed the GitHub Actions test command so the v0.16 active-session release can
  be validated and packaged correctly on the Linux Node.js runner.
- No Network Console behavior changed from 0.16.0.

## 0.16.0

- Added durable, GM-authoritative active hacker sessions to the experimental
  Network Console.
- Players can request physical or wireless Jack In with a controlled hacker and
  linked prepared cyberdeck; the active GM approves or rejects the request.
- Physical sessions can request one-hop movement across revealed connections,
  respecting direction and locked barriers. Wireless sessions display the RAW
  `-2` context and cannot Move Nodes.
- Added per-node hacker avatar markers, private player session status, GM session
  visibility, player Jack Out requests, and a GM force-end control.
- Persisted canonical sessions in the GM-only Journal network flag using schema
  version 4. The shared world projection remains session-free, while targeted
  socket messages expose only each player's own sanitized sessions.
- Added current-node and wireless-context details to Run a Program requests
  without automating checks, Access spending, or program execution.
- Added focused migration, privacy, ownership, movement, barrier, direction,
  wireless, cleanup, and multi-session automated coverage.

## 0.15.0

- Added linked player-character pilot attacks for SWNR Drone actors.
- Character-piloted drones now use the pilot's Attack Bonus, the better of
  Dexterity or Intelligence, and the better of Drive or Program for To Hit.
- Dexterity wins equal attribute ties and Program wins equal Skill-rank ties;
  genuine untrained ranks remain `-1` and are not converted to SWNR's `-2`
  weapon-skill fallback.
- Added a reduced character-pilot attack dialog with a read-only calculation
  summary plus only Burst Fire and the manual modifier.
- Added labelled pilot Attack Bonus, attribute, and Skill entries to expanded
  attack modifier breakdowns without adding pilot values to damage, Shock, or
  Trauma.
- Recognizes native Remote Control Unit cyberware without applying a speculative
  bonus or penalty because SWNR exposes no unambiguous control-board state.
- Preserved the existing linked-NPC pilot path and all native SWNR ammunition,
  damage, Shock, Trauma, targeting, chat-card, and Dice So Nice behavior.
- Added automated coverage for pilot resolution, tie rules, missing and
  untrained Skills, native pilot links, dialog contents, roll routing, and safe
  malformed-link handling.

## 0.14.0

- Added simplified linked-NPC pilot attacks for SWNR drone actors.
- Qualifying drone attacks now use the linked NPC pilot's complete Ranged
  Attack Bonus plus weapon, Burst, manual, and ordinary situational modifiers.
- Removed Stat and Skill choices from only the qualifying NPC-controlled drone
  attack dialog; character-piloted drones retain native SWNR behavior.
- Invalid or deleted NPC pilot links now stop safely with a clear warning.
- Preserved SWNR's native ammunition, magazine, damage, Shock, Trauma, range,
  Target Check, roll mode, Dice So Nice, and damage-button pipelines.
- Prevented stored weapon description HTML from leaking into qualifying drone
  attack headings while leaving normal Item description posts unchanged.
- Added focused automated coverage for pilot resolution, roll routing,
  modifier isolation, invalid links, method guards, and card sanitization.

## 0.13.8

- Worked around SWNR 2.3.1 resetting a weapon's stored Stat to `Ask` during
  its own partial ammunition update.
- Tagged Content Pack character weapons now retain Dexterity, Strength, or
  Wisdom on the embedded Item after firing, reloading, and later updates.
- Kept untagged and custom weapons under native SWNR Stat handling.

## 0.13.7

- Fixed repeated Content Pack weapon attacks using SWNR's stale pre-update
  weapon model after resolving portable Skill and Stat defaults.
- Content Pack firearms now continue to use Dexterity, Mortars continue to use
  Wisdom, and melee weapons continue to use Strength on successive attacks.
- Preserved SWNR's native Remember settings behaviour and custom weapon data.

## 0.13.6

- Added a versioned runtime entry point and release-specific compatibility
  import so Forge/browser caches cannot keep the pre-Stat-repair module graph.
- Ensured the v0.13.5 tagged weapon Stat recovery actually loads after a
  module update, including Shoot/Dexterity, Stab/Strength, and Mortar/Wisdom.
- Preserved existing NPC, custom weapon, roll, ammunition, and chat behavior.

## 0.13.5

- Added backward-compatible native Stat recovery for tagged Content Pack
  weapons whose generated Item carries `nativeSkill` but lacks `nativeStat`.
- Restored Dexterity for tagged Shoot weapons and Strength for tagged Stab
  weapons while preserving Mortar/Wisdom and explicit native-Stat mappings.
- Kept NPC weapons and custom or untagged weapons outside the correction.

## 0.13.4

- Extended tagged Content Pack character imports to restore the intended
  native Dexterity, Strength, or Wisdom Stat when SWNR presents it as `Ask`.
- Preserved the v0.13.3 NPC boundary and actor-owned Shoot/Stab Skill binding.
- Kept NPC weapons and untagged/custom weapons outside the import correction.

## 0.13.3

- Corrected NPC weapon ownership detection so copied PC weapons now reliably
  use SWNR's native NPC dialog instead of resolving a stale PC Skill Item ID.
- Added opt-in Content Pack Skill binding: a newly imported tagged character
  weapon resolves its portable Shoot or Stab metadata to the receiving
  character's matching actor-owned Skill Item.
- Kept NPC items and untagged/custom weapons unchanged; an existing tagged
  portable character copy resolves only when it is next rolled.

## 0.13.2

- Added a narrowly-scoped SWNR NPC weapon-roll compatibility boundary.
- NPC weapon rolls now use SWNR's ordinary NPC dialog path rather than a
  copied PC weapon's remembered actor-specific skill ID, preventing the native
  missing-skill warning and false `-2` skill result.
- Preserved SWNR's NPC attack bonus, manual modifier, Burst, damage,
  ammunition, melee/ranged calculations, and all PC roll/remember behavior.
- Added guarded, once-only installation and automated coverage for the system
  boundary, NPC bypass, PC preservation, and missing-method warning path.

## 0.13.1

- Verified the module against Foundry VTT 14.365 and SWNR 2.3.1.
- Migrated attack-result and Suppressive Fire enhancement to Foundry V14's
  `renderChatMessageHTML` hook.
- Added shared Foundry V13/V14 chat-visibility handling so public, GM, blind,
  and self messages retain the selected core message mode.
- Replaced the deprecated global Handlebars template call used by Monthly
  Expenses with Foundry's namespaced V14 renderer while retaining a V13
  fallback.
- Added automated compatibility coverage and release-package assertions for
  the new shared helper.

## 0.13.0

- Added a GM-only Cyberware Maintenance section to native SWNR Cyberware sheets
  with an upkeep-required toggle, optional base-cost override, calculated
  monthly upkeep, player-visible status, and update-level permission checks.
- Added a shared pure calculation engine for five-percent cyberware upkeep,
  Lifestyle, recurring inventory services, custom expenses, and monthly totals.
- Added a read-only Monthly Expenses total and prominent dollar-sign management
  button beside character currency on the Inventory tab.
- Added a viewport-safe, responsive Monthly Expenses dialog with Lifestyle,
  cyberware, service, custom-expense, and total-breakdown sections.
- Added Squatter, Slum, Middle-class, Fine, and Luxury costs and their
  information-only System Strain modifiers; existing actors remain visibly
  Unconfigured until explicitly updated.
- Added metadata, catalogue-key, and conservative normalized-name detection for
  Smartphone Service Plan and Monthly Bus Pass, including quantity
  multiplication and location independence.
- Added stable custom-expense rows with validation, duplicate-ID repair, and
  owner/GM permissions.
- Preserved SWNR's native Cyberware Strain behavior and all existing Network
  Console, Demon, combat, target-check, and physical-magazine features.

## 0.12.6

- Added labelled modifier breakdowns to expanded Demon checks, identifying the
  Demon Skill Bonus, action-specific modifier, and total modifier.
- Added labelled damage breakdowns showing how the Demon Skill Bonus determines
  the number of d10 damage dice.
- Stored the breakdown data on each Demon action message so historical cards
  retain the values used when the action was rolled.

## 0.12.5

- Replaced the static Demon check and potential-damage summaries with Foundry's
  rendered Roll markup so both results expand to show dice and modifiers like
  normal SWNR weapon rolls.
- Added explicit neutral text and muted-text fallbacks for module cards when
  CWN Interface Theme is disabled, while retaining the theme's own variables
  whenever it is enabled.

## 0.12.4

- Added the standard Foundry/SWNR `.chat-card.item-card` compatibility classes
  to module-owned reload and Network Console cards so CWN Interface Theme
  recognizes and themes them.
- Rendered Demon checks and potential damage with familiar Foundry dice
  formula and total structures while preserving the existing Roll data.
- Prevented long reload-card labels from collapsing into vertical text and
  improved readable neutral colors when no optional theme is enabled.
- Fixed automatic magazine selection triggering an SWNR sparse-document
  migration error by persisting the selected magazine reference atomically
  with the exact reload transfer.
- Stabilized the Add/Edit Demon dialog width when changing class or programming
  profile, including when Additional Common Command Lines are expanded.

## 0.12.3

- Filtered standard Demon Programming Profiles by the selected class's fixed
  command-line capacity while keeping Custom Programming available.
- Added shared capacity helpers, live total/limit feedback, at-capacity
  controls, and final validation across profile, Additional Common, and Custom
  Programming lines.
- Preserved existing incompatible and over-capacity Demon data for explicit GM
  correction without truncating or silently rewriting command lines.
- Added a shared, escaped semantic chat-card renderer for exact reload, Network
  Console Demon actions, and Demon damage messages.
- Published stable module-owned chat-card classes and neutral CSS custom
  properties so optional themes can override presentation without becoming a
  module dependency.
- Preserved reload calculations, Demon rules, secrecy, roll modes, structured
  flags, and the Apply Damage to Demon action.

## 0.12.2

- Fixed the Add/Edit Demon dialog still growing beyond the viewport when
  Additional Common Command Lines were expanded.
- Locked the rendered dialog to its initial viewport-safe height and completed
  the internal flex/overflow chain so the form body scrolls while its action
  footer remains accessible.
- Preserved the canonical awaited Demon save introduced in 0.12.1; its brief
  save delay ensures Journal and player-projection persistence completes before
  the dialog closes.

## 0.12.1

- Fixed Add/Edit Demon silently ignoring submitted forms because the form uses
  `classKey` while the handlers checked the obsolete `class` field.
- Reworked Demon submission to re-read the canonical Network Journal and node,
  await normalization, Journal persistence, and player projection publication,
  and rerender only after a successful save.
- Added duplicate-submission protection and clear notification/logging while
  keeping the dialog open when validation or persistence fails.
- Constrained the Demon dialog to the current viewport, with a scrollable body
  and accessible header/footer when profiles, additional lines, custom
  programming, or notes make the form tall.
- Added focused persistence, multi-node, normalization, duplicate, and
  save-failure regression tests without changing combat or ammunition systems.

## 0.12.0

- Reworked Demon creation around fixed source-backed classes, validated Custom
  Demons, and separate Common Demon Programming profiles.
- Added the seven standard programming profiles plus Custom Programming, exact
  prioritized profile commands, controlled Common Command Line additions,
  duplicate handling, and command-line limit enforcement.
- Upgraded Network Console storage to schema version 3 while preserving legacy
  class fields, Verb/Subject choices, and free-text command lines idempotently.
- Made expandable Demon entries the primary GM encounter interface with direct
  HP, state, damage, restore, reveal, duplicate, delete, and command controls.
- Added a central rule-aware action registry, GM-confirmed no-roll actions,
  Demon-side opposed Program rolls, validated targets, movement direction and
  locked-Barrier checks, private/public chat cards, and manual guidance where
  complete automation would require invented encounter state.
- Added Alert progress updates, device reboot, Demon movement, Fragged action
  disabling, and structured GM-only Demon damage application.
- Moved node Description and Private GM Notes behind a compact Details/Notes
  dialog and reordered the inspector to show Demons before Datafiles and
  Watchdogs.
- Added client-specific, viewport-clamped Network Console window geometry
  persistence.
- Added focused Demon rules, migration, projection, permissions, target,
  movement, alert, damage, and chat-sanitization tests without changing combat,
  magazine reload, or Suppressive Fire behavior.

## 0.11.0

- Added a visual GM network editor with an eleven-type draggable node palette,
  persistent node positions, live connection updates during dragging, and an
  explicit Auto Arrange fallback.
- Replaced the static inspector with compact editable node and connection
  inspectors, including reveal, connect, duplicate, delete, source/target,
  Barrier, one-way, and private-note controls.
- Retained the collapsed Nodes and Connections lists and the existing dialog
  workflows as accessibility and admin fallbacks.
- Added structured datafiles with integer values, discovery and copied state.
- Added the eight source-backed CWN Demon templates with exact cost, command-line
  limit, HP, and skill values, editable encounter state and command priorities,
  validated SWNR 2.3.0 Verb + Subject display, reveal controls, and distinct
  fragged styling.
- Added repeatable Watchdog entries without introducing actor automation.
- Upgraded saved networks to schema version 2. Legacy string contents and
  unsaved layouts are normalized and persisted idempotently in the existing
  module Journal flag.
- Hardened player projections so hidden nodes and entries, GM notes, Demon
  statistics, command lines, and current programs are never published.
- Added Network Console model tests for migration, projection sanitization,
  positions, connection integrity, node duplication/deletion, malformed data,
  and source-backed Demon defaults.

## 0.10.6

- Fixed Network Console connection geometry shifting when the application was
  resized but the automatically positioned node cards did not move.
- The SVG now receives a live viewBox matching its rendered CSS-pixel size
  before connection coordinates are calculated, preventing aspect-ratio
  scaling and letterbox offsets.
- Added a regression test confirming that expanding the SVG canvas cannot move
  connections whose node cards remain fixed.

## 0.10.5

- Fixed Network Console connections rendering away from their source and target
  node cards when the graph canvas was resized or expanded by CSS.
- Connection endpoints are now measured from the rendered node-card edges and
  converted into the SVG layer's own coordinate system after layout.
- Connection geometry now refreshes after rerenders, graph or node resizing,
  application/window resizing, and graph scrolling.
- Preserved hidden-connection styling, one-way arrows, barrier markers, graph
  layout, player projections, and all existing Network Console behavior.
- Added focused coordinate-conversion and branched-graph regression tests.

## 0.10.4

- Added automatic compatible-magazine selection when Reload is clicked.
- Retained a valid current magazine; missing, stale, empty, and incompatible
  references are replaced automatically.
- Selection prefers the smallest sufficient magazine, or the largest
  insufficient magazine, with deterministic Item-ID tie-breaking.
- Added the enabled-by-default **Automatically select compatible magazine**
  world setting. Disabling it preserves v0.10.3 manual selection.
- Family-aware exact reloads now warn without calling native reload when no
  compatible non-empty magazine exists.
- Preserved partial-magazine retention, depleted-magazine deletion and
  reference cleanup, visible selector updates, location independence, and all
  native SWNR fallback cases.

## 0.10.3

- Fixed family-aware actor-sheet reload clicks using SWNR's cached native reload
  action instead of exact round transfer.
- Exact-magazine handling is now attached to the rendered reload control and
  stops the native handler only when the weapon qualifies for automation.
- Untagged weapons, disabled automation, and unsupported ammunition types still
  use SWNR's native reload behavior.

## 0.10.2

- Fixed weapon-sheet rendering when the optional `harbour-city-stories` or CWN
  Content Pack flag scopes are not active. Family metadata is now read safely
  from the Item's stored flags without asking Foundry to validate an inactive
  package scope.
- Added a regression test for inactive optional flag scopes.

## 0.10.1

- Fixed the Weapon Family field failing to appear on SWNR 2.3.x weapon sheets
  by targeting the outer Ammo Type resource container used by the ammunition
  grid.
- Restored the GM-only Advanced SWNR Compatibility section and its Native Ammo
  Type control.

## 0.10.0

- Added centralized Weapon Family resolution from Combat Enhancements
  overrides, optional Content Pack metadata, and recognized legacy base-weapon
  flags.
- Added Magazine Family resolution from Combat Enhancements and optional
  Content Pack metadata.
- Replaced the normal weapon-sheet Ammo Type presentation with Weapon Family,
  including known choices, custom slug keys, an Unassigned state, and read-only
  presentation when editing is not permitted.
- Preserved Native Ammo Type in a GM-only Advanced SWNR Compatibility section.
- Added GM Only, Item Owners, and Nobody Weapon Family editing modes, enforced
  by both the sheet and `preUpdateItem`.
- Added optional exact-family physical-magazine reload automation, enabled by
  default.
- Added partial magazine transfer, safe depleted-magazine deletion, and stale
  selected-ammunition cleanup.
- Accepted both Readied and Stowed magazines while deliberately ignoring
  location.
- Preserved native SWNR reload behavior for untagged weapons and when exact
  magazine automation is disabled.
- Added Node test coverage, repeatable release staging, and a tag-driven GitHub
  Actions release build.

## 0.9.0

- Connected Network Console program requests to SWNR cyberdeck Actors.
- Run a Program now finds cyberdecks linked to hackers controlled by the
  requesting player.
- Players can only choose Verbs and Subjects actually loaded on the selected
  cyberdeck.
- Incompatible Verb and Subject target types are rejected before a request is
  sent.
- GM requests identify the hacker, cyberdeck, prepared program, Access cost,
  check modifier, and selected network node.
- Program checks, Access spending, CPU use, and program effects remain manual.

## 0.8.1

- Fixed a mismatched Handlebars block that prevented the Network Console window
  from rendering when opened from either launcher.

## 0.8.0

- Added an opt-in experimental Network Console for visualizing CWN networks.
- GMs can create multiple networks, set Security difficulty and server class,
  and add device nodes, connections, hidden connections, and Barriers.
- GMs can reveal individual nodes and connections to players while retaining
  private GM notes in a GM-only Journal Entry.
- Players receive a sanitized persistent view containing only revealed network
  information.
- Added CWN-labelled action requests such as Jack In, Move Nodes, Look for
  Hidden Connections, Run a Program, Copy File, and Issue Command.
- Player requests notify the GM but do not yet make checks, spend Access,
  consume CPU, or validate prepared Verbs and Subjects.
- Added a world setting to enable or disable the Network Console. It defaults
  to disabled and requires a reload when changed.
- Included an authorization field in the saved network schema for future
  designated-player sharing; v0.8.0 shares revealed information with all
  players.

## 0.7.0

- Added optional, target-specific automation for CWN's Prone attack modifiers.
- Melee attacks made by a prone attacker now take a -4 modifier.
- Attacks against an adjacent prone target gain +2; distant ranged attacks
  against a prone target take -2.
- Prone state and adjacency are captured when the attack is rolled, so later
  condition changes do not alter an existing chat card.
- Suppressive Fire now pre-confirms the brace-or-prone requirement when the
  shooter has the Prone status.
- Token movement and standing up remain manual.

## 0.6.2

- Corrected the Suppressive Fire confirmation to state that the weapon must be
  braced against a solid support or the gunner must have gone prone.
- Corrected the cancellation warning to use the same rules-accurate wording.

## 0.6.1

- Added labelled modifier breakdowns to expanded Suppressive Fire weapon-damage
  rolls.
- Expanded Evasion Save rolls now show the die, Evasion target, and save result.
- Expanded Trauma rolls now show the Trauma Die, target-specific Trauma Target,
  and whether the roll produced a Trauma Hit.

## 0.6.0

- Added **Use Suppressive Fire** to eligible SWNR weapon attack dialogs.
- Burst Fire and Suppressive Fire now both start unticked on every attack and
  are mutually exclusive.
- Added a temporary 90-degree cone aimed through exactly one targeted token.
- Limited affected targets to the weapon's normal range and non-hidden tokens
  inside that cone.
- Added a confirmation window for the required braced or mounted state and
  manual hard-cover exclusions.
- Suppressive Fire now spends two rounds, rolls weapon damage once, and rolls
  each uncovered target's Evasion Save separately.
- Failed Evasion Saves take half damage rounded up and receive an individual
  Trauma Die check; successful saves and hard-cover targets take no damage.
- Added a dedicated Suppressive Fire chat card and GM-only damage action that
  delegates Damage Reduction, Soak, HP, and defeat handling to SWNR.

## 0.5.1

- Fixed modifier breakdowns remaining visible when their Foundry roll details
  were collapsed.
- Modifier breakdowns now open and close with their corresponding dice tooltip.

## 0.5.0

- Added labelled modifier breakdowns inside expanded weapon attack rolls.
- Attack details itemise the attack die, Burst Fire, manual modifier, character
  attack bonus, weapon bonus, attribute modifier, skill rank, and total.
- Damage details itemise weapon damage, Burst Fire, attribute modifier, damage
  bonus, and total.
- Trauma rolls and Trauma damage now explain their die or multiplier components.
- Breakdown values are captured at roll time and do not change if the actor or
  weapon is edited later.

## 0.4.0

- Successful attacks that also beat a target's Trauma Target are now displayed
  as a blue **TRAUMA HIT!** instead of a standard green **HIT**.
- Trauma outcomes are determined separately for every target.
- Misses and out-of-range attacks remain misses regardless of the Trauma Die.

## 0.3.1

- Fixed NPC Soak incorrectly stacking from multiple active body-armour suits.
- Soak now comes from the single highest active body armor plus active armor
  accessories, such as Absorption Plates.
- NPC armor and accessories must now be both Readied and Equipped to provide
  protection.
- Stowed NPC armor cannot be equipped from the NPC armor list, and changing an
  armor item's carried location automatically unequips it.

## 0.3.0

- Added NPC armor defense calculation for SWNR's CWN mode.
- Ticked NPC armor now determines ranged and melee AC, using the highest active
  body armor and active shield bonuses.
- Manual Base AC and Melee AC remain the NPC's fallback defenses.
- Only ticked NPC armor contributes Soak and Trauma Target protection.
- Added a world setting allowing GMs to disable NPC armor automation.

## 0.2.0

- Added a GM-only **Apply damage to HIT targets** action to attack cards.
- Applies damage to every target captured at attack time that the Target Check
  marks as a hit, without requiring those tokens to remain selected.
- Compares the rolled Trauma Die with each target's modified Trauma Target and
  applies either normal damage or multiplied Trauma damage independently.
- Uses SWNR's existing health application so Damage Reduction, Soak, HP,
  defeated status, and floating damage numbers continue to work normally.
- Restores the user's original controlled-token selection after damage is
  applied and records completed application on the message to discourage
  accidental double damage.
- Added natural 1 automatic misses and natural 20 automatic hits to Target Check.

## 0.1.1

- Fixed weapon classification and range lookup for unlinked NPC tokens.
- The module now prefers the attacking token's synthetic actor and embedded
  weapon data over the original world actor.

## 0.1.0

- Added target-aware melee and ranged AC checks.
- Added token distance measurement and CWN ranged-weapon range bands.
- Added normal, extreme (−2), and out-of-range results.
