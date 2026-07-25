# Foundry VTT v13 / SWNR 2.3.x manual test checklist

Use a disposable world with CWN Combat Enhancements 0.10.0 enabled. Test with
actor-owned weapon and magazine Items. Give each magazine
`type: "item"`, `system.uses.consumable: "count"`, positive
`system.uses.value/max`, and a Magazine Family flag.

Do not claim runtime success until these checks have been completed in Foundry.

## Reload calculations and selection

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
