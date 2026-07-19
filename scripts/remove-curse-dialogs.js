import { RULESETS } from "./config.js";
import {
  activateAbjurerProficiency,
  activateTargetSearch,
  escapeHTML,
  getAbilityData,
  getAbilityEntries,
  getActorFromUuidSync,
  getDefaultAbility,
  isAbjurerOptionEnabled,
  getSpecialMinimum,
  getRollModeEntries,
  getSceneCasterEntries,
  getSlotChoices,
  normalizeBonusFormula,
  parseNumber,
  t,
  tf,
  usesHomebrewProficiency
} from "./utils.js";

const DialogV2 = foundry.applications.api.DialogV2;
const SPECIAL_TARGET_UNKNOWN = "special:unknown";
const SPECIAL_TARGET_OBJECT = "special:object";

function selectOptions(entries, valueKey = "key", labelKey = "label") {
  return entries.map(entry => {
    const selected = entry.selected ? " selected" : "";
    return `<option value="${escapeHTML(entry[valueKey])}"${selected}>${escapeHTML(entry[labelKey])}</option>`;
  }).join("");
}

function searchableEntries(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  return entries.map((entry, index) => {
    if (counts.get(entry.label) === 1) return { ...entry, searchLabel: entry.label };
    const suffix = String(entry.key).split(".").pop()?.slice(-6) || String(index + 1);
    return { ...entry, searchLabel: `${entry.label} [${suffix}]` };
  });
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

function sourceLabel() {
  return t("RemoveCurse.Dialog.CurseSource");
}

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 620, onRender }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog", "remove-curse-plus-dialog"],
    content,
    render: onRender,
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

export async function promptCurseRemover(actor, item, ruleset) {
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const slots = getSlotChoices(actor, item, {
    standardLabelKey: "RemoveCurse.Dialog.SlotStandard",
    pactLabelKey: "RemoveCurse.Dialog.SlotPact"
  });
  const slotOptions = slots.length
    ? selectOptions(slots)
    : `<option value="">${t("Dialog.NoSlotsAvailable")}</option>`;
  const proficiencyIncluded = usesHomebrewProficiency();
  const showAbjurer = ruleset === RULESETS.HOMEBREW && isAbjurerOptionEnabled();
  const abjurerField = showAbjurer
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="abjurer" data-csp-abjurer>
          ${t("Dialog.Abjurer")}
        </label>
        <p class="hint">${t("Dialog.AbjurerHint")}</p>
      </div>`
    : "";

  const homebrewBonus = ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceHint")}</p>
      </div>`
    : `<p class="hint">${t("RemoveCurse.Dialog.OfficialBonusLater")}</p>`;

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(ruleset === RULESETS.HOMEBREW ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CastingMethod")}</label>
        <div class="form-fields"><select name="castingSource">
          <option value="spell">${t("Dialog.CastNormally")}</option>
          <option value="scroll">${t("Dialog.CastFromScroll")}</option>
        </select></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.Ability")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.DispelSlot")}</label>
        <div class="form-fields"><select name="slotKey">${slotOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollLevel")}</label>
        <div class="form-fields"><select name="scrollLevel">${levelOptions(3, 3)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollAuthorModifier")}</label>
        <div class="form-fields"><input type="number" name="scrollAuthorMod" value="0" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollAuthorProficiency")}</label>
        <div class="form-fields"><input type="number" name="scrollAuthorProf" value="0" min="0" step="1" data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"></div>
      </div>
      <p class="hint">${t("Dialog.ScrollCastingHint")}</p>
      <div class="form-group">
        <label>${t("Dialog.RollMode")}</label>
        <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      ${homebrewBonus}
      ${abjurerField}
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
    title: t("RemoveCurse.Dialog.DispellerTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM"),
    onRender: activateAbjurerProficiency
  });
  if (!result) return null;

  const castingSource = String(result.castingSource) === "scroll" ? "scroll" : "spell";
  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (castingSource === "spell" && !selectedSlot) {
    ui.notifications.warn(t("RemoveCurse.Notifications.NoSlots"));
    return null;
  }
  const ability = String(result.ability);
  const abilityData = castingSource === "scroll"
    ? {
        ability,
        abilityMod: parseNumber(result.scrollAuthorMod, 0),
        proficiency: parseNumber(result.scrollAuthorProf, 0)
      }
    : getAbilityData(actor, ability);
  const slotLevel = castingSource === "scroll"
    ? parseNumber(result.scrollLevel, 3)
    : selectedSlot.level;
  return {
    ...abilityData,
    castingSource,
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: item.name,
    slotKey: castingSource === "scroll" ? null : selectedSlot.key,
    slotLevel,
    slotLabel: castingSource === "scroll" ? tf("Dialog.ScrollCastingLevel", { level: slotLevel }) : selectedSlot.label,
    rollMode: String(result.rollMode),
    bonusFormula: ruleset === RULESETS.HOMEBREW ? normalizeBonusFormula(result.bonusFormula) : "",
    abjurer: showAbjurer && Boolean(result.abjurer),
    disadvantage: Boolean(result.disadvantage),
    ruleset
  };
}

