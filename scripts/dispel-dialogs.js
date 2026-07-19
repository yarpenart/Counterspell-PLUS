import { RULESETS } from "./config.js";
import {
  escapeHTML,
  getAbilityData,
  getAbilityEntries,
  getActorFromUuidSync,
  getDefaultAbility,
  getRollModeEntries,
  getSceneCasterEntries,
  getSlotChoices,
  normalizeBonusFormula,
  parseNumber,
  t,
  tf
} from "./utils.js";

const DialogV2 = foundry.applications.api.DialogV2;

function selectOptions(entries, valueKey = "key", labelKey = "label") {
  return entries.map(entry => {
    const selected = entry.selected ? " selected" : "";
    return `<option value="${escapeHTML(entry[valueKey])}"${selected}>${escapeHTML(entry[labelKey])}</option>`;
  }).join("");
}

function levelOptions(selected, minimum = 0) {
  return Array.from({ length: 10 - minimum }, (_, index) => index + minimum)
    .map(level => `<option value="${level}"${level === Number(selected) ? " selected" : ""}>${level}</option>`)
    .join("");
}

function defaultRollMode() {
  const configured = game.settings.get("core", "rollMode");
  return ["publicroll", "gmroll", "blindroll"].includes(configured)
    ? configured
    : "publicroll";
}

function rollModeLabel(mode) {
  return getRollModeEntries(mode).find(entry => entry.key === mode)?.label ?? mode;
}

function sourceLabel(sourceType) {
  if (sourceType === "scroll") return t("Dialog.Scroll");
  if (sourceType === "glyph") return t("Dialog.Glyph");
  return t("Dialog.NormalSpell");
}

function sourceOptions(selected = "spell") {
  return [
    { key: "spell", label: t("Dialog.NormalSpell") },
    { key: "scroll", label: t("Dialog.Scroll") },
    { key: "glyph", label: t("Dialog.Glyph") }
  ].map(entry => `<option value="${entry.key}"${entry.key === selected ? " selected" : ""}>${escapeHTML(entry.label)}</option>`).join("");
}

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 620 }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog", "dispel-plus-dialog"],
    content,
    buttons: [
      {
        action: "cancel",
        label: t("Dialog.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      },
      {
        action: "confirm",
        label: confirmLabel,
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => new FormDataExtended(button.form).object
      }
    ],
    rejectClose: false,
    modal: false
  });
}

export async function promptDispeller(actor, item, ruleset) {
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const slots = getSlotChoices(actor, item);
  if (!slots.length) {
    ui.notifications.warn(t("Dispel.Notifications.NoSlots"));
    return null;
  }

  const homebrewBonus = ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceHint")}</p>
      </div>`
    : `<p class="hint">${t("Dispel.Dialog.OfficialBonusLater")}</p>`;

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(ruleset === RULESETS.HOMEBREW ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
      </div>
      <div class="form-group">
        <label>${t("Dialog.Ability")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.DispelSlot")}</label>
        <div class="form-fields"><select name="slotKey">${selectOptions(slots)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.RollMode")}</label>
        <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      ${homebrewBonus}
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="disadvantage">
          ${t("Dialog.DeclareDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.DisadvantageHint")}</p>
      </div>
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dispel.Dialog.DispellerTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM")
  });
  if (!result) return null;

  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (!selectedSlot) return null;
  const ability = String(result.ability);
  return {
    ...getAbilityData(actor, ability),
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: item.name,
    slotKey: selectedSlot.key,
    slotLevel: selectedSlot.level,
    slotLabel: selectedSlot.label,
    rollMode: String(result.rollMode),
    bonusFormula: ruleset === RULESETS.HOMEBREW ? normalizeBonusFormula(result.bonusFormula) : "",
    disadvantage: Boolean(result.disadvantage),
    ruleset
  };
}

export async function promptGMDispelSetup(dispeller) {
  const targets = getSceneCasterEntries();
  if (!targets.length) {
    ui.notifications.warn(t("Dispel.Notifications.NoTargets"));
    return null;
  }
  const targetOptions = targets.map((entry, index) => ({
    key: entry.uuid,
    label: entry.name,
    selected: index === 0
  }));

  const content = `
    <div class="csp-form">
      <div class="csp-panel">
        <h3>${t("Dispel.Dialog.DispelData")}</h3>
        <dl>
          <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(dispeller.actorName)}</dd>
          <dt>${t("Dialog.AbilityModifier")}</dt><dd>${dispeller.abilityMod >= 0 ? "+" : ""}${dispeller.abilityMod}</dd>
          <dt>${t("Dialog.Proficiency")}</dt><dd>${dispeller.proficiency >= 0 ? "+" : ""}${dispeller.proficiency}</dd>
          <dt>${t("Dispel.Dialog.DispelSlot")}</dt><dd>${escapeHTML(dispeller.slotLabel)}</dd>
        </dl>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.Target")}</label>
        <div class="form-fields"><select name="targetUuid">${selectOptions(targetOptions)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.EffectCount")}</label>
        <div class="form-fields"><input type="number" name="effectCount" value="1" min="1" max="20" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.DefenseRollMode")}</label>
        <div class="form-fields"><select name="defenseRollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      <p class="hint">${t("Dispel.Dialog.SetupHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dispel.Dialog.GMSetupTitle"),
    content,
    confirmLabel: t("Dialog.Continue")
  });
  if (!result) return null;

  const target = getActorFromUuidSync(result.targetUuid);
  if (!target) {
    ui.notifications.error(t("Dispel.Notifications.TargetNotFound"));
    return null;
  }

  return {
    targetUuid: String(result.targetUuid),
    targetName: target.name,
    effectCount: Math.min(20, Math.max(1, Math.trunc(parseNumber(result.effectCount, 1)))),
    defenseRollMode: String(result.defenseRollMode),
    defenseUserId: game.user.id,
    effects: []
  };
}

