import { RULESETS } from "./config.js";
import {
  activateAbjurerProficiency,
  activateTargetSearch,
  escapeHTML,
  getAbilityData,
  getAbilityEntries,
  getActorFromUuidSync,
  getDefaultAbility,
  getRollModeEntries,
  getSceneCasterEntries,
  getSlotChoices,
  isAbjurerOptionEnabled,
  getSpecialMinimum,
  normalizeBonusFormula,
  parseNumber,
  t,
  tf,
  usesHomebrewProficiency
} from "./utils.js";
import {
  ITEM_RARITIES,
  RESTORATION_EFFECTS,
  getRestorationEffectIds,
  getRestorationMaterial,
  restorationEffectNeedsCheck
} from "./restoration-rules.js";

const DialogV2 = foundry.applications.api.DialogV2;
const SPECIAL_TARGET_UNKNOWN = "special:unknown";

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
  return ["publicroll", "gmroll", "blindroll"].includes(configured) ? configured : "publicroll";
}

function rollModeLabel(mode) {
  return getRollModeEntries(mode).find(entry => entry.key === mode)?.label ?? mode;
}

function effectLabel(effectId) {
  return t(`Restoration.Effects.${effectId}`);
}

function materialMarkup(material) {
  if (!material) return `<p class="csp-material-note">${t("Restoration.Dialog.NoMaterial")}</p>`;
  return `
    <div class="csp-material-note">
      <strong>${t("Restoration.Dialog.MaterialComponent")}</strong>
      <span>${tf("Restoration.Dialog.MaterialValue", {
        material: escapeHTML(material.name),
        cost: material.cost
      })}</span>
      <small>${t("Restoration.Dialog.MaterialInformational")}</small>
    </div>`;
}

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 640, onRender }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog", "restoration-plus-dialog"],
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
        callback: (_event, button) => new FormDataExtended(button.form).object
      }
    ],
    rejectClose: false,
    modal: false
  });
}

export async function promptRestorer(actor, item, ruleset, activityType) {
  const homebrew = ruleset === RULESETS.HOMEBREW;
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const slots = getSlotChoices(actor, item, {
    standardLabelKey: "Restoration.Dialog.SlotStandard",
    pactLabelKey: "Restoration.Dialog.SlotPact"
  });
  const slotOptions = slots.length
    ? selectOptions(slots)
    : `<option value="">${t("Dialog.NoSlotsAvailable")}</option>`;
  const minimumLevel = activityType === "greater" ? 5 : Math.max(2, Number(item.system?.level ?? 2));
  const proficiencyIncluded = usesHomebrewProficiency();
  const showAbjurer = homebrew && isAbjurerOptionEnabled();
  const rollFields = homebrew ? `
    <div class="form-group">
      <label>${t("Dialog.RollMode")}</label>
      <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
    </div>
    <div class="form-group stacked">
      <label>${t("Dialog.BonusDice")}</label>
      <div class="form-fields"><input type="text" name="bonusFormula" placeholder="1d4 + 1d8"></div>
      <p class="hint">${t("Dialog.BonusDiceHint")}</p>
    </div>
    ${showAbjurer ? `
      <div class="form-group stacked">
        <label class="checkbox"><input type="checkbox" name="abjurer" data-csp-abjurer> ${t("Dialog.Abjurer")}</label>
        <p class="hint">${t("Dialog.AbjurerHint")}</p>
      </div>` : ""}
    <div class="form-group stacked">
      <label class="checkbox"><input type="checkbox" name="disadvantage"> ${t("Dialog.DeclareDisadvantage")}</label>
      <p class="hint">${t("Dialog.DisadvantageHint")}</p>
    </div>` : "";

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(homebrew ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CastingMethod")}</label>
        <div class="form-fields"><select name="castingSource">
          <option value="spell">${t("Dialog.CastNormally")}</option>
          <option value="scroll">${t("Dialog.CastFromScroll")}</option>
        </select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.Ability")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Restoration.Dialog.Slot")}</label>
        <div class="form-fields"><select name="slotKey">${slotOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollLevel")}</label>
        <div class="form-fields"><select name="scrollLevel">${levelOptions(minimumLevel, minimumLevel)}</select></div>
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
      ${rollFields}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Restoration.Dialog.CasterTitle"),
    content,
    confirmLabel: t("Dialog.Continue"),
    onRender: activateAbjurerProficiency
  });
  if (!result) return null;

  const castingSource = String(result.castingSource) === "scroll" ? "scroll" : "spell";
  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (castingSource === "spell" && !selectedSlot) {
    ui.notifications.warn(t("Restoration.Notifications.NoSlots"));
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
    ? Math.min(9, Math.max(minimumLevel, Math.trunc(parseNumber(result.scrollLevel, minimumLevel))))
    : selectedSlot.level;

  return {
    ...abilityData,
    activityType,
    ruleset,
    castingSource,
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: item.name,
    slotKey: castingSource === "scroll" ? null : selectedSlot.key,
    slotLevel,
    slotLabel: castingSource === "scroll"
      ? tf("Dialog.ScrollCastingLevel", { level: slotLevel })
      : selectedSlot.label,
    rollMode: homebrew ? String(result.rollMode) : "publicroll",
    bonusFormula: homebrew ? normalizeBonusFormula(result.bonusFormula) : "",
    abjurer: showAbjurer && Boolean(result.abjurer),
    disadvantage: homebrew && Boolean(result.disadvantage)
  };
}