export async function promptGMRemoveCurseSetup(remover) {
  const targets = getSceneCasterEntries();
  if (!targets.length) {
    ui.notifications.warn(t("RemoveCurse.Notifications.NoTargets"));
    return null;
  }
  let targetOptions = targets.map((entry, index) => ({
    key: entry.uuid,
    label: tf(entry.kind === "token" ? "Dialog.TargetTokenEntry" : "Dialog.TargetActorEntry", { name: entry.name }),
    name: entry.name,
    kind: entry.kind,
    selected: index === 0
  }));
  targetOptions.push(
    { key: SPECIAL_TARGET_UNKNOWN, label: tf("Dialog.TargetSpecialEntry", { name: t("Dialog.SpecialUnknown") }), name: t("Dialog.SpecialUnknown"), kind: "special", selected: false },
    { key: SPECIAL_TARGET_OBJECT, label: tf("Dialog.TargetSpecialEntry", { name: t("Dialog.SpecialObject") }), name: t("Dialog.SpecialObject"), kind: "special", selected: false }
  );
  targetOptions = searchableEntries(targetOptions);

  const content = `
    <div class="csp-form">
      <div class="csp-panel">
        <h3>${t("RemoveCurse.Dialog.DispelData")}</h3>
        <dl>
          <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(remover.actorName)}</dd>
          <dt>${t("Dialog.AbilityModifier")}</dt><dd>${remover.abilityMod >= 0 ? "+" : ""}${remover.abilityMod}</dd>
          <dt>${t("Dialog.Proficiency")}</dt><dd>${remover.proficiency >= 0 ? "+" : ""}${remover.proficiency}</dd>
          <dt>${t("RemoveCurse.Dialog.DispelSlot")}</dt><dd>${escapeHTML(remover.slotLabel)}</dd>
        </dl>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.Target")}</label>
        <div class="form-fields csp-target-search">
          <input type="search" data-csp-target-filter placeholder="${escapeHTML(t("Dialog.SearchTargetPlaceholder"))}" autocomplete="off">
          <select name="targetUuid" data-csp-target-select size="6" required>${selectOptions(targetOptions, "key", "searchLabel")}</select>
          <small data-csp-target-count></small>
        </div>
      </div>
      <p class="hint">${t("RemoveCurse.Dialog.SpecialTargetHint")}</p>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.EffectCount")}</label>
        <div class="form-fields"><input type="number" name="effectCount" value="1" min="1" max="20" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.DefenseRollMode")}</label>
        <div class="form-fields"><select name="defenseRollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      <p class="hint">${t("RemoveCurse.Dialog.SetupHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("RemoveCurse.Dialog.GMSetupTitle"),
    content,
    confirmLabel: t("Dialog.Continue"),
    onRender: activateTargetSearch
  });
  if (!result) return null;

  const targetChoice = String(result.targetUuid ?? "");
  const selectedTarget = targetOptions.find(entry => entry.key === targetChoice);
  if (!selectedTarget) {
    ui.notifications.error(t("Notifications.SelectTargetSuggestion"));
    return null;
  }
  const specialLabels = {
    [SPECIAL_TARGET_UNKNOWN]: t("Dialog.SpecialUnknown"),
    [SPECIAL_TARGET_OBJECT]: t("Dialog.SpecialObject")
  };
  const targetType = targetChoice.startsWith("special:")
    ? targetChoice.slice("special:".length)
    : "actor";
  const target = targetType === "actor" ? getActorFromUuidSync(targetChoice) : null;
  if (!target && targetType === "actor") {
    ui.notifications.error(t("RemoveCurse.Notifications.TargetNotFound"));
    return null;
  }

  return {
    targetUuid: target ? targetChoice : "",
    targetType,
    targetName: target ? selectedTarget.name : specialLabels[targetChoice] ?? t("Dialog.SpecialUnknown"),
    effectCount: Math.min(20, Math.max(1, Math.trunc(parseNumber(result.effectCount, 1)))),
    defenseRollMode: String(result.defenseRollMode),
    defenseUserId: game.user.id,
    effects: []
  };
}

export async function promptGMRemoveCurseEffect(index, count, targetType = "actor") {
  void targetType;
  const sourceField = `
    <div class="form-group">
      <label>${t("Dialog.SourceType")}</label>
      <div class="form-fields">
        <input type="hidden" name="sourceType" value="curse">
        <strong>${t("RemoveCurse.Dialog.CurseSource")}</strong>
      </div>
    </div>`;
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${tf("RemoveCurse.Dialog.EffectNumber", { index: index + 1, count })}</strong>
      </div>
      ${sourceField}
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.EffectName")}</label>
        <div class="form-fields"><input type="text" name="spellName" placeholder="Mummy Rot" required></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.EffectLevel")}</label>
        <div class="form-fields"><select name="spellLevel">${levelOptions(1)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.CasterCreatorModifier")}</label>
        <div class="form-fields"><input type="number" name="casterMod" value="0" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.CasterCreatorProficiency")}</label>
        <div class="form-fields"><input type="number" name="casterProf" value="0" min="0" step="1"></div>
      </div>
      <p class="hint">${t("RemoveCurse.Dialog.SourceBaseHint")}</p>
    </div>`;

  const result = await waitForm({
    title: tf("RemoveCurse.Dialog.GMEffectTitle", { index: index + 1, count }),
    content,
    confirmLabel: index + 1 === count ? t("Dialog.SendToGM") : t("Dialog.Continue")
  });
  if (!result) return null;

  return {
    sourceType: "curse",
    spellName: String(result.spellName || t("RemoveCurse.Chat.UnknownCurse")),
    spellLevel: parseNumber(result.spellLevel, 0),
    casterMod: parseNumber(result.casterMod, 0),
    casterProf: parseNumber(result.casterProf, 0),
    known: false,
    bonusFormula: ""
  };
}

