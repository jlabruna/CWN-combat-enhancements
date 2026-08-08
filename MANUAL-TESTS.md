# Foundry VTT 14.365 / SWNR 2.3.1 manual test checklist

Use a disposable world with CWN Combat Enhancements 0.16.1 enabled. Test with
actor-owned weapon and magazine Items. Give each magazine
`type: "item"`, `system.uses.consumable: "count"`, positive
`system.uses.value/max`, and a Magazine Family flag.

Do not claim runtime success until these checks have been completed in Foundry.

## v0.16.1 active Network Console hacker sessions

Use one active GM and at least two player users. Give each player ownership of a
Character hacker and an SWNR cyberdeck linked to that hacker. Prepare at least
one compatible Verb and Subject on a deck.

1. Enable the experimental Network Console, reload, and create or open a network
   with at least three revealed nodes. Connect two normally, add a locked barrier
   to another route, and include a revealed one-way connection.
2. As a player, select a revealed entry node and click **Jack In**. Choose the
   controlled hacker/deck and Physical. Confirm the GM receives an approval
   dialog and that rejecting it creates no session.
3. Repeat and approve. Confirm the hacker avatar appears on the entry node, the
   player sees their private Physical session status, and the GM sees the full
   active-session entry with a force-end control.
4. Close and reopen the console and Ctrl+F5 both clients. Confirm the session and
   current node persist from the Journal-backed network state.
5. Select a directly connected revealed node and request **Move Nodes**. Approve
   as GM and confirm the avatar/current-node status moves exactly one hop.
6. Confirm movement is refused across a locked barrier, toward a hidden node,
   across a hidden connection, more than one hop, and backward through a one-way
   connection. Confirm forward travel through the one-way connection works.
7. Jack Out and reject once, then approve. Confirm the session remains after the
   rejection and disappears from both clients after approval.
8. Jack In wirelessly. Confirm the session displays the RAW `-2` context and a
   Move Nodes request is blocked before reaching the GM.
9. With an active session, request **Run a Program**. Confirm the GM notification
   includes hacker, deck, Verb/Subject, selected node, current session node,
   connection type, and wireless penalty context. Confirm no roll or Access spend
   occurs automatically.
10. Jack in two different players, including both on the same node. Confirm the
    GM sees both, each player sees only their own session, and ending one does not
    affect the other.
11. Switch networks and return. Confirm sessions remain bound to their original
    network and do not appear on the wrong network.
12. Use the GM force-end control. Confirm the selected session is removed and its
    owner receives the updated empty projection.
13. Repeat Jack In with an unowned hacker, stale/deleted actor or cyberdeck,
    mismatched hacker/deck link, and hidden entry node. Confirm no session is
    created and no private UUID or hidden topology reaches the player UI.
14. Re-test the other player request buttons and Demon controls. Confirm they
    remain request/manual or GM-directed exactly as documented.
15. Clear the console, Ctrl+F5, and repeat one physical and one wireless session.
    Confirm there are no relevant red errors or duplicate approvals.

## v0.15.0 linked-character drone attacks

1. Assign a player Character as an SWNR Drone's native pilot. Give the pilot
   different Dexterity and Intelligence modifiers and different Drive and
   Program ranks. Note the pilot and weapon Attack Bonuses.
2. Roll the drone weapon. Confirm the dialog identifies the pilot and displays
   the chosen attribute, chosen Skill, and pilot total. It must show only that
   read-only summary, eligible Burst Fire, and the manual Modifier; it must not
   show editable Stat, Skill, or Remember controls.
3. Confirm To Hit equals d20 + pilot Attack Bonus + better(Dexterity,
   Intelligence) + better(Drive, Program) + weapon Attack Bonus + Burst +
   manual and ordinary situational modifiers.
4. Set Dexterity equal to Intelligence and confirm Dexterity is chosen. Set
   Drive equal to Program and confirm Program is chosen.
5. Expand the attack breakdown. Confirm separate labelled entries identify the
   pilot Attack Bonus, chosen attribute, and chosen Skill. Confirm pilot values
   are absent from damage, Shock, Trauma Die, and Trauma damage.
