import { MODULE_ID } from "./config.js";
import { escapeHTML, getSpecialMinimum, t } from "./utils.js";

const keyFor = (prefix, key) => prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
const sourceCount = value => Math.min(999, Math.max(1, Math.trunc(Number(value) || 1)));

export function readRollTraits(form, prefix = "", fallback = {}) {
  const present = Boolean(form[keyFor(prefix, "traitsPresent")]);
  const read = key => Object.hasOwn(form, keyFor(prefix, key))
    ? form[keyFor(prefix, key)] : present ? false : fallback[key];
  const advantage = Boolean(read("advantage"));
  const disadvantage = Boolean(read("disadvantage"));
  return {
    advantage, disadvantage,
    advantageSources: advantage ? sourceCount(read("advantageSources")) : 0,
    disadvantageSources: disadvantage ? sourceCount(read("disadvantageSources")) : 0,
    abjurer: Boolean(read("abjurer")),
    specialSpellcaster: Boolean(read("specialSpellcaster"))
  };
}

export function rollTraitsFields(data = {}, { prefix = "", side = "", passive = false } = {}) {
  const name = key => escapeHTML(keyFor(prefix, key));
  const checkbox = (key, label) => `<label class="checkbox"><input type="checkbox" name="${name(key)}"${data[key] ? " checked" : ""}${key === "abjurer" ? " data-csp-abjurer" : ""}> ${t(`RollTraits.${label}`)}</label>`;
  return `<fieldset class="csp-effect-card csp-roll-traits">
    <legend>${side ? `${t(`Review.${side}`)} — ` : ""}${t("RollTraits.Title")}</legend>
    <input type="hidden" name="${name("traitsPresent")}" value="1">
    <div class="form-group stacked">${checkbox("advantage", "Advantage")}
      <label>${t("RollTraits.AdvantageSources")} <input type="number" name="${name("advantageSources")}" value="${sourceCount(data.advantageSources)}" min="1" max="999" step="1"></label></div>
    <div class="form-group stacked">${checkbox("disadvantage", "Disadvantage")}
      <label>${t("RollTraits.DisadvantageSources")} <input type="number" name="${name("disadvantageSources")}" value="${sourceCount(data.disadvantageSources)}" min="1" max="999" step="1"></label></div>
    <div class="form-group stacked">${checkbox("abjurer", "Abjurer")}</div>
    <div class="form-group stacked">${checkbox("specialSpellcaster", "SpecialSpellcaster")}</div>
    <p class="hint">${t(passive ? "RollTraits.PassiveHint" : "RollTraits.Hint")}</p>
  </fieldset>`;
}

/** Always resolve to normal, advantage (2d20kh), or disadvantage (2d20kl). */
export function resolveD20Options(traits = {}, { bonusAdvantageSources = 0, minimumSetting } = {}) {
  const advantageCount = (traits.advantage ? sourceCount(traits.advantageSources) : 0)
    + Math.max(0, Math.trunc(Number(bonusAdvantageSources) || 0));
  const disadvantageCount = traits.disadvantage ? sourceCount(traits.disadvantageSources) : 0;
  const majority = game.settings.get(MODULE_ID, "advantageCancellation") === "sourceMajority";
  const advantage = majority ? advantageCount > disadvantageCount : advantageCount > 0 && disadvantageCount === 0;
  const disadvantage = majority ? disadvantageCount > advantageCount : disadvantageCount > 0 && advantageCount === 0;
  return {
    advantage, disadvantage,
    minimum: traits.specialSpellcaster && minimumSetting ? getSpecialMinimum(minimumSetting) : undefined
  };
}