export async function promptCurseRemoverEffects(remover, setup) {
  const hideLevels = setup.defenseRollMode === "blindroll";
  const effectCards = setup.effects.map((effect, index) => {
    const homebrewFields = remover.ruleset === RULESETS.HOMEBREW
      ? `
        <label class="checkbox">
          <input type="checkbox" name="known${index}">
          ${t("RemoveCurse.Dialog.KnowsEffect")}
        </label>
        <p class="hint">${t("RemoveCurse.Dialog.KnowsEffectHint")}</p>`
      : `
        <div class="form-group stacked">
          <label>${t("RemoveCurse.Dialog.CheckBonusDice")}</label>
          <div class="form-fields"><input type="text" name="bonus${index}" placeholder="1d4 + 1d8"></div>
          <p class="hint">${hideLevels
            ? t("RemoveCurse.Dialog.HiddenLevelBonusHint")
            : effect.spellLevel <= remover.slotLevel
              ? t("RemoveCurse.Dialog.AutomaticBonusIgnored")
              : t("RemoveCurse.Dialog.CheckBonusDiceHint")}</p>
        </div>`;
    return `
      <fieldset class="csp-effect-card">
        <legend>${index + 1}. ${escapeHTML(effect.spellName)}</legend>
        <p>${escapeHTML(sourceLabel(effect.sourceType))} · ${hideLevels
          ? t("RemoveCurse.Dialog.HiddenLevel")
          : tf("RemoveCurse.Dialog.LevelValue", { level: effect.spellLevel })}</p>
        ${homebrewFields}
      </fieldset>`;
  }).join("");

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(setup.targetName)}</strong>
        <span>${tf("RemoveCurse.Dialog.EffectsSummary", { count: setup.effects.length })}</span>
      </div>
      ${effectCards}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;
  const result = await waitForm({
    title: t("RemoveCurse.Dialog.PlayerEffectsTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM"),
    width: 680
  });
  if (!result) return null;

  const effects = setup.effects.map((effect, index) => ({
    ...effect,
    known: remover.ruleset === RULESETS.HOMEBREW && Boolean(result[`known${index}`]),
    bonusFormula: remover.ruleset === RULESETS.OFFICIAL_2014
      ? normalizeBonusFormula(result[`bonus${index}`])
      : ""
  }));
  return { ...setup, effects };
}

