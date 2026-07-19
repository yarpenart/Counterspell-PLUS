# Counterspell PLUS

Automation for **Counterspell**, **Dispel Magic**, **Remove Curse**, **Lesser Restoration**, **Greater Restoration** and homebrew **Restoration** in Foundry VTT 13 Build 351 with D&D5e 5.3.3.

## Version 0.4.0

- Independent world settings for Counterspell, Dispel Magic, Remove Curse and the Restoration family: Homebrew or Official D&D 2014.
- Player declarations are sent to the active GM for final review.
- Standard and Pact Magic slots are supported and the selected slot is consumed only after GM approval.
- Every rolling participant chooses Public Roll, Private GM Roll or Blind GM Roll independently.
- Final outcomes are public, while hidden numerical values remain protected by the selected roll modes.
- Ordinary D&D5e d20 rolls support Dice So Nice and use the system's standard natural 20 / natural 1 colors.
- Optional additional dice formulas such as `1d4` or `1d4 + 1d8` are supported and editable by the GM.
- One world checkbox controls whether proficiency is included in all four Homebrew workflows. Official 2014 calculations remain unchanged. An optional world setting enables an `Abjurer` declaration: it adds one extra proficiency bonus to the caster roll, producing single proficiency when the shared proficiency option is off and expertise when it is on.
- Counterspell, Dispel Magic, Remove Curse and Restoration spells can be declared as cast normally or from a spell scroll. Scroll casting uses the selected scroll level plus the scroll author's ability modifier and proficiency, consumes no character spell slot, and is editable by the GM.
- Counterspell target selection supports actor/token, Unknown and Glyph targets; Dispel Magic additionally supports Object. Selecting Glyph as the target forces Glyph as the spell source in both workflows.
- Counterspell and Dispel Magic target selectors provide a live-filtered search list instead of requiring scrolling through long actor lists.
- Target searches combine tokens on the active scene with Actors that do not have a token on that scene, and label every result as Token, Actor or Special.
- Long workflow windows keep the full-size target list and scroll the complete form, including the action buttons, within the available screen height.
- A Blind GM defense hides affected spell levels from players; Counterspell keeps the target data with the GM, while Dispel Magic masks levels in the caster's effect list.
- Hidden d20 messages do not expose natural 1 or natural 20 through critical/fumble colors.
- The GM can mark a Counterspell, Dispel Magic, Remove Curse or Restoration caster as a Special Spellcaster. Separate world settings set the kept d20 minimum from 1 to 20 (default 15).
- English is available throughout the module; Counterspell and Dispel Magic also retain their Polish interface, while the new Remove Curse interface uses English as requested.
- The primary active GM automatically receives a player-visible `Counterspell PLUS — Rules Reference` Journal Entry with two pages: Official 2014 Rules and the complete Homebrew Rules. The module updates its managed pages when relevant world settings change.

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

## Remove Curse

Remove Curse uses the same target selection, multiple-effect handling, roll modes, bonus dice, knowledge reduction, Special Cursecaster option and GM review flow as Dispel Magic. Its only casting source is `Curse`; Scroll and Glyph are not offered. The selected target only identifies who or what is cursed, while every curse has separate ability-modifier and proficiency fields entered by the GM.

Under the Homebrew rule, every curse also posts a public outcome card. The default result bands are:

- failure by 5 or more: Dramatic Curse Removal Failure;
- failure by 0–4: Failed Curse Removal;
- success by 1–5: Barely Successful Curse Removal;
- success by 6 or more: Successful Curse Removal.

Two world sliders define these bands. The negative slider sets where Dramatic Failure begins; ordinary Failure automatically covers every smaller failure through a tie at 0. The positive slider sets the upper limit of Barely Successful; full Success automatically begins at the next value. Card descriptions are generated from the configured values. A homebrew tie is a failure. The Official 2014 mode follows the same automatic-level and separate-check procedure configured for Dispel Magic in this module.

## Natural 20 and natural 1