export async function promptRestorationEffect(restorer) {
  const effectIds = getRestorationEffectIds(restorer.activityType, restorer.slotLevel);
  const material = getRestorationMaterial(restorer.activityType, restorer.slotLevel);
  const options = effectIds.map((effectId, index) => `
    <label class="csp-restoration-option">
      <input type="radio" name="effectId" value="${effectId}"${index === 0 ? " checked" : ""}>
      <span>${escapeHTML(effectLabel(effectId))}</span>
    </label>`).join("");
  const canCheck = effectIds.some(effectId => restorationEffectNeedsCheck(restorer.activityType, effectId));
  const knowledge = canCheck ? `
    <div class="form-group stacked" data-csp-restoration-knowledge hidden>
      <label class="checkbox"><input type="checkbox" name="known"> ${t("Restoration.Dialog.KnowsCurse")}</label>
      <p class="hint">${t("Restoration.Dialog.KnowsCurseHint")}</p>
    </div>` : "";
  const onRender = (_event, dialog) => {
    const root = dialog?.element;
    const panel = root?.querySelector("[data-csp-restoration-knowledge]");
    const update = () => {
      const selected = root?.querySelector('input[name="effectId"]:checked')?.value;
      if (panel) panel.hidden = !restorationEffectNeedsCheck(restorer.activityType, selected);
    };
    root?.querySelectorAll('input[name="effectId"]').forEach(input => input.addEventListener("change", update));
    update();
  };

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(restorer.itemName)}</strong>
        <span>${tf("Restoration.Dialog.CastLevel", { level: restorer.slotLevel })}</span>
      </div>
      ${materialMarkup(material)}
      <fieldset class="csp-effect-card">
        <legend>${t("Restoration.Dialog.ChooseEffect")}</legend>
        <div class="csp-restoration-options">${options}</div>
      </fieldset>
      ${knowledge}
      <p class="hint">${t("Restoration.Dialog.ExclusiveTierHint")}</p>
    </div>`;
  const result = await waitForm({
    title: t("Restoration.Dialog.EffectTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM"),
    onRender
  });
  if (!result) return null;

  const effectId = effectIds.includes(String(result.effectId)) ? String(result.effectId) : effectIds[0];
  return {
    effectId,
    effectName: effectLabel(effectId),
    known: restorationEffectNeedsCheck(restorer.activityType, effectId) && Boolean(result.known),
    material
  };
}

export async function promptGMRestorationReview(restorer, selection) {
  const homebrew = restorer.ruleset === RULESETS.HOMEBREW;
  const effectIds = getRestorationEffectIds(restorer.activityType, restorer.slotLevel);
  const material = getRestorationMaterial(restorer.activityType, restorer.slotLevel);
  const targets = getSceneCasterEntries();
  let targetOptions = targets.map((entry, index) => ({
    key: entry.uuid,
    label: tf(entry.kind === "token" ? "Dialog.TargetTokenEntry" : "Dialog.TargetActorEntry", { name: entry.name }),
    name: entry.name,
    selected: index === 0
  }));
  targetOptions.push({
    key: SPECIAL_TARGET_UNKNOWN,
    label: tf("Dialog.TargetSpecialEntry", { name: t("Dialog.SpecialUnknown") }),
    name: t("Dialog.SpecialUnknown"),
    selected: !targets.length
  });
  targetOptions = searchableEntries(targetOptions);
  const effectOptions = effectIds.map(effectId => ({
    key: effectId,
    label: effectLabel(effectId),
    selected: effectId === selection.effectId
  }));
  const rarityOptions = ITEM_RARITIES.map(rarity => ({
    key: rarity.id,
    label: tf(`Restoration.Rarity.${rarity.id}`, { value: rarity.value }),
    selected: rarity.id === "common"
  }));
  const showAbjurer = homebrew && isAbjurerOptionEnabled();
  const specialMinimum = getSpecialMinimum("restorationSpecialMinimum");
  const scroll = restorer.castingSource === "scroll";
  const proficiencyIncluded = usesHomebrewProficiency();
  const checkFields = homebrew ? `
    <div class="form-group">
      <label>${scroll ? t("Dialog.ScrollAuthorModifier") : t("Dialog.AbilityModifier")}</label>
      <div class="form-fields"><input type="number" name="abilityMod" value="${restorer.abilityMod}" step="1"></div>
    </div>
    <div class="form-group">
      <label>${scroll ? t("Dialog.ScrollAuthorProficiency") : t("Dialog.Proficiency")}</label>
      <div class="form-fields"><input type="number" name="proficiency" value="${restorer.proficiency}" min="0" step="1"${scroll ? ` data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"` : ""}></div>
    </div>
    <div class="form-group stacked">
      <label>${t("Dialog.BonusDice")}</label>
      <div class="form-fields"><input type="text" name="bonusFormula" value="${escapeHTML(restorer.bonusFormula)}" placeholder="1d4 + 1d8"></div>
      <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
    </div>
    ${showAbjurer ? `
      <div class="form-group stacked">
        <label class="checkbox"><input type="checkbox" name="abjurer" data-csp-abjurer${restorer.abjurer ? " checked" : ""}> ${t("Dialog.GMConfirmAbjurer")}</label>
        <p class="hint">${t("Dialog.AbjurerHint")}</p>
      </div>` : ""}
    <div class="form-group stacked">
      <label class="checkbox"><input type="checkbox" name="specialSpellcaster"> ${t("Restoration.Dialog.SpecialSpellcaster")}</label>
      <p class="hint">${tf("Dialog.SpecialSpellcasterHint", { minimum: specialMinimum })}</p>
    </div>
    <div class="form-group stacked">
      <label class="checkbox"><input type="checkbox" name="disadvantage"${restorer.disadvantage ? " checked" : ""}> ${t("Restoration.Dialog.GMConfirmDisadvantage")}</label>
      <p class="hint">${t("Dialog.GMDisadvantageHint")}</p>
    </div>` : "";

  const content = `
    <div class="csp-form">
      <div class="csp-grid">
        <div class="csp-panel">
          <h3>${escapeHTML(restorer.itemName)}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(restorer.actorName)}</dd>
            <dt>${t("Dialog.CastingMethod")}</dt><dd>${scroll ? t("Dialog.CastFromScroll") : t("Dialog.CastNormally")}</dd>
            <dt>${t("Restoration.Dialog.Slot")}</dt><dd>${escapeHTML(restorer.slotLabel)}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(restorer.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("Restoration.Dialog.MaterialComponent")}</h3>
          ${materialMarkup(material)}
        </div>
      </div>
      <div class="form-group">
        <label>${t("Restoration.Dialog.Target")}</label>
        <div class="form-fields csp-target-search">
          <input type="search" data-csp-target-filter placeholder="${escapeHTML(t("Dialog.SearchTargetPlaceholder"))}" autocomplete="off">
          <select name="targetUuid" data-csp-target-select size="6" required>${selectOptions(targetOptions, "key", "searchLabel")}</select>
          <small data-csp-target-count></small>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Restoration.Dialog.Effect")}</label>
        <div class="form-fields"><select name="effectId" data-csp-restoration-effect>${selectOptions(effectOptions)}</select></div>
      </div>
      ${checkFields}
      <fieldset class="csp-effect-card" data-csp-restoration-curse>
        <legend>${t("Restoration.Effects.curse")}</legend>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseName")}</label><div class="form-fields"><input type="text" name="curseName" value="Unknown curse"></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseLevel")}</label><div class="form-fields"><select name="curseLevel">${levelOptions(1)}</select></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseModifier")}</label><div class="form-fields"><input type="number" name="curseMod" value="0" step="1"></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseProficiency")}</label><div class="form-fields"><input type="number" name="curseProf" value="0" min="0" step="1"></div></div>
      </fieldset>
      <fieldset class="csp-effect-card" data-csp-restoration-attunement>
        <legend>${t("Restoration.Effects.cursedAttunement")}</legend>
        <div class="form-group"><label>${t("Restoration.Dialog.ItemName")}</label><div class="form-fields"><input type="text" name="itemName" value="Unknown cursed item"></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseLevel")}</label><div class="form-fields"><select name="itemCurseLevel">${levelOptions(1)}</select></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.ItemRarity")}</label><div class="form-fields"><select name="rarity">${selectOptions(rarityOptions)}</select></div></div>
        <div class="form-group"><label>${t("Restoration.Dialog.CurseProficiency")}</label><div class="form-fields"><input type="number" name="itemProf" value="0" min="0" step="1"></div></div>
      </fieldset>
      <div class="form-group stacked" data-csp-restoration-known>
        <label class="checkbox"><input type="checkbox" name="known"${selection.known ? " checked" : ""}> ${t("Restoration.Dialog.GMConfirmKnown")}</label>
        <p class="hint">${t("Restoration.Dialog.KnowsCurseHint")}</p>
      </div>
      <div class="form-group" data-csp-restoration-defense-mode>
        <label>${t("Restoration.Dialog.DefenseRollMode")}</label>
        <div class="form-fields"><select name="defenseRollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      <p class="hint">${t("Restoration.Dialog.GMReviewHint")}</p>
    </div>`;

  const onRender = (event, dialog) => {
    activateTargetSearch(event, dialog);
    activateAbjurerProficiency(event, dialog);
    const root = dialog?.element;
    const effect = root?.querySelector("[data-csp-restoration-effect]");
    const cursePanel = root?.querySelector("[data-csp-restoration-curse]");
    const itemPanel = root?.querySelector("[data-csp-restoration-attunement]");
    const knownPanel = root?.querySelector("[data-csp-restoration-known]");
    const defenseMode = root?.querySelector("[data-csp-restoration-defense-mode]");
    const update = () => {
      const value = effect?.value;
      const curse = homebrew && value === RESTORATION_EFFECTS.CURSE;
      const item = homebrew && value === RESTORATION_EFFECTS.CURSED_ATTUNEMENT;
      if (cursePanel) cursePanel.hidden = !curse;
      if (itemPanel) itemPanel.hidden = !item;
      if (knownPanel) knownPanel.hidden = !(curse || item);
      if (defenseMode) defenseMode.hidden = !(curse || item);
    };
    effect?.addEventListener("change", update);
    update();
  };

  const result = await waitForm({
    title: t("Restoration.Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Restoration.Dialog.Resolve"),
    width: 760,
    onRender
  });
  if (!result) return null;

  const targetChoice = String(result.targetUuid ?? "");
  const selectedTarget = targetOptions.find(entry => entry.key === targetChoice);
  if (!selectedTarget) {
    ui.notifications.error(t("Notifications.SelectTargetSuggestion"));
    return null;
  }
  const target = targetChoice === SPECIAL_TARGET_UNKNOWN ? null : getActorFromUuidSync(targetChoice);
  if (targetChoice !== SPECIAL_TARGET_UNKNOWN && !target) {
    ui.notifications.error(t("Restoration.Notifications.TargetNotFound"));
    return null;
  }
  const effectId = effectIds.includes(String(result.effectId)) ? String(result.effectId) : selection.effectId;
  const checkRequired = restorationEffectNeedsCheck(restorer.activityType, effectId);
  const reviewedSelection = {
    effectId,
    effectName: effectLabel(effectId),
    known: checkRequired && Boolean(result.known),
    material,
    targetUuid: target ? targetChoice : "",
    targetName: target ? selectedTarget.name : t("Dialog.SpecialUnknown"),
    defenseUserId: game.user.id,
    defenseRollMode: checkRequired ? String(result.defenseRollMode) : "publicroll",
    curseName: String(result.curseName || "Unknown curse"),
    curseLevel: parseNumber(result.curseLevel, 1),
    curseMod: parseNumber(result.curseMod, 0),
    curseProf: parseNumber(result.curseProf, 0),
    itemName: String(result.itemName || "Unknown cursed item"),
    itemCurseLevel: parseNumber(result.itemCurseLevel, 1),
    rarity: String(result.rarity || "common"),
    itemProf: parseNumber(result.itemProf, 0)
  };

  return {
    restorer: {
      ...restorer,
      abilityMod: homebrew ? parseNumber(result.abilityMod, restorer.abilityMod) : restorer.abilityMod,
      proficiency: homebrew ? parseNumber(result.proficiency, restorer.proficiency) : restorer.proficiency,
      bonusFormula: homebrew ? normalizeBonusFormula(result.bonusFormula) : "",
      abjurer: showAbjurer && Boolean(result.abjurer),
      specialSpellcaster: homebrew && Boolean(result.specialSpellcaster),
      disadvantage: homebrew && Boolean(result.disadvantage)
    },
    selection: reviewedSelection
  };
}