6. Test a pilot with only Drive, only Program, and a genuine rank `-1` Skill.
   Confirm the represented Skill is used and rank `-1` remains `-1`.
7. Test a character with neither Drive nor Program. Confirm no roll occurs and
   a clear warning reports that the pilot Skill cannot be resolved.
8. Test with and without native `Remote Control Unit` cyberware. Confirm the
   same documented attack formula is used; no speculative RCU modifier appears.
9. Repeat with Burst and positive/negative manual modifiers. Confirm ammunition
   is spent once and all native damage, Shock, Trauma, range, Target Check,
   damage buttons, roll modes, and Dice So Nice behavior remains functional.
10. Change the character pilot's attributes, Skills, or Attack Bonus and attack
    again. Confirm the current values are used without editing the drone weapon.
11. Remove or delete the pilot and confirm no roll occurs and the invalid-pilot
    warning appears. Restore the pilot and confirm attacks resume.
12. Repeat representative attacks through the embedded weapon, Drone sheet,
    and Token Action HUD if installed. Test both a world Drone and a synthetic
    token Drone linked to a world Character.
13. Repeat the v0.14.0 linked-NPC tests and ordinary character/NPC weapon tests.
    Confirm their dialogs and formulas are unchanged.
14. Ctrl+F5 and repeat one NPC-pilot and one character-pilot attack. Confirm no
    duplicate dialog, duplicate ammunition spend, or relevant red console error.

## v0.14.0 linked-NPC drone attacks

1. Create or open an SWNR Drone with a weapon and assign an NPC as its native
   pilot. Note the NPC's Ranged Attack Bonus and the weapon's Attack Bonus.
2. Roll the drone weapon. Confirm the dialog shows only eligible Burst Fire and
   the manual Modifier; it must not show Stat, Skill, or Remember controls.
3. Roll without Burst or a manual modifier. Expand the attack result and confirm
   the breakdown identifies the NPC pilot ranged attack bonus and weapon attack
   bonus, with no drone Stat, Skill, NPC Skill Bonus, or untrained -2 entry.
4. Check the total against: d20 + NPC pilot Ranged Attack Bonus + weapon Attack
   Bonus. Confirm damage does not include the pilot Attack Bonus.
5. Repeat with Burst Fire and with a positive and negative manual modifier.
   Confirm the correct modifiers and normal ammunition costs apply once.
6. Confirm ordinary damage, Shock, Trauma, range, Target Check, hit/miss output,
   damage buttons, roll modes, and Dice So Nice remain functional.
7. Attack repeatedly from the embedded weapon, actor sheet, and Token Action
   HUD if installed. Confirm each attack uses the current pilot bonus and spends
   ammunition only once.
8. Reload from a physical compatible magazine, then attack again. Confirm exact
   reload, partial/depleted magazine behavior, and selector refresh are intact.
9. Change the linked NPC's Ranged Attack Bonus and attack again. Confirm the new
   value is used without editing the drone or weapon.
10. Remove or delete the linked pilot and attack. Confirm no roll occurs and the
    warning reads: `This drone has no valid pilot assigned.`
11. Link a Character pilot and use the v0.15.0 checklist above.
12. Roll a normal character weapon and a normal NPC weapon. Confirm their
    existing dialogs, formulas, and modifier breakdowns are unchanged.
13. Give the drone weapon a description containing paragraphs, bold text, and
    line breaks. Attack and confirm none of that catalogue text or raw HTML is
    inserted into the attack heading/card.
14. Post the same Item description normally to chat and confirm its stored
    description remains unchanged and displays normally.
15. Test a synthetic/unlinked Drone token and a world Drone actor, each linked
    to a valid world NPC pilot. Confirm both resolve and roll correctly.
16. Ctrl+F5, repeat representative NPC-pilot and character-pilot attacks, and
    confirm no duplicate dialog, duplicate ammunition spend, or relevant red
    console error appears.

## v0.13.8 NPC weapon-roll compatibility

1. Create or open an NPC with an unconfigured native weapon. Roll it and
   confirm the normal SWNR NPC roll dialog and ordinary NPC attack result.
