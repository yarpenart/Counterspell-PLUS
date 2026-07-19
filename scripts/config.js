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

  game.settings.register(MODULE_ID, "counterspellNames", {
    name: "COUNTERSPELL_PLUS.Settings.Names.Name",
    hint: "COUNTERSPELL_PLUS.Settings.Names.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "Counterspell, Counterspell (Alternate), Kontrzaklęcie, Kontrczar",
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