export async function promptGMDispelEffect(index, count) {
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${tf("Dispel.Dialog.EffectNumber", { index: index + 1, count })}</strong>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields"><select name="sourceType">${sourceOptions()}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.EffectName")}</label>
        <div class="form-fields"><input type="text" name="spellName" placeholder="Bless" required></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.EffectLevel")}</label>
        <div class="form-fields"><select name="spellLevel">${levelOptions(1)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.CasterCreatorModifier")}</label>
        <div class="form-fields"><input type="number" name="casterMod" value="0" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.CasterCreatorProficiency")}</label>
        <div class="form-fields"><input type="number" name="casterProf" value="0" min="0" step="1"></div>
      </div>
      <p class="hint">${t("Dispel.Dialog.SourceBaseHint")}</p>
    </div>`;

  const result = await waitForm({
    title: tf("Dispel.Dialog.GMEffectTitle", { index: index + 1, count }),
    content,
    confirmLabel: index + 1 === count ? t("Dialog.SendToGM") : t("Dialog.Continue")
  });
  if (!result) return null;

  return {
    sourceType: String(result.sourceType),
    spellName: String(result.spellName || t("Chat.UnknownSpell")),
    spellLevel: parseNumber(result.spellLevel, 0),
    casterMod: parseNumber(result.casterMod, 0),
    casterProf: parseNumber(result.casterProf, 0),
    known: false,
    bonusFormula: ""
  };
}

export async function promptDispellerEffects(dispeller, setup) {
  const effectCards = setup.effects.map((effect, index) => {
    const homebrewFields = dispeller.ruleset === RULESETS.HOMEBREW
      ? `
        <label class="checkbox">
          <input type="checkbox" name="known${index}">
          ${t("Dispel.Dialog.KnowsEffect")}
        </label>
        <p class="hint">${t("Dispel.Dialog.KnowsEffectHint")}</p>`
      : `
        <div class="form-group stacked">
          <label>${t("Dispel.Dialog.CheckBonusDice")}</label>
          <div class="form-fields"><input type="text" name="bonus${index}" placeholder="1d4 + 1d8"></div>
          <p class="hint">${effect.spellLevel <= dispeller.slotLevel
            ? t("Dispel.Dialog.AutomaticBonusIgnored")
            : t("Dispel.Dialog.CheckBonusDiceHint")}</p>
        </div>`;
    return `
      <fieldset class="csp-effect-card">
        <legend>${index + 1}. ${escapeHTML(effect.spellName)}</legend>
        <p>${escapeHTML(sourceLabel(effect.sourceType))} · ${tf("Dispel.Dialog.LevelValue", { level: effect.spellLevel })}</p>
        ${homebrewFields}
      </fieldset>`;
  }).join("");

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(setup.targetName)}</strong>
        <span>${tf("Dispel.Dialog.EffectsSummary", { count: setup.effects.length })}</span>
      </div>
      ${effectCards}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;
  const result = await waitForm({
    title: t("Dispel.Dialog.PlayerEffectsTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM"),
    width: 680
  });
  if (!result) return null;

  const effects = setup.effects.map((effect, index) => ({
    ...effect,
    known: dispeller.ruleset === RULESETS.HOMEBREW && Boolean(result[`known${index}`]),
    bonusFormula: dispeller.ruleset === RULESETS.OFFICIAL_2014
      ? normalizeBonusFormula(result[`bonus${index}`])
      : ""
  }));
  return { ...setup, effects };
}

export async function promptGMDispelReview(dispeller, setup) {
  const homebrew = dispeller.ruleset === RULESETS.HOMEBREW;
  const effectRows = setup.effects.map((effect, index) => `
    <fieldset class="csp-effect-card">
      <legend>${tf("Dispel.Dialog.EffectNumber", { index: index + 1, count: setup.effects.length })}</legend>
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields"><select name="source${index}">${sourceOptions(effect.sourceType)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.EffectName")}</label>
        <div class="form-fields"><input type="text" name="name${index}" value="${escapeHTML(effect.spellName)}" required></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.EffectLevel")}</label>
        <div class="form-fields"><select name="level${index}">${levelOptions(effect.spellLevel)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.CasterCreatorModifier")}</label>
        <div class="form-fields"><input type="number" name="mod${index}" value="${effect.casterMod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.CasterCreatorProficiency")}</label>
        <div class="form-fields"><input type="number" name="prof${index}" value="${effect.casterProf}" min="0" step="1"></div>
      </div>
      ${homebrew ? `
        <label class="checkbox">
          <input type="checkbox" name="known${index}"${effect.known ? " checked" : ""}>
          ${t("Dispel.Dialog.GMConfirmKnown")}
        </label>` : `
        <div class="form-group stacked">
          <label>${t("Dispel.Dialog.CheckBonusDice")}</label>
          <div class="form-fields"><input type="text" name="effectBonus${index}" value="${escapeHTML(effect.bonusFormula)}" placeholder="1d4 + 1d8"></div>
          <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
        </div>`}
    </fieldset>`).join("");

  const generalBonus = homebrew
    ? `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" value="${escapeHTML(dispeller.bonusFormula)}" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
      </div>`
    : "";

  const content = `
    <div class="csp-form">
      <div class="csp-grid">
        <div class="csp-panel">
          <h3>${t("Dispel.Dialog.DispelData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(dispeller.actorName)}</dd>
            <dt>${t("Dialog.Ability")}</dt><dd>${escapeHTML(dispeller.ability.toUpperCase())}</dd>
            <dt>${t("Dialog.AbilityModifier")}</dt><dd>${dispeller.abilityMod >= 0 ? "+" : ""}${dispeller.abilityMod}</dd>
            <dt>${t("Dialog.Proficiency")}</dt><dd>${dispeller.proficiency >= 0 ? "+" : ""}${dispeller.proficiency}</dd>
            <dt>${t("Dispel.Dialog.DispelSlot")}</dt><dd>${dispeller.slotLevel}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(dispeller.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("Dispel.Dialog.TargetData")}</h3>
          <dl>
            <dt>${t("Dispel.Dialog.Target")}</dt><dd>${escapeHTML(setup.targetName)}</dd>
            <dt>${t("Dispel.Dialog.EffectCount")}</dt><dd>${setup.effects.length}</dd>
            <dt>${t("Dispel.Dialog.DefenseRollMode")}</dt><dd>${escapeHTML(rollModeLabel(setup.defenseRollMode))}</dd>
          </dl>
        </div>
      </div>
      ${generalBonus}
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="disadvantage"${dispeller.disadvantage ? " checked" : ""}>
          ${t("Dispel.Dialog.GMConfirmDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.GMDisadvantageHint")}</p>
      </div>
      <h3>${t("Dispel.Dialog.EffectsToResolve")}</h3>
      ${effectRows}
      <p class="hint">${t("Dispel.Dialog.GMReviewHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dispel.Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Dialog.Roll"),
    width: 760
  });
  if (!result) return null;

  const reviewedEffects = setup.effects.map((effect, index) => ({
    ...effect,
    sourceType: String(result[`source${index}`]),
    spellName: String(result[`name${index}`] || effect.spellName),
    spellLevel: parseNumber(result[`level${index}`], effect.spellLevel),
    casterMod: parseNumber(result[`mod${index}`], effect.casterMod),
    casterProf: parseNumber(result[`prof${index}`], effect.casterProf),
    known: homebrew && Boolean(result[`known${index}`]),
    bonusFormula: !homebrew ? normalizeBonusFormula(result[`effectBonus${index}`]) : ""
  }));

  return {
    dispeller: {
      ...dispeller,
      bonusFormula: homebrew ? normalizeBonusFormula(result.bonusFormula) : "",
      disadvantage: Boolean(result.disadvantage)
    },
    setup: { ...setup, effects: reviewedEffects }
  };
}