export async function promptGMRemoveCurseReview(remover, setup) {
  const homebrew = remover.ruleset === RULESETS.HOMEBREW;
  const specialMinimum = getSpecialMinimum("removeCurseSpecialMinimum");
  const removerUsesScroll = remover.castingSource === "scroll";
  const proficiencyIncluded = usesHomebrewProficiency();
  const showAbjurer = homebrew && isAbjurerOptionEnabled();
  const abjurerField = showAbjurer
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="removerAbjurer" data-csp-abjurer${remover.abjurer ? " checked" : ""}>
          ${t("Dialog.GMConfirmAbjurer")}
        </label>
        <p class="hint">${t("Dialog.AbjurerHint")}</p>
      </div>`
    : "";
  const effectRows = setup.effects.map((effect, index) => `
    <fieldset class="csp-effect-card">
      <legend>${tf("RemoveCurse.Dialog.EffectNumber", { index: index + 1, count: setup.effects.length })}</legend>
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields"><input type="hidden" name="source${index}" value="curse"><strong>${t("RemoveCurse.Dialog.CurseSource")}</strong></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.EffectName")}</label>
        <div class="form-fields"><input type="text" name="name${index}" value="${escapeHTML(effect.spellName)}" required></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.EffectLevel")}</label>
        <div class="form-fields"><select name="level${index}">${levelOptions(effect.spellLevel)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.CasterCreatorModifier")}</label>
        <div class="form-fields"><input type="number" name="mod${index}" value="${effect.casterMod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${t("RemoveCurse.Dialog.CasterCreatorProficiency")}</label>
        <div class="form-fields"><input type="number" name="prof${index}" value="${effect.casterProf}" min="0" step="1"></div>
      </div>
      ${homebrew ? `
        <label class="checkbox">
          <input type="checkbox" name="known${index}"${effect.known ? " checked" : ""}>
          ${t("RemoveCurse.Dialog.GMConfirmKnown")}
        </label>` : `
        <div class="form-group stacked">
          <label>${t("RemoveCurse.Dialog.CheckBonusDice")}</label>
          <div class="form-fields"><input type="text" name="effectBonus${index}" value="${escapeHTML(effect.bonusFormula)}" placeholder="1d4 + 1d8"></div>
          <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
        </div>`}
    </fieldset>`).join("");

  const generalBonus = homebrew
    ? `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" value="${escapeHTML(remover.bonusFormula)}" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
      </div>`
    : "";

  const content = `
    <div class="csp-form">
      <div class="csp-grid">
        <div class="csp-panel">
          <h3>${t("RemoveCurse.Dialog.DispelData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(remover.actorName)}</dd>
            <dt>${t("Dialog.CastingMethod")}</dt><dd>${removerUsesScroll ? t("Dialog.CastFromScroll") : t("Dialog.CastNormally")}</dd>
            <dt>${t("RemoveCurse.Dialog.Ability")}</dt><dd>${removerUsesScroll ? t("Dialog.ScrollAuthor") : escapeHTML(remover.ability.toUpperCase())}</dd>
            <dt>${t("Dialog.AbilityModifier")}</dt><dd>${remover.abilityMod >= 0 ? "+" : ""}${remover.abilityMod}</dd>
            <dt>${t("Dialog.Proficiency")}</dt><dd>${remover.proficiency >= 0 ? "+" : ""}${remover.proficiency}</dd>
            <dt>${t("RemoveCurse.Dialog.DispelSlot")}</dt><dd>${remover.slotLevel}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(remover.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("RemoveCurse.Dialog.TargetData")}</h3>
          <dl>
            <dt>${t("RemoveCurse.Dialog.Target")}</dt><dd>${escapeHTML(setup.targetName)}</dd>
            <dt>${t("RemoveCurse.Dialog.EffectCount")}</dt><dd>${setup.effects.length}</dd>
            <dt>${t("RemoveCurse.Dialog.DefenseRollMode")}</dt><dd>${escapeHTML(rollModeLabel(setup.defenseRollMode))}</dd>
          </dl>
        </div>
      </div>
      <div class="form-group">
        <label>${removerUsesScroll ? t("Dialog.ScrollAuthorModifier") : t("Dialog.AbilityModifier")}</label>
        <div class="form-fields"><input type="number" name="removerAbilityMod" value="${remover.abilityMod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${removerUsesScroll ? t("Dialog.ScrollAuthorProficiency") : t("Dialog.Proficiency")}</label>
        <div class="form-fields"><input type="number" name="removerProficiency" value="${remover.proficiency}" min="0" step="1"${removerUsesScroll ? ` data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"` : ""}></div>
      </div>
      ${removerUsesScroll ? `
        <div class="form-group">
          <label>${t("Dialog.ScrollLevel")}</label>
          <div class="form-fields"><input type="number" name="removerScrollLevel" value="${remover.slotLevel}" min="3" max="9" step="1"></div>
        </div>` : ""}
      ${generalBonus}
      ${abjurerField}
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="specialSpellcaster"${remover.specialSpellcaster ? " checked" : ""}>
          ${t("RemoveCurse.Dialog.SpecialSpellcaster")}
        </label>
        <p class="hint">${tf("RemoveCurse.Dialog.SpecialCursecasterHint", { minimum: specialMinimum })}</p>
      </div>
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="disadvantage"${remover.disadvantage ? " checked" : ""}>
          ${t("RemoveCurse.Dialog.GMConfirmDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.GMDisadvantageHint")}</p>
      </div>
      <h3>${t("RemoveCurse.Dialog.EffectsToResolve")}</h3>
      ${effectRows}
      <p class="hint">${t("RemoveCurse.Dialog.GMReviewHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("RemoveCurse.Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Dialog.Roll"),
    width: 760,
    onRender: activateAbjurerProficiency
  });
  if (!result) return null;

  const reviewedEffects = setup.effects.map((effect, index) => ({
    ...effect,
    sourceType: "curse",
    spellName: String(result[`name${index}`] || effect.spellName),
    spellLevel: parseNumber(result[`level${index}`], effect.spellLevel),
    casterMod: parseNumber(result[`mod${index}`], effect.casterMod),
    casterProf: parseNumber(result[`prof${index}`], effect.casterProf),
    known: homebrew && Boolean(result[`known${index}`]),
    bonusFormula: !homebrew ? normalizeBonusFormula(result[`effectBonus${index}`]) : ""
  }));
  const reviewedScrollLevel = Math.min(9, Math.max(3, Math.trunc(parseNumber(result.removerScrollLevel, remover.slotLevel))));

  return {
    remover: {
      ...remover,
      abilityMod: parseNumber(result.removerAbilityMod, remover.abilityMod),
      proficiency: parseNumber(result.removerProficiency, remover.proficiency),
      slotLevel: removerUsesScroll ? reviewedScrollLevel : remover.slotLevel,
      slotLabel: removerUsesScroll
        ? tf("Dialog.ScrollCastingLevel", { level: reviewedScrollLevel })
        : remover.slotLabel,
      bonusFormula: homebrew ? normalizeBonusFormula(result.bonusFormula) : "",
      specialSpellcaster: Boolean(result.specialSpellcaster),
      abjurer: showAbjurer && Boolean(result.removerAbjurer),
      disadvantage: Boolean(result.disadvantage)
    },
    setup: { ...setup, effects: reviewedEffects }
  };
}
