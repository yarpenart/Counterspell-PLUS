# Counterspell PLUS

Automation for **Counterspell** and **Dispel Magic** in Foundry VTT 13 Build 351 with D&D5e 5.3.3.

## Version 0.2.6

- Independent world settings for Counterspell and Dispel Magic: Homebrew or Official D&D 2014.
- Player declarations are sent to the active GM for final review.
- Standard and Pact Magic slots are supported and the selected slot is consumed only after GM approval.
- Every rolling participant chooses Public Roll, Private GM Roll or Blind GM Roll independently.
- Final outcomes are public, while hidden numerical values remain protected by the selected roll modes.
- Ordinary D&D5e d20 rolls support Dice So Nice and use the system's standard natural 20 / natural 1 colors.
- Optional additional dice formulas such as `1d4` or `1d4 + 1d8` are supported and editable by the GM.
- Counterspell target selection supports actor/token, Unknown and Glyph targets; Dispel Magic additionally supports Object. Selecting Glyph as the target forces Glyph as the spell source in both workflows.
- A Blind GM defense hides affected spell levels from players; Counterspell keeps the target data with the GM, while Dispel Magic masks levels in the caster's effect list.
- Hidden d20 messages do not expose natural 1 or natural 20 through critical/fumble colors.
- The GM can mark a Counterspell or Dispel Magic caster as a Special Spellcaster. Separate world settings set the kept d20 minimum from 1 to 20 (default 15).
- Polish and English interfaces are included.

## Counterspell

### Homebrew

Against a normal spell, both sides roll:

```text
1d20 + actual slot level + spellcasting ability modifier + proficiency bonus + optional dice
```

Counterspell succeeds only with a strictly higher total. A tie favors the original spell.

Knowing the normal target spell grants advantage, except when Counterspell targets another Counterspell. Disadvantage may be declared independently for each rolling side; the GM can correct the declarations, and advantage plus disadvantage cancel.

Scroll and Glyph defenses do not roll a d20:

```text
Scroll DC = configured Counterspell scroll base (default 7)
          + spell level + creator modifier + creator proficiency

Glyph DC  = configured Counterspell Glyph base (default 10)
          + stored spell level + creator modifier + creator proficiency
```

If the Counterspell caster knows the spell stored in a Scroll or Glyph, subtract 5 from that fixed DC. It does not grant advantage.

Counterspelling another Counterspell posts a public Wild Magic reminder.

### Official D&D 2014

If the Counterspell slot is at least as high as the target spell level, the spell is countered automatically. Otherwise the caster rolls a spellcasting ability check against `DC 10 + target spell level`. Proficiency is not added. Optional dice and declared disadvantage are respected.

## Dispel Magic

The GM chooses the affected actor or token, the visibility of passive defenses, and the number of spell effects. Every effect is entered separately with its source (`Normal Spell`, `Scroll`, or `Glyph`), name, level, original caster/creator modifier and proficiency. The player then makes their declarations and the GM performs a final editable review.

The module reports which effects should be removed. It never deletes Active Effects automatically.

### Homebrew

The Dispel Magic caster rolls once:

```text
1d20 + actual Dispel Magic slot level
      + spellcasting ability modifier
      + proficiency bonus
      + optional dice
```

Each effect has its own passive DC:

```text
configured source base + spell level + original caster/creator modifier
+ original caster/creator proficiency + multiple-effect bonus - knowledge reduction
```

The three Dispel Magic bases are independent settings:

- Normal Spell: default 10
- Scroll: default 7
- Glyph: default 10

With exactly one effect, the multiple-effect bonus is 0. With more than one effect, the total number of effects is added to every DC. Knowing an individual spell subtracts 5 from only that spell's DC, including spells originating from a Scroll or Glyph.

The single Dispel Magic total is compared with every effect DC. An effect is dispelled only when the result is strictly higher; a tie leaves it in place.

### Official D&D 2014

Every effect whose spell level is at or below the Dispel Magic slot level is dispelled automatically. For each higher-level effect, the module makes a separate spellcasting ability check:

```text
1d20 + spellcasting ability modifier + optional dice for this individual check
vs DC 10 + effect spell level
```

The player can enter different optional dice for every required check, and the GM can edit them. Proficiency is not added. The selected roll visibility and disadvantage apply to each separate roll.

## Natural 20 and natural 1

The kept d20 is highlighted with the D&D5e system's normal critical or fumble color. This is visual only: natural 20 is not an automatic success and natural 1 is not an automatic failure unless the compared totals say so.

## Settings

Open **Configure Settings → Module Settings → Counterspell PLUS** to configure:

- Counterspell enabled state, ruleset, recognized names, Scroll base, Glyph base and Wild Magic reminder.
- Dispel Magic enabled state, ruleset, recognized names, Normal Spell base, Scroll base and Glyph base.
- Independent Special Spellcaster minimum d20 values for Counterspell and Dispel Magic.

Every base accepts any numeric value.

## Recognized default names

Counterspell:

- Counterspell
- Counterspell (Alternate)
- Kontrzaklęcie
- Kontrczar

Dispel Magic:

- Dispel Magic
- Rozproszenie magii

The comma-separated lists may be edited in module settings. Parenthetical suffixes are recognized automatically.

## Installation

Install using:

```text
https://github.com/yarpenart/Counterspell-PLUS/releases/latest/download/module.json
```

## Current limitations

- The target spell effects and their source data are entered through participant dialogs rather than detected automatically.
- Original spell slots are not consumed.
- Remove Curse is not included yet.

## License

MIT
