import { rollTraitsFields, readRollTraits } from "./roll-traits.js";
import { labelReviewSides } from "./review-labels.js";
import { ownedTargetPicker } from "./participants.js";
import { RULESETS } from "./config.js";
import {
  activateAbjurerProficiency,
  escapeHTML,
  getAbilityData,
  getAbilityEntries,
  getActorFromUuidSync,
  getDefaultAbility,
  getRollModeEntries,
  getSlotChoices,
  normalizeBonusFormula,
  parseNumber,
  t,
  tf,
  usesHomebrewProficiency
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

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 620, onRender }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog", "dispel-plus-dialog"],
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
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
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
  const slotOptions = slots.length
    ? selectOptions(slots)
    : `<option value="">${t("Dialog.NoSlotsAvailable")}</option>`;
  const proficiencyIncluded = usesHomebrewProficiency();

  const bonusField = `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceHint")}</p>
      </div>`;

  const content = `
    <div class="csp-form"${ruleset === RULESETS.HOMEBREW ? " data-csp-homebrew-casting" : ""}>
      <div class="form-group">
        <label>${t("Participants.CastingSpellName")}</label>
        <div class="form-fields"><input type="text" name="castingSpellName" value="${escapeHTML(item.name)}" required></div>
      </div>
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(ruleset === RULESETS.HOMEBREW ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CastingMethod")}</label>
        <div class="form-fields"><select name="castingSource" data-csp-casting-source-select>
          <option value="spell">${t("Dialog.CastNormally")}</option>
          <option value="scroll">${t("Dialog.CastFromScroll")}</option>
        </select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.Ability")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dispel.Dialog.DispelSlot")}</label>
        <div class="form-fields"><select name="slotKey" data-csp-casting-source="spell">${slotOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollLevel")}</label>
        <div class="form-fields"><select name="scrollLevel" data-csp-casting-source="scroll">${levelOptions(3, 3)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollAuthorModifier")}</label>
        <div class="form-fields"><input type="number" name="scrollAuthorMod" value="0" step="1" data-csp-casting-source="scroll"></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollAuthorProficiency")}</label>
        <div class="form-fields"><input type="number" name="scrollAuthorProf" value="0" min="0" step="1" data-csp-casting-source="scroll" data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"></div>
      </div>
      <p class="hint">${t("Dialog.ScrollCastingHint")}</p>
      <div class="form-group">
        <label>${t("Dialog.RollMode")}</label>
        <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
      </div>
      ${bonusField}
      <div class="form-group"><label>${t("Dispel.Dialog.EffectCount")}</label><div class="form-fields"><input type="number" name="effectCount" value="1" min="1" max="20" step="1"></div></div>
      ${ruleset === RULESETS.HOMEBREW ? `<div class="form-group stacked"><label class="checkbox"><input type="checkbox" name="knowsTargetSpell"> ${t("Dispel.Dialog.KnowsEffect")}</label><p class="hint">${t("Dispel.Dialog.InitialKnowledgeHint")}</p></div>` : ""}

      ${rollTraitsFields()}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dispel.Dialog.DispellerTitle"),
    content,
    confirmLabel: t("Dialog.SendToTarget"),
    onRender: activateAbjurerProficiency
  });
  if (!result) return null;

  const castingSource = String(result.castingSource) === "scroll" ? "scroll" : "spell";
  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (castingSource === "spell" && !selectedSlot) {
    ui.notifications.warn(t("Dispel.Notifications.NoSlots"));
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
    ...readRollTraits(result),
    ...abilityData,
    effectCount: Math.min(20, Math.max(1, Math.trunc(parseNumber(result.effectCount, 1)))),
    knowsTargetSpell: ruleset === RULESETS.HOMEBREW && Boolean(result.knowsTargetSpell),
    castingSource,
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: String(result.castingSpellName || item.name),
    slotKey: castingSource === "scroll" ? null : selectedSlot.key,
    slotLevel,
    slotLabel: castingSource === "scroll" ? tf("Dialog.ScrollCastingLevel", { level: slotLevel }) : selectedSlot.label,
    rollMode: String(result.rollMode),
    bonusFormula: normalizeBonusFormula(result.bonusFormula),

    ruleset
  };
}

export async function promptGMDispelEffect(index, count, targetType = "actor", participant = null) {
  const picker = participant ? ownedTargetPicker(participant.actorUuid, { allowSpecial: true, specialKinds: ["unknown", "object"] }) : null;
  const glyphTarget = targetType === "glyph";
  const sourceField = glyphTarget
    ? `
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields">
          <input type="hidden" name="sourceType" value="glyph">
          <strong>${t("Dialog.Glyph")}</strong>
        </div>
      </div>`
    : `
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields"><select name="sourceType">${sourceOptions()}</select></div>
      </div>`;
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${tf("Dispel.Dialog.EffectNumber", { index: index + 1, count })}</strong>
      </div>
      ${picker?.html ?? ""}
      <div class="form-group"><label>${t("Dispel.Dialog.DefenseRollMode")}</label><div class="form-fields"><select name="defenseRollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div></div>
      ${sourceField}
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
      ${rollTraitsFields({}, { passive: true })}
      <p class="hint">${t("Dispel.Dialog.SourceBaseHint")}</p>
    </div>`;

  const result = await waitForm({
    title: tf("Dispel.Dialog.GMEffectTitle", { index: index + 1, count }),
    content,
    confirmLabel: index + 1 === count ? t("Dialog.SendToGM") : t("Dialog.Continue"),
    onRender: picker?.render
  });
  if (!result) return null;

  const confirmed = picker ? picker.read(result.actorUuid) : null;
  if (picker && !confirmed) return null;
  return {
    ...readRollTraits(result),
    defenseRollMode: String(result.defenseRollMode || defaultRollMode()),
    targetActorUuid: confirmed?.actor ? confirmed.key : "",
    targetActorName: confirmed?.name ?? "",
    targetType: confirmed?.kind === "special" ? confirmed.key.slice(8) : "actor",
    sourceType: glyphTarget ? "glyph" : String(result.sourceType),
    spellName: String(result.spellName || t("Chat.UnknownSpell")),
    spellLevel: parseNumber(result.spellLevel, 0),
    casterMod: parseNumber(result.casterMod, 0),
    casterProf: parseNumber(result.casterProf, 0),
    known: false,
    bonusFormula: ""
  };
}

