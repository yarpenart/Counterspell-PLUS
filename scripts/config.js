export const MODULE_ID = "counterspell-plus";
export const SOCKET_NAME = `module.${MODULE_ID}`;

export const RULESETS = Object.freeze({
  HOMEBREW: "homebrew",
  OFFICIAL_2014: "official2014"
});

export function registerSettings() {
  game.settings.register(MODULE_ID, "enabled", {
    name: "COUNTERSPELL_PLUS.Settings.Enabled.Name",
    hint: "COUNTERSPELL_PLUS.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, "ruleset", {
    name: "COUNTERSPELL_PLUS.Settings.Ruleset.Name",
    hint: "COUNTERSPELL_PLUS.Settings.Ruleset.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [RULESETS.HOMEBREW]: "COUNTERSPELL_PLUS.Settings.Ruleset.Homebrew",
      [RULESETS.OFFICIAL_2014]: "COUNTERSPELL_PLUS.Settings.Ruleset.Official2014"
    },
    default: RULESETS.HOMEBREW,
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelEnabled", {
    name: "COUNTERSPELL_PLUS.Settings.DispelEnabled.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelRuleset", {
    name: "COUNTERSPELL_PLUS.Settings.DispelRuleset.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelRuleset.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [RULESETS.HOMEBREW]: "COUNTERSPELL_PLUS.Settings.DispelRuleset.Homebrew",
      [RULESETS.OFFICIAL_2014]: "COUNTERSPELL_PLUS.Settings.DispelRuleset.Official2014"
    },
    default: RULESETS.HOMEBREW,
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelDefenseBase", {
    name: "COUNTERSPELL_PLUS.Settings.DispelDefenseBase.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelDefenseBase.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelScrollDefenseBase", {
    name: "COUNTERSPELL_PLUS.Settings.DispelScrollDefenseBase.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelScrollDefenseBase.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 7,
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelGlyphDefenseBase", {
    name: "COUNTERSPELL_PLUS.Settings.DispelGlyphDefenseBase.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelGlyphDefenseBase.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    restricted: true
  });

  game.settings.register(MODULE_ID, "scrollDefenseBase", {
    name: "COUNTERSPELL_PLUS.Settings.ScrollDefenseBase.Name",
    hint: "COUNTERSPELL_PLUS.Settings.ScrollDefenseBase.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 7,
    restricted: true
  });

  game.settings.register(MODULE_ID, "glyphDefenseBase", {
    name: "COUNTERSPELL_PLUS.Settings.GlyphDefenseBase.Name",
    hint: "COUNTERSPELL_PLUS.Settings.GlyphDefenseBase.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    restricted: true
  });

  game.settings.register(MODULE_ID, "counterspellNames", {
    name: "COUNTERSPELL_PLUS.Settings.Names.Name",
    hint: "COUNTERSPELL_PLUS.Settings.Names.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "Counterspell, Counterspell (Alternate), Kontrzaklęcie, Kontrczar",
    restricted: true
  });

  game.settings.register(MODULE_ID, "dispelMagicNames", {
    name: "COUNTERSPELL_PLUS.Settings.DispelNames.Name",
    hint: "COUNTERSPELL_PLUS.Settings.DispelNames.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "Dispel Magic, Rozproszenie magii",
    restricted: true
  });

  game.settings.register(MODULE_ID, "wildMagic", {
    name: "COUNTERSPELL_PLUS.Settings.WildMagic.Name",
    hint: "COUNTERSPELL_PLUS.Settings.WildMagic.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });
}