2. Copy a PC weapon that has **Use Remembered Settings** enabled onto that NPC.
   Roll it and confirm there is no “No skill found, using -2” notification.
   Confirm the native NPC dialog opens and uses the NPC's existing attack bonus,
   manual modifier, Burst choice, damage, and ammunition normally.
3. Roll the original weapon on the PC. Confirm remembered PC skill selection
   and every normal PC behavior remain unchanged.
4. Ctrl+F5 and repeat step 2. Confirm the compatibility boundary still applies
   once and no duplicate dialog, warning, or error appears.
5. On a Character that owns a Shoot Skill, drag a new rifle directly from CWN
   Content Pack's weapon compendium. Confirm its Skill field changes from the
   portable prompt to that Character's Shoot Skill and its Stat is Dexterity,
   then roll twice and confirm both attacks use Dexterity with no missing-skill
   warning or -2 fallback. Reopen the weapon between rolls and confirm its
   Skill and Stat remain correctly resolved.
6. Repeat step 5 with a Stab weapon and a Character that owns Stab. Confirm it
   binds Stab and restores the documented Strength/Dexterity choice. Confirm a
   Character with no matching Skill remains on the native prompt instead of
   being assigned an unrelated Skill, while its native Stat still resolves.
7. Repeat step 5 with the Content Pack Mortar. Confirm both successive attacks
   use Wisdom rather than the first Stat listed in SWNR's prompt.

## v0.13.0 cyberware and Monthly Expenses

1. Open representative Content Pack and custom native Cyberware Items; confirm
   Cyberware Maintenance appears while native cost, Strain, and fields remain
   unchanged.
2. As GM, toggle Requires Monthly Upkeep and enter a valid override; confirm
   calculated upkeep uses five percent rounded to a whole dollar.
3. Enter a negative override; confirm it is rejected. Clear both native cost
   and override on a disposable Item; confirm a visible warning appears.
4. Confirm a player can see the status but cannot edit the maintenance controls.
5. Disable cyberware; confirm it still incurs upkeep. Remove it; confirm upkeep
   and native Cyberware Strain both recalculate through their respective owners.
6. Open a character Inventory tab; confirm Monthly Expenses appears beside
   Dollars (Stowed), is read-only, and the large `$` button opens the dialog.
7. At normal and narrow sheet widths, confirm the summary remains usable.
8. Test Unconfigured, Squatter ($0/-2), Slum ($300/-1), Middle-class
   ($1,000/0), Fine ($5,000/+1), and Luxury ($20,000/+2). Confirm the modifier
   is display-only and does not change SWNR System Strain.
9. Add several cyberware Items, exemptions, and overrides; confirm the breakdown
   and total.
10. Add Content Pack Smartphone Service Plan and Monthly Bus Pass Items. Change
    quantity and Readied/Stowed location; confirm $10 and $50 per quantity and
    no location effect.
11. Test legacy copies named `Smartphone Service Plan — One Month` and
    `Monthly Bus Pass`; confirm exact normalized fallback without double-count.
12. Add, edit, and delete custom expenses. Confirm blank names, negative values,
    and nonnumeric values cannot be saved.
13. Confirm the sheet total and dialog total agree after add/remove/update,
    closing and reopening, Ctrl+F5, and a world restart.
14. With a second client if available, confirm owner changes refresh for the GM
    and unauthorized users cannot update protected flags.
15. Confirm the dialog body scrolls within the browser viewport while header,
    Save, and Cancel remain accessible.
16. Test with and without CWN Interface Theme and confirm readable layout.
17. Run representative attack, Burst Fire, Suppressive Fire, exact reload,
    Network Console, and Demon actions; confirm no regressions or relevant red
    console errors.

## v0.12.6 focused regression checks

1. With a Skill Bonus 3 Demon, run Stun Avatar and expand Check.
2. Confirm the breakdown identifies Demon Skill Bonus +3, Stun Avatar
   modifier +1, and Total modifier +4.
3. Expand Potential damage and confirm the breakdown identifies Skill Bonus 3
   and Damage dice from Skill Bonus 3d10.
