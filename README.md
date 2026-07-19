# Counterspell PLUS

Counterspell automation for Foundry VTT 13, Build 351 and the D&D5e 5.3.3 system.

## Version 0.1.0 scope

- Intercepts Counterspell use from a D&D5e spell activity.
- Lets the Counterspell caster choose their spellcasting ability, actual slot resource and roll mode.
- Lets the active GM choose the original caster, spell, actual slot level and whether the source is a normal spell or a scroll.
- Opens a data window for the original caster's active player owner.
- Gives the GM a final review window containing both sides' relevant values.
- Reads ability modifiers and proficiency bonuses from actor sheets.
- Supports standard and Pact Magic spell slots and consumes the selected Counterspell slot once the GM approves the roll.
- Supports public, private GM and blind GM rolls.
- Uses ordinary Foundry chat rolls, so Dice So Nice animates them automatically when installed and enabled.
- Supports Polish and English Foundry interface languages.

## Rules

The GM chooses the ruleset in **Configure Settings → Module Settings → Counterspell PLUS**.

### Homebrew: opposed rolls

Normal spell:

```text
Original spell: 1d20 + actual slot level + ability modifier + proficiency bonus
Counterspell:    1d20 + actual slot level + ability modifier + proficiency bonus
```

Counterspell succeeds only if its result is higher. A tie favors the original spell.

Spell scroll:

```text
Scroll defense = 7 + spell level + creator ability modifier + creator proficiency bonus
```

Only the Counterspell caster rolls against this fixed result.

Counterspelling another Counterspell also creates a Wild Magic chat message.

### Official D&D 2014

If the Counterspell slot is at least as high as the target spell's actual level, the spell is countered automatically. Otherwise the caster makes a spellcasting ability check against `DC 10 + target spell level`. Proficiency is not added.

## Recognized spell names

The defaults are:

- Counterspell
- Counterspell (Alternate)
- Kontrzaklęcie
- Kontrczar

The GM may edit the comma-separated name list in module settings. Parenthetical suffixes are recognized automatically.

## Installation

After the first GitHub release is published, install with:

```text
https://github.com/yarpenart/Counterspell-PLUS/releases/latest/download/module.json
```

## Current limitations

- Version 0.1.0 handles Counterspell only. Dispel Magic and Remove Curse are planned separately.
- The original spell is assumed to have already been cast, so this module does not consume its slot.
- Live multiplayer testing in Foundry is required before marking the first release stable.

## License

MIT
