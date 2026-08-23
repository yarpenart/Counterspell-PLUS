# Counterspell PLUS

Automation for **Counterspell**, **Dispel Magic**, **Remove Curse**, **Lesser Restoration**, **Greater Restoration**, homebrew **Restoration** and **Identify** in Foundry VTT 14 Build 365 with D&D5e 5.3.3.

## Version 0.5.5

- Independent world settings for Counterspell, Dispel Magic, Remove Curse, the Restoration family and Identify: Homebrew or Official D&D 2014.
- Player declarations are sent to the active GM for final review.
- Standard and Pact Magic slots are supported and the selected slot is consumed only after GM approval.
- Restoration always lists every casting level through 9 with its current available-slot count, so higher-level tiers remain visible instead of disappearing when Foundry reports zero remaining slots.
- Every rolling participant chooses Public Roll, Private GM Roll or Blind GM Roll independently.
- Final outcomes are public, while hidden numerical values remain protected by the selected roll modes.
- Ordinary D&D5e d20 rolls support Dice So Nice and use the system's standard natural 20 / natural 1 colors.
- Optional additional dice formulas such as `1d4` or `1d4 + 1d8` are supported and editable by the GM.
- One world checkbox controls whether proficiency is included in all four Homebrew workflows. Official 2014 calculations remain unchanged. An optional world setting enables an `Abjurer` declaration: it adds one extra proficiency bonus to the caster roll, producing single proficiency when the shared proficiency option is off and expertise when it is on.
- Counterspell, Dispel Magic, Remove Curse and Restoration spells can be declared as cast normally or from a spell scroll. Scroll casting uses the selected scroll level plus the scroll author's ability modifier and proficiency, consumes no character spell slot, and is editable by the GM.
- In every Homebrew casting dialog, Normal Casting disables the Scroll level and Scroll author fields. Scroll Casting enables those fields and disables the normal spell-slot selector. Counterspell also disables fixed Scroll/Glyph creator fields for a selected actor using a normal spell; Official 2014 dialogs remain unchanged.
- Counterspell target selection supports actor/token, Unknown and Glyph targets; Dispel Magic additionally supports Object. Selecting Glyph as the target forces Glyph as the spell source in both workflows.
- Counterspell and Dispel Magic target selectors provide a live-filtered search list instead of requiring scrolling through long actor lists.
- Target searches combine tokens on the active scene with Actors that do not have a token on that scene, and label every result as Token, Actor or Special.
- Long workflow windows keep the full-size target list and scroll the complete form, including the action buttons, within the available screen height.
- A Blind GM defense hides affected spell levels from players; Counterspell keeps the target data with the GM, while Dispel Magic masks levels in the caster's effect list.
- Hidden d20 messages do not expose natural 1 or natural 20 through critical/fumble colors.
- The GM can mark a Counterspell, Dispel Magic, Remove Curse or Restoration caster as a Special Spellcaster. Separate world settings set the kept d20 minimum from 1 to 20 (default 15).
- Homebrew Remove Curse and Restoration: One Curse can optionally require special curse-removal conditions. The GM confirms each requirement, may describe it, chooses whether its status message is public or GM-only, and an unmet requirement increases the curse DC by a configurable amount (default +5). Official 2014 rules and cursed-item attunement are unchanged.
- Identify lets the caster select or drop an inventory item, or type any item name. The GM can search every World Item and actor inventory, correct the name, select or drop the actual Item document, and write exactly what is revealed. Editing the supplied/revealed name detaches the selected Item document while preserving the manual name; the selected-item card also has a dedicated remove button. If the selected Item has no stored description, the GM may instead confirm that it is a mundane item with no additional effects.
- Identify supports Normal Casting, Scroll Casting and Ritual Casting. Curse information is hidden by default in both rulesets and is revealed only through a separate GM-controlled field.
- Homebrew Identify can optionally carry risk. Only a risky identification opens Stat Shift's shared Homebrew editor in its required-save mode, with the caster locked as the target and the Identify cast level automatically added to the saving throw. Identify consequences use Foundry's `scroll-bound-blue-red.webp` icon by default. No risk means no saving throw. Official 2014 Identify never adds this homebrew risk roll.
- English is available throughout the module; Counterspell and Dispel Magic also retain their Polish interface, while the new Remove Curse interface uses English as requested.
- The primary active GM automatically receives a player-visible `Counterspell PLUS — Rules Reference` Journal Entry with two pages: Official 2014 Rules and the complete Homebrew Rules. The module updates its managed pages when relevant world settings change.
- Every module dialog now uses theme-aware contrast: light text in dark windows and dark text in light windows, including hints, form controls and placeholders.

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

An optional Homebrew world setting enables curse-removal requirements. During the final review, the GM marks each curse separately as meeting or not meeting its requirements and may add a short note such as a required component or killing the source of the curse. An unmet requirement adds a configurable penalty to that curse's DC (default `+5`). The GM chooses per attempt whether the requirements message is public or visible only to GMs. Official 2014 Remove Curse is unchanged.

Under the Homebrew rule, every curse also posts a public outcome card. The default result bands are:

- failure by 5 or more: Dramatic Curse Removal Failure;
- failure by 0–4: Failed Curse Removal;
- success by 1–5: Barely Successful Curse Removal;
- success by 6 or more: Successful Curse Removal.