4. Run Paralyze Avatar and confirm its breakdown identifies the -1 action
   modifier.
5. Run Kill Avatar and confirm the action modifier is 0 and its damage dice
   match the Demon Skill Bonus.
6. Reload Foundry and confirm the same breakdowns remain on the existing cards.

## v0.12.5 focused regression checks

1. Run Stun Avatar and expand both Check and Potential damage.
2. Confirm both rolls show their dice and modifiers like an SWNR weapon roll.
3. Run Kill Avatar and confirm its check and damage rolls also expand.
4. Disable CWN Interface Theme, reload Foundry, and create a reload card and a
   Demon-action card.
5. Confirm titles, labels, values, results, and guidance are readable rather
   than pale gray.
6. Re-enable CWN Interface Theme and confirm newly created cards still follow
   the active theme.

## v0.12.4 focused regression checks

1. With CWN Interface Theme enabled, create a reload card and confirm its
   background, text, border, and accent follow the active theme.
2. Confirm the automatic-selection label reads horizontally.
3. Run Stun Avatar and Kill Avatar and confirm check and damage results use
   normal formula/total blocks comparable to an SWNR attack card.
4. Disable CWN Interface Theme, create one reload and one Demon-action card,
   and confirm all text remains readable.
5. Re-enable CWN Interface Theme and confirm newly created cards are themed.
6. Automatically select a compatible magazine and reload. Confirm the reload
   succeeds, the selector updates, and no SWNWeapon `rating` migration error is
   logged.
7. Repeat with a partially retained magazine and a depleted/deleted magazine.
8. In Add Demon, switch from a larger class/profile back to Tripwire and expand
   Additional Common Command Lines. Confirm the dialog width remains stable and
   its body scrolls without excessive blank padding.

## v0.12.3 Programming Profile compatibility

1. Select Tripwire.
2. Confirm profiles requiring more than 2 lines are absent.
3. Confirm compatible two-line profiles remain available.
4. Confirm Custom Programming remains available.
5. Select Mastiff and confirm additional compatible profiles appear.
6. Select Mastiff with Patroller, then change to Tripwire.
7. Confirm Patroller is not silently retained.
8. Confirm an explanatory message appears.
9. Add Common Command Lines until capacity is reached.
10. Confirm further additions are disabled.
11. Confirm the live count includes profile, Additional Common, and non-empty
    Custom Programming lines.
12. Open an existing over-capacity Demon.
13. Confirm its existing profile and command data remain visible.
14. Confirm a clear over-capacity warning states how many lines to remove.
15. Confirm saving is blocked until the count and profile are valid.
16. Confirm the dialog remains viewport-safe with the optional section expanded.
17. Save a valid Demon, reopen it, reload Foundry, and confirm it persists.

## v0.12.3 theme-compatible chat cards

With CWN Interface Theme enabled:

1. Reload a weapon and confirm the reload card fits the themed chat log.
2. Reload from a partial magazine.
3. Reload from a magazine that is depleted and deleted.
4. Test automatic compatible-magazine selection.
5. Confirm rounds, weapon ammunition, magazine remainder, retention/deletion,
   and automatic-selection text are correct.
6. Run Stun Avatar, Paralyze Avatar, and Kill Avatar.
7. Run Alert the Network and Send Message.
8. Produce a hidden Demon action and confirm only `Hidden Demon` appears.
9. Confirm hidden node, network, private command, and GM-note data do not leak.
10. Produce a Demon damage card and use Apply Damage to Demon.
11. Confirm HP and Fragged state update correctly.
12. Compare reload, Demon action, and damage cards with an ordinary themed
    attack card.
13. Confirm no pale/default unthemed card background remains unless supplied by
    the active theme.

With CWN Interface Theme disabled:

14. Reload a weapon and run a Demon action.
15. Confirm cards, text, borders, and buttons remain readable and usable.

After re-enabling CWN Interface Theme:

16. Confirm ordinary attack cards remain unchanged.
17. Confirm module chat cards remain styled and no relevant red console errors
    appear.

## Network Console v0.12.2 persistence and dialog regression checks

### Demon persistence

