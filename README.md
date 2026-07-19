# Counterspell PLUS

Counterspell automation for Foundry VTT 13, Build 351 and the D&D5e 5.3.3 system.

## Version 0.1.6 scope

- Intercepts Counterspell use from a D&D5e spell activity.
- Lets the Counterspell caster choose their spellcasting ability, actual slot resource and roll mode.
- Lets the active GM choose the original caster, spell, actual slot level and whether the source is a normal spell or a scroll.
- Opens a data window for the original caster's active player owner.
- Gives the GM a final review window containing both sides' relevant values.
- Reads ability modifiers and proficiency bonuses from actor sheets.
- Supports standard and Pact Magic spell slots and consumes the selected Counterspell slot once the GM approves the roll.
- Each side independently chooses public, private GM or blind GM roll visibility.
- The final success or failure is public, while hidden numerical results remain hidden.
- In the homebrew rules, the Counterspell caster can declare that they know the target spell; the GM confirms or corrects this before rolling.
- Knowing the target spell grants advantage on the Counterspell roll, except when Counterspell targets another Counterspell.
- Each rolling side can independently declare disadvantage, for example from exhaustion or another effect, and the GM can correct both declarations.
- Advantage and disadvantage cancel each other, resulting in a normal `1d20` roll.
- Natural 20 and natural 1 on the kept d20 are highlighted using the D&D5e system's standard critical and fumble colors.
- Supports a Spell Glyph source with a fixed homebrew defense based on the glyph creator's values.
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

If a rolling side has disadvantage, it rolls `2d20kl`. Advantage and disadvantage cancel each other and produce a normal `1d20` roll. A scroll has a fixed defense and therefore cannot have disadvantage.

If the Counterspell caster knows the target spell and the target spell is not Counterspell, the Counterspell roll is made with advantage:

```text
Counterspell with advantage: 2d20kh + actual slot level + ability modifier + proficiency bonus
```

Spell scroll:

```text
Scroll defense = 7 + spell level + creator ability modifier + creator proficiency bonus
```

Only the Counterspell caster rolls against this fixed result.

Spell Glyph:

```text
Glyph defense = 10 + stored spell level + creator ability modifier + creator proficiency bonus
```

Like a scroll, a glyph does not roll a d20. The Counterspell caster rolls against its fixed defense.

Counterspelling another Counterspell also creates a Wild Magic chat message.

Natural 20 and natural 1 are visual highlights only. The opposed totals still determine success, and a tie still favors the original spell.

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

- Version 0.1.6 handles Counterspell only. Dispel Magic and Remove Curse are planned separately.
- The original spell is assumed to have already been cast, so this module does not consume its slot.
- The module currently identifies the target spell and its slot level through participant dialogs rather than reading an interrupted cast automatically.

## License

MIT