Two world sliders define these bands. The negative slider sets where Dramatic Failure begins; ordinary Failure automatically covers every smaller failure through a tie at 0. The positive slider sets the upper limit of Barely Successful; full Success automatically begins at the next value. Card descriptions are generated from the configured values. A homebrew tie is a failure. The Official 2014 mode follows the same automatic-level and separate-check procedure configured for Dispel Magic in this module.

## Identify

The caster first chooses a casting method:

- **Normal Casting** uses an available spell slot, consumed only after final GM approval.
- **Scroll Casting** uses the selected scroll level without consuming a character spell slot; scroll inventory remains manual.
- **Ritual Casting** uses the normal Identify spell level and consumes no spell slot.

The caster may then select an item from their own inventory, drop an Item document into the field, or type any name such as `strange ring`. Typed names also work for homebrew objects that do not yet exist in Foundry.

The GM receives a searchable list combining World Items with every actor's embedded items. The GM may confirm the player's text, choose the actual item, drop an Item document, and edit the final displayed name. The item's stored description is visible in a GM-only preview but is never copied into the revealed text automatically. For a selected Item without a stored description, the GM may choose **This is a mundane item with no additional effects** instead of writing a description; this also disables the mutually incompatible curse and risk options.

After approval, the module whispers the selected description only to all GMs and the user who cast Identify. If no actual Item document exists, the private message confirms successful identification and states that the GM will provide details shortly.

### Official D&D 2014

Identification succeeds after GM approval and requires no saving throw. The material component (a pearl worth at least 100 gp and an owl feather) is informational; inventory is not modified. Curse information remains hidden unless the GM explicitly enables the separate curse-reveal option and enters the details.

### Homebrew risk and Stat Shift

The GM may mark a specific identification as risky. Only then does Counterspell PLUS call `game.statShift.openHomebrew(...)` and open Stat Shift for the GM. The identifying actor is locked as the save target and the **Does not require a saving throw** option is locked off, while the GM may edit the ability, DC, roll mode, automatic bonus, success and failure effects, ability/skill/tool/save/attack modifiers, advantage or disadvantage, senses, speed, AC, maximum HP, spell slots, duration, icons and descriptions. Every additional modifier may also have an optional situational note. Counterspell PLUS falls back to the older `openHomebrewSave(...)` API when used with an earlier compatible Stat Shift release.

The Identify caster does not select a spellcasting ability. If the item is risky, the GM chooses the saving throw ability directly in Stat Shift.

The automatic saving-throw bonus starts at the level used to cast Identify. The caster then makes the saving throw through Stat Shift. The risk save resolves the configured consequence; the GM's approval separately determines that the identification succeeded. If risk is not selected, Stat Shift does not open and no saving throw is made.

Stat Shift **0.3.0 or newer** is recommended rather than required. If it is unavailable, Identify still posts the private identification result and warns the GM that the risk save could not be opened.

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
+ curse proficiency + unmet-requirement penalty (default +5) - 5 if known
```

Attunement uses the same caster procedure against:

```text
configured base (default 7) + curse level + item rarity modifier
+ curse proficiency - 5 if known
```

The unmet-requirement penalty is included only when the optional Homebrew requirements setting is enabled and the GM leaves the One Curse requirement unchecked. It never applies to Attunement to a Cursed Item or to Official Restoration spells.

Rarity modifiers are Common 1, Uncommon 2, Rare 3, Very Rare 5, Legendary 6 and Artifact 8. One Curse posts the four configured Remove Curse complication bands. Attunement posts only Success or Failure and never posts a complication card.

## Settings

Open **Configure Settings → Module Settings → Counterspell PLUS** to configure:

- Counterspell enabled state, ruleset, recognized names, Scroll base, Glyph base and Wild Magic reminder.
- Dispel Magic enabled state, ruleset, recognized names, Normal Spell base, Scroll base and Glyph base.
- Remove Curse enabled state, ruleset, recognized names, Curse defense base and two outcome sliders.
- Optional Homebrew curse-removal requirements and their editable unmet-requirement DC penalty (default `+5`).
- Restoration enabled state, ruleset, recognized Lesser/Greater/Homebrew names, One Curse base and cursed-attunement base.
- Identify enabled state, independent Official/Homebrew ruleset and recognized names.
- One shared Homebrew proficiency checkbox for Counterspell, Dispel Magic, Remove Curse and Restoration.
- Optional Homebrew Abjurer declarations for all four caster rolls.
- Independent Special Spellcaster minimum d20 values for Counterspell, Dispel Magic, Remove Curse and Restoration.

Every base accepts any numeric value.

## Rules Journal

On world startup, the primary active GM creates one shared Journal Entry named **Counterspell PLUS — Rules Reference**. Its two player-visible pages provide a sequential reference for:

- Official 2014 Counterspell, Dispel Magic, Remove Curse, Lesser Restoration, Greater Restoration and Identify rules, including the GM-controlled private Identify description and hidden-by-default curse information.
- All Homebrew formulas, Restoration tiers and materials, Identify selection and optional Stat Shift risk, ties, known-spell benefits, multiple-effect bonuses, Scroll and Glyph handling, proficiency, Abjurer, Special Spellcaster, roll visibility, natural d20 colors and configurable Remove Curse outcome bands.

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

Identify:

- Identify
- Identyfikacja
- Rozpoznanie

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
- Identify does not consume its pearl or owl feather automatically, and it does not change an Item document's identified state.
- Risk consequences require an active compatible Stat Shift module; without it, identification still completes and the GM receives a warning.

## License

MIT