1. Add a Tripwire with the Bouncer profile to an empty node.
2. Confirm exactly one Demon appears immediately.
3. Reselect the node and confirm the Demon remains.
4. Close and reopen the Network Console.
5. Reload Foundry with Ctrl+F5.
6. Restart the world and confirm the Demon remains.
7. Confirm its Tripwire defaults, Bouncer profile, and commands remain.
8. Add a second standard Demon without replacing the first.
9. Add and reopen a Custom Demon with custom HP, skill, programming, reveal,
   and notes.
10. Add a Demon to another node and confirm the first node is unchanged.
11. Edit, duplicate, delete, and reveal a Demon.
12. Confirm the player-safe projection where a player account is available.
13. Confirm no relevant red console errors appear.

### Viewport and controls

14. Expand Additional Common Command Lines and confirm the footer stays visible.
15. Scroll from the first field to the last without moving the whole dialog.
16. Collapse the section and confirm the body contracts.
17. Switch through every profile and between standard and Custom Demon.
18. Enter several Custom Programming lines and multiline Private GM Notes.
19. Resize the browser shorter and narrower while the dialog is open.
20. Confirm Add Demon and Cancel remain available and keyboard focus scrolls
    into view.
21. Confirm the existing Name-field alignment remains stable.

## Network Console v0.12 Demon encounters

### Dialog layout

1. Open Add Demon.
2. Confirm the Name field alignment.
3. Change every standard class.
4. Switch to Custom Demon.
5. Change Programming Profile repeatedly.
6. Confirm no horizontal field movement.
7. Resize the dialog narrower and wider.

### Demon classes

8. Confirm every standard class gets its documented HP and skill.
9. Confirm standard creation hides editable stat fields.
10. Confirm Custom Demon exposes its stat fields.
11. Reject invalid Custom Demon HP and skill values.
12. Create, save, and reopen a standard Demon.
13. Create, save, and reopen a Custom Demon.
14. Change current HP on a standard Demon after creation.

### Programming profiles

15. Test Bouncer.
16. Test Patroller.
17. Test Gatekeeper.
18. Test Shieldbearer.
19. Test Repairman.
20. Test Trapper.
21. Test Executioner.
22. Test Custom Programming.
23. Confirm the exact profile command lines and priority order.
24. Add Common Command Lines.
25. Remove added lines.
26. Confirm ordering.
27. Confirm line-limit warning/enforcement.
28. Open and verify a migrated legacy Demon.

### Right inspector

29. Confirm Description and GM Notes are no longer permanently visible.
30. Open Details/Notes and edit both fields.
31. Confirm both values persist.
32. Confirm Demons appear above Datafiles and Watchdogs.
33. Expand a Demon.
34. Change HP.
35. Apply manual damage.
36. Change state.
37. Toggle reveal.
38. Confirm the node-card Demon indicator.
39. Duplicate a Demon.
40. Delete a Demon.
41. Test multiple independently expanded Demons on one node.
42. Confirm Fragged styling and action disabling.

### Action buttons

43. Execute every implemented no-roll action.
44. Execute every implemented fixed-difficulty roll, if any is presented.
45. Execute Stun, Paralyze, and Kill Avatar Demon-side opposed rolls.
46. Select valid hacker/avatar targets.
47. Reject invalid targets.
48. Cancel target selection safely.
49. Confirm a hidden Demon produces private GM chat output.
50. Confirm a revealed Demon can produce public chat output.
51. Confirm each chat card gives effect/adjudication guidance.
52. Confirm manual-only commands show guidance rather than an invented roll.

### Alert and movement

53. Test Alert the Network from 0 to 1 to 2.
54. Confirm cancel does not progress Alert.
55. Move a Demon through a valid connection.
56. Reject wrong-way movement.
57. Block locked-Barrier movement.
58. Test Pursue guidance.

### Damage from chat

59. Produce a module-generated hacker damage card with structured Demon flags.
60. Click Apply Damage to Demon as GM.
61. Select Network, Node, and Demon.
62. Confirm the displayed damage amount.
63. Apply the damage.
64. Confirm HP updates.
65. Confirm zero HP marks the Demon Fragged.
66. Confirm unrelated chat messages have no Demon-damage button.
67. Confirm players cannot apply Demon damage.
68. Confirm a known target is preselected where available.

