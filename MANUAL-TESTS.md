# Foundry VTT v13 / SWNR 2.3.x manual test checklist

Use a disposable world with CWN Combat Enhancements 0.11.0 enabled. Test with
actor-owned weapon and magazine Items. Give each magazine
`type: "item"`, `system.uses.consumable: "count"`, positive
`system.uses.value/max`, and a Magazine Family flag.

Do not claim runtime success until these checks have been completed in Foundry.

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
