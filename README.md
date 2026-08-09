# Look Outside mods

Mods for [Look Outside](https://store.steampowered.com/app/3373660/Look_Outside/), an RPG Maker MZ
horror game. Each mod is a folder in this repository and is loaded by
[JSLoader](https://www.nexusmods.com/lookoutside/mods/134).

| mod | version | what it does |
|---|---|---|
| [BetterDescriptions](BetterDescriptions/) | 1.0.0 | Adds a second, purely mechanical description to every item, skill and piece of equipment that has one to give |

## Installing

1. Install JSLoader if you have not already.
2. Copy the mod's folder into `<game>/js/mods/`, keeping the folder name exactly as it is here.
   JSLoader looks for `<folder>/<folder>.js`, so renaming the folder stops the mod loading.
3. Start the game.

Nothing here modifies the game's own files. Delete the folder to uninstall.

---

## BetterDescriptions

The game's descriptions mix flavour with mechanics, and often round the mechanics off: "Recovers at
least 16 HP and 4 STM" hides a percentage component, and plenty of items describe what they feel like
rather than what they do.

BetterDescriptions leaves every word the developers wrote exactly as it is and adds a **second view**
built entirely from the record's own data. Press **Tab**, or **Select** on a controller, to switch
between them.

```
Fire Breath
  original    Breathe flames using a Monty Special! 60 Fire dmg,
              and burns to all enemies. Makes Monty catatonic.
  mechanical  Deals 60 fire damage to all enemies. 70% chance to inflict burn
              (2-4 turns). Costs 6 STM, 1 Monty Special. Applies catatonic to
              you for 2-3 turns.

Balm
  original    Thick balm that can cure bleeding, burns or acid.
              Can even be used in the heat of battle.
  mechanical  Cures burn, acid and bleed.
```

933 records have a mechanical view. The rest have nothing derivable in their data, so they show no
second view and no hint - the toggle simply does nothing on them.

### What it reads

Everything comes from `effects`, `damage`, `traits`, `params` and note tags. Nothing is hand-written
except two curated facts that exist only in the game's scripts.

- Damage: amount, element, target, repeats and accuracy
- Recovery: flat and percentage parts stated separately
- Statuses inflicted, with their real durations and combined tier odds
- Statuses cured
- Costs: STM, ammunition, HP and consumed items
- Weapon break risk
- Equipment: element rates, immunities, resistances, stat multipliers, granted skills, extra actions
- Statuses the record applies to *you*

Where the data does not state something, the mechanical view says nothing about it rather than
guessing. A damage formula that scales off your own stats reports no number at all, because the
constant in it would understate the real figure.

### Settings

Edit `meta.json`:

| setting | default | meaning |
|---|---|---|
| `toggleKey` | `Tab` | Keyboard key that switches view |
| `toggleButton` | `8` | Gamepad button index that switches view |
| `buttonLabel` | `Select` | What the on-screen hint calls that button |
| `showHint` | `true` | Draw the `[TAB]` / `[SELECT]` hint in the corner |
| `pageSeconds` | `2` | Seconds each page shows before a long description turns over |
| `mechanicalFontSize` | `18` | Point size for the mechanical view. The game's own text stays at 22 |

### Compatibility

The mod writes to `description` on the loaded database rather than hooking a draw call, so anything
else that reads a description picks up whichever view is showing. It never writes to disk and never
touches `data/`.

One known limitation: `WD_ItemUse.js` caches a deep copy of the item list, so its own description box
can keep showing whichever view was active when it cached.

### Tests

```
node BetterDescriptions/tools/test.js
```

Run it from anywhere inside the game folder, or set `LOOK_OUTSIDE_ROOT` to the game's path. The suite
reads the real `data/*.json` rather than fixtures, so it tests against the shipped game.

118 checks. The one that matters most asserts that the original view is byte-identical to a fresh
read of `data/*.json` after boot, after repeated toggling and after a config round trip.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
