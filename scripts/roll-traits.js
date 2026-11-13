import { escapeHTML, getSpecialMinimum, t } from "./utils.js";

const keyFor = (prefix, key) => prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;

export function readRollTraits(form, prefix = "", fallback = {}) {
  const present = Boolean(form[keyFor(prefix, "traitsPresent")]);
  const read = key => Object.hasOwn(form, keyFor(prefix, key))
    ? form[keyFor(prefix, key)] : present ? false : fallback[key];
  const disadvantage = Boolean(read("disadvantage"));
  return {
    disadvantage,
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
    <div class="form-group stacked">${checkbox("disadvantage", "Disadvantage")}</div>
    <div class="form-group stacked">${checkbox("abjurer", "Abjurer")}</div>
    <div class="form-group stacked">${checkbox("specialSpellcaster", "SpecialSpellcaster")}</div>
    <p class="hint">${t(passive ? "RollTraits.PassiveHint" : "RollTraits.Hint")}</p>
  </fieldset>`;
}

/** Always resolve to normal, advantage (2d20kh), or disadvantage (2d20kl). */
export function resolveD20Options(traits = {}, { bonusAdvantageSources = 0, minimumSetting } = {}) {
  const hasAdvantage = bonusAdvantageSources > 0;
  const advantage = hasAdvantage && !traits.disadvantage;
  const disadvantage = Boolean(traits.disadvantage) && !hasAdvantage;
  return {
    advantage, disadvantage,
    minimum: traits.specialSpellcaster && minimumSetting ? getSpecialMinimum(minimumSetting) : undefined
  };
}