### Regression

69. Confirm node dragging still works.
70. Confirm connection geometry still works.
71. Confirm Auto Arrange still works.
72. Resize, close, reopen, refresh, and confirm window geometry persists safely.
73. Confirm Datafiles still work.
74. Confirm Watchdogs still work.
75. Confirm player projections remain sanitized.
76. Confirm player action requests still work.
77. Run the magazine reload automated tests.
78. Confirm ordinary attacks still work.
79. Confirm Suppressive Fire still works.
80. Confirm no relevant red console errors.

## Network Console v0.11 visual editor

1. Drag all eleven node types from the palette onto the canvas.
2. Confirm each node appears at its drop location and becomes selected.
3. Confirm the right inspector immediately shows the new node.
4. Select a node, then drop another palette node; confirm one connection is
   created from the selected node.
5. Drag an existing node and confirm its connection lines follow live.
6. Click a node without dragging and confirm it is selected.
7. Rerender, press Ctrl+F5, and restart the world; confirm positions persist.
8. Resize the application in both directions; confirm node positions and
   connection endpoints remain aligned.
9. Click **Auto Arrange** and confirm the saved layout is replaced sensibly.
10. Expand **Nodes** and select a hidden or off-screen node.
11. Expand **Connections** and select a connection.
12. Try to connect an already-connected pair; confirm the duplicate is refused.
13. Use the node eye, connect, duplicate, and delete quick actions.
14. Confirm deleting a node removes all connections touching it.
15. Edit and save node name, type, state, reveal, description, and GM notes.
16. Edit and save connection source, target, reveal, one-way, Barrier, lock, and
    GM notes; confirm geometry changes immediately.
17. Add multiple datafiles and verify name, description, integer value, reveal,
    copied status, and private notes persist.
18. With a player console open, confirm hidden datafiles are absent and revealed
    datafiles show only player-safe fields.
19. Add each Demon class and verify its defaults against the CWN table.
20. Change Demon current HP, state, skill, Verb, Subject, commands, and notes.
21. Set a Demon to 0 HP and confirm it is visibly Fragged.
22. Add and duplicate multiple Demons on one node.
23. Toggle each Demon eye and confirm its name/icon appears or disappears live
    on the player node card without exposing statistics or commands.
24. Add, edit, reveal, and delete multiple Watchdogs.
25. Open a network saved before v0.11.0 and confirm its old strings remain as
    hidden legacy entries and its generated node positions persist.
26. As a player, confirm nodes cannot be dragged and no editor controls appear.
27. Run the existing prepared Verb + Subject request and confirm validation and
    the GM socket notification still work.
28. Confirm no private notes or hidden structured fields appear in the published
    projection or player console.
29. Complete the connection geometry checks below.
30. Open the browser console and confirm no relevant red errors were produced.

## Network Console connection geometry

Create a disposable network containing at least six nodes. Include branched,
shared-source, shared-target and crossing connections. Test as both GM and
player where requested.

- [ ] Two nodes with one visible connection draw from the source-card edge to
      the target-card edge.
- [ ] Six nodes with five branched connections remain attached to the correct
      cards.
- [ ] A chain of at least four nodes draws every link correctly.
- [ ] Multiple connections sharing one source remain attached to that source.
- [ ] Multiple connections sharing one target remain attached to that target.
- [ ] Crossing connections remain attached to their own endpoints.
- [ ] Hidden and visible connections use identical geometry; only styling
      differs.
- [ ] A one-way connection retains its arrow at the target end.
- [ ] An unlocked Barrier marker remains at the connection midpoint.
- [ ] A locked Barrier marker remains at the connection midpoint.
- [ ] Editing a node and rerendering leaves its connections attached.
- [ ] Hiding and revealing a node redraws the remaining/revealed graph
      correctly.
- [ ] Hiding and revealing a connection preserves its endpoints.
- [ ] Adding and deleting a node redraws unrelated connections correctly.
- [ ] Adding and deleting a connection redraws the graph correctly.
- [ ] Resizing the application narrower and wider preserves every endpoint,
      including when the node cards themselves remain stationary.