export async function promptGMDispelReview(dispeller, setup) {
  const homebrew = dispeller.ruleset === RULESETS.HOMEBREW;
  const glyphTarget = setup.targetType === "glyph";
  const dispellerUsesScroll = dispeller.castingSource === "scroll";
  const proficiencyIncluded = usesHomebrewProficiency();
  const effectRows = setup.effects.map((effect, index) => `
    <fieldset class="csp-effect-card">
      <legend>${t("Review.Target")} — ${tf("Dispel.Dialog.EffectNumber", { index: index + 1, count: setup.effects.length })}</legend>
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields">${glyphTarget
          ? `<input type="hidden" name="source${index}" value="glyph"><strong>${t("Dialog.Glyph")}</strong>`
          : `<select name="source${index}">${sourceOptions(effect.sourceType)}</select>`}</div>
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
      ${rollTraitsFields(effect, { prefix: `target${index}`, side: "Target", passive: true })}
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
          <h3>${t("Review.Initiator")} — ${t("Dispel.Dialog.DispelData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(dispeller.actorName)}</dd>
            <dt>${t("Dialog.CastingMethod")}</dt><dd>${dispellerUsesScroll ? t("Dialog.CastFromScroll") : t("Dialog.CastNormally")}</dd>
            <dt>${t("Dialog.Ability")}</dt><dd>${dispellerUsesScroll ? t("Dialog.ScrollAuthor") : escapeHTML(dispeller.ability.toUpperCase())}</dd>
            <dt>${t("Dialog.AbilityModifier")}</dt><dd>${dispeller.abilityMod >= 0 ? "+" : ""}${dispeller.abilityMod}</dd>
            <dt>${t("Dialog.Proficiency")}</dt><dd>${dispeller.proficiency >= 0 ? "+" : ""}${dispeller.proficiency}</dd>
            <dt>${t("Dispel.Dialog.DispelSlot")}</dt><dd>${dispeller.slotLevel}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(dispeller.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("Review.Target")} — ${t("Dispel.Dialog.TargetData")}</h3>
          <dl>
            <dt>${t("Dispel.Dialog.Target")}</dt><dd>${escapeHTML(setup.targetName)}</dd>
            <dt>${t("Dispel.Dialog.EffectCount")}</dt><dd>${setup.effects.length}</dd>
            <dt>${t("Dispel.Dialog.DefenseRollMode")}</dt><dd>${escapeHTML(rollModeLabel(setup.defenseRollMode))}</dd>
          </dl>
        </div>
      </div>
      <div class="form-group">
        <label>${dispellerUsesScroll ? t("Dialog.ScrollAuthorModifier") : t("Dialog.AbilityModifier")}</label>
        <div class="form-fields"><input type="number" name="dispellerAbilityMod" value="${dispeller.abilityMod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${dispellerUsesScroll ? t("Dialog.ScrollAuthorProficiency") : t("Dialog.Proficiency")}</label>
        <div class="form-fields"><input type="number" name="dispellerProficiency" value="${dispeller.proficiency}" min="0" step="1"${dispellerUsesScroll ? ` data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"` : ""}></div>
      </div>
      ${dispellerUsesScroll ? `
        <div class="form-group">
          <label>${t("Dialog.ScrollLevel")}</label>
          <div class="form-fields"><input type="number" name="dispellerScrollLevel" value="${dispeller.slotLevel}" min="3" max="9" step="1"></div>
        </div>` : ""}
      ${generalBonus}

      <h3>${t("Dispel.Dialog.EffectsToResolve")}</h3>
      ${effectRows}
      ${rollTraitsFields(dispeller, { prefix: "initiator", side: "Initiator" })}
      <p class="hint">${t("Dispel.Dialog.GMReviewHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dispel.Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Dialog.Roll"),
    width: 760,
    onRender: (event, dialog) => {
      activateAbjurerProficiency(event, dialog);
      labelReviewSides(dialog, "dispel");
    }
  });
  if (!result) return null;

  const reviewedEffects = setup.effects.map((effect, index) => ({
    ...effect,
    ...readRollTraits(result, `target${index}`, effect),
    sourceType: glyphTarget ? "glyph" : String(result[`source${index}`] || effect.sourceType),
    spellName: String(result[`name${index}`] || effect.spellName),
    spellLevel: parseNumber(result[`level${index}`], effect.spellLevel),
    casterMod: parseNumber(result[`mod${index}`], effect.casterMod),
    casterProf: parseNumber(result[`prof${index}`], effect.casterProf),
    known: homebrew && Boolean(result[`known${index}`]),
    bonusFormula: !homebrew ? normalizeBonusFormula(result[`effectBonus${index}`]) : ""
  }));
  const reviewedScrollLevel = Math.min(9, Math.max(3, Math.trunc(parseNumber(result.dispellerScrollLevel, dispeller.slotLevel))));

  return {
    dispeller: {
      ...dispeller,
      ...readRollTraits(result, "initiator", dispeller),
      abilityMod: parseNumber(result.dispellerAbilityMod, dispeller.abilityMod),
      proficiency: parseNumber(result.dispellerProficiency, dispeller.proficiency),
      slotLevel: dispellerUsesScroll ? reviewedScrollLevel : dispeller.slotLevel,
      slotLabel: dispellerUsesScroll
        ? tf("Dialog.ScrollCastingLevel", { level: reviewedScrollLevel })
        : dispeller.slotLabel,
      bonusFormula: homebrew ? normalizeBonusFormula(result.bonusFormula) : "",

    },
    setup: { ...setup, effects: reviewedEffects }
  };
}

/** The selected target supplies all source declarations before final GM review. */
export async function promptDispelTarget(dispeller) {
  const count = Math.min(20, Math.max(1, Math.trunc(Number(dispeller.effectCount) || 1)));
  const participant = dispeller.targetParticipant;
  const effects = [];
  let first;
  for (let index = 0; index < count; index += 1) {
    const effect = await promptGMDispelEffect(index, count, first?.targetType ?? "actor", {
      actorUuid: first?.targetActorUuid || (first ? `special:${first.targetType}` : participant?.actorUuid)
    });
    if (!effect) return null;
    first ??= effect;
    effects.push({ ...effect, known: Boolean(dispeller.knowsTargetSpell),
      bonusFormula: dispeller.ruleset === RULESETS.OFFICIAL_2014 ? dispeller.bonusFormula : "" });
  }
  return { targetUuid: first.targetActorUuid, targetName: first.targetActorName,
    targetType: first.targetType, effectCount: count, effects,
    defenseRollMode: first.defenseRollMode, defenseUserId: game.user.id };
}