The kept d20 is highlighted with the D&D5e system's normal critical or fumble color. This is visual only: natural 20 is not an automatic success and natural 1 is not an automatic failure unless the compared totals say so.

## Restoration spells

Official 2014 mode recognizes Lesser Restoration and Greater Restoration. The player chooses one legal effect and the module posts an automatic success after GM review. Greater Restoration displays its 100 gp Diamond Dust requirement in the selection dialog and final chat message; inventory is never changed automatically.

Homebrew mode recognizes Restoration. Its effect lists are separate rather than cumulative:

- 2nd level: Disease, Blinded, Deafened, Frightened, Paralyzed or Poisoned; no priced material.
- 3rd level: Charmed or one level of Exhaustion; 10 gp Diamond Dust.
- 4th level: one Ability Score reduction or Hit Point Maximum Reduction; 50 gp Diamond Dust.
- 5th level or higher: Petrified, One Curse or Attunement to a Cursed Item; 100 gp Diamond Dust.

All options are automatic except One Curse and Attunement to a Cursed Item. One Curse uses the full Remove Curse caster procedure against:

```text
configured base (default 8) + curse level + curse ability modifier
+ curse proficiency - 5 if known
```

Attunement uses the same caster procedure against:

```text
configured base (default 7) + curse level + item rarity modifier
+ curse proficiency - 5 if known
```

Rarity modifiers are Common 1, Uncommon 2, Rare 3, Very Rare 5, Legendary 6 and Artifact 8. One Curse posts the four configured Remove Curse complication bands. Attunement posts only Success or Failure and never posts a complication card.

## Settings

Open **Configure Settings → Module Settings → Counterspell PLUS** to configure:

- Counterspell enabled state, ruleset, recognized names, Scroll base, Glyph base and Wild Magic reminder.
- Dispel Magic enabled state, ruleset, recognized names, Normal Spell base, Scroll base and Glyph base.
- Remove Curse enabled state, ruleset, recognized names, Curse defense base and two outcome sliders.
- Restoration enabled state, ruleset, recognized Lesser/Greater/Homebrew names, One Curse base and cursed-attunement base.
- One shared Homebrew proficiency checkbox for Counterspell, Dispel Magic, Remove Curse and Restoration.
- Optional Homebrew Abjurer declarations for all four caster rolls.
- Independent Special Spellcaster minimum d20 values for Counterspell, Dispel Magic, Remove Curse and Restoration.

Every base accepts any numeric value.

## Rules Journal

On world startup, the primary active GM creates one shared Journal Entry named **Counterspell PLUS — Rules Reference**. Its two player-visible pages provide a sequential reference for:

- Official 2014 Counterspell, Dispel Magic, Remove Curse, Lesser Restoration and Greater Restoration rules, including a clear note about the module's requested Dispel-style Official Remove Curse procedure.
- All Homebrew formulas, Restoration tiers and materials, ties, known-spell benefits, multiple-effect bonuses, Scroll and Glyph handling, proficiency, Abjurer, Special Spellcaster, roll visibility, natural d20 colors and configurable Remove Curse outcome bands.

The entry is identified with module flags, so it is not duplicated on later startups. The module updates only its two managed pages when the reference content or relevant world settings change.

## Recognized default names

Counterspell:

- Counterspell
- Counterspell (Alternate)
- Kontrzaklęcie
- Kontrczar

Dispel Magic:

- Dispel Magic
- Rozproszenie magii

Remove Curse:

- Remove Curse
- Zdjęcie klątwy
- Usunięcie klątwy

Official Restoration:

- Lesser Restoration
- Greater Restoration

Homebrew Restoration:

- Restoration

The comma-separated lists may be edited in module settings. Parenthetical suffixes are recognized automatically.

## Installation

Install using:

```text
https://github.com/yarpenart/Counterspell-PLUS/releases/latest/download/module.json
```

## Current limitations

- The target spell effects and their source data are entered through participant dialogs rather than detected automatically.
- Original spell slots are not consumed.
- The scroll-casting option does not automatically locate or delete a consumable scroll item; inventory handling remains manual.

## License

MIT