- [ ] Resizing the application taller and shorter preserves every endpoint,
      including when the node cards themselves remain stationary.
- [ ] Horizontal and vertical graph scrolling does not detach lines, arrows or
      Barrier markers.
- [ ] Closing and reopening the console preserves correct geometry.
- [ ] Refreshing the world and reopening the console preserves correct
      geometry.
- [ ] GM and player projections draw matching geometry for the same revealed
      graph.
- [ ] No relevant red console errors appear during the tests.

## Reload calculations and selection

- [ ] With automatic selection enabled, a valid current magazine remains
      selected and is used normally.
- [ ] Missing, stale, empty, and wrong-family current references are replaced
      by a compatible non-empty actor-owned magazine.
- [ ] When the weapon needs 8 rounds and compatible magazines contain 5, 12,
      and 30 rounds, Reload selects the 12-round magazine.
- [ ] When the weapon needs 20 rounds and compatible magazines contain 5, 12,
      and 18 rounds, Reload selects the 18-round magazine.
- [ ] Otherwise-equal candidates always select the lexically earlier Item ID.
- [ ] With no compatible non-empty magazine, Reload warns “No compatible
      magazine available.” and does not invoke native reload.
- [ ] Disabling automatic selection restores the v0.10.3 requirement to choose
      a magazine manually.
- [ ] An automatically selected partial magazine remains selected and appears
      in the visible selector after reloading.
- [ ] An automatically selected depleted magazine is deleted and the visible
      selector and `system.ammo.current` are cleared.
- [ ] Weapon 22/30 plus matching magazine 30/30 becomes 30/30 and 22/30.
- [ ] Weapon 0/30 plus matching magazine 30/30 becomes 30/30 and deletes the
      depleted magazine.
- [ ] Weapon 0/30 plus matching magazine 8/30 becomes 8/30 and deletes the
      depleted magazine.
- [ ] A wrong-family magazine is absent from the selector and rejected if its ID
      is forced into `system.ammo.current`.
- [ ] A matching Stowed magazine is accepted.
- [ ] Multiple partial magazines appear as distinct `current/max` choices and
      only the selected Item changes.
- [ ] A 30-round magazine used with a 0/60 compatible weapon produces 30/60 and
      deletes the magazine.
- [ ] A full weapon cannot reload and does not change its magazine.
- [ ] An empty magazine cannot reload.
- [ ] Deleting a selected magazine clears the weapon's stale
      `system.ammo.current` reference.

## Native fallback and permissions

- [ ] An untagged weapon retains native SWNR ammunition selection and reload.
- [ ] Disabling exact magazine automation restores native SWNR reload.
- [ ] GM Only allows the GM to edit Weapon Family and rejects an owner player.
- [ ] Item Owners allows the GM and a valid owner, but rejects a non-owner.
- [ ] Nobody renders Weapon Family read-only for every user.
- [ ] Native Ammo Type is absent from normal presentation, retains its stored
      value, and is editable by the GM under Advanced SWNR Compatibility.
- [ ] A custom lowercase slug can be saved.
- [ ] An unknown existing lowercase slug remains visible and unchanged.
- [ ] Invalid family keys and unauthorized direct flag updates are rejected
      without blocking unrelated Item updates.

## Actor and combat regression

- [ ] Reload works on a linked actor sheet.
- [ ] Reload works on a synthetic/unlinked token actor and changes only that
      token actor's embedded weapon and magazine.
- [ ] Ordinary attacks spend loaded weapon ammunition as before.
- [ ] Burst Fire spends three loaded rounds as before.
- [ ] Suppressive Fire spends two loaded rounds as before.
- [ ] Target snapshots and target-aware damage application remain unchanged.
- [ ] Repeated weapon-sheet renders inject one family field and one magazine
      selector only.
- [ ] Repeated world reloads do not install duplicate reload wrappers.
- [ ] SWNR 2.3.x absence or incompatible sheet/action structure produces one
      clear console warning rather than a broken sheet.
