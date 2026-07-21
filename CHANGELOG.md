# Changelog

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
