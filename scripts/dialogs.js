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

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 560, onRender }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog"],
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

export async function promptCounterspeller(actor, item, ruleset) {
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const slots = getSlotChoices(actor, item);
  const slotOptions = slots.length
    ? selectOptions(slots)
    : `<option value="">${t("Dialog.NoSlotsAvailable")}</option>`;

  const rollMode = defaultRollMode();
  const proficiencyIncluded = usesHomebrewProficiency();
  const knowledgeField = ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="knowsTargetSpell">
          ${t("Dialog.KnowsTargetSpell")}
        </label>
        <p class="hint">${t("Dialog.KnowsTargetSpellHint")}</p>
      </div>`
    : "";

  const content = `
    <div class="csp-form"${ruleset === RULESETS.HOMEBREW ? " data-csp-homebrew-casting" : ""}>
      <div class="form-group">
        <label>${t("Participants.CastingSpellName")}</label>
        <div class="form-fields"><input type="text" name="castingSpellName" value="${escapeHTML(item.name)}" required></div>
      </div>
      <div class="form-group">
        <label>${t("Casting.TargetSpellName")}</label>
        <div class="form-fields"><input type="text" name="targetSpellName" placeholder="Fireball"></div>
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
        <div class="form-fields">
          <select name="ability">${selectOptions(abilities)}</select>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CounterspellSlot")}</label>
        <div class="form-fields">
          <select name="slotKey" data-csp-casting-source="spell">${slotOptions}</select>
        </div>
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
        <div class="form-fields">
          <select name="rollMode">${selectOptions(getRollModeEntries(rollMode))}</select>
        </div>
      </div>
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceHint")}</p>
      </div>
      ${knowledgeField}

      ${rollTraitsFields()}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.CounterspellerTitle"),
    content,
    confirmLabel: t("Dialog.SendToTarget"),
    onRender: activateAbjurerProficiency
  });
  if (!result) return null;

  const castingSource = String(result.castingSource) === "scroll" ? "scroll" : "spell";
  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (castingSource === "spell" && !selectedSlot) {
    ui.notifications.warn(t("Notifications.NoSlots"));
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
    castingSource,
    slotKey: castingSource === "scroll" ? null : selectedSlot.key,
    slotLevel,
    slotLabel: castingSource === "scroll" ? tf("Dialog.ScrollCastingLevel", { level: slotLevel }) : selectedSlot.label,
    rollMode: String(result.rollMode),
    bonusFormula: normalizeBonusFormula(result.bonusFormula),
    knowsTargetSpell: ruleset === RULESETS.HOMEBREW && Boolean(result.knowsTargetSpell),

    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: String(result.castingSpellName || item.name),
    targetSpellName: String(result.targetSpellName || ""),
    ruleset
  };
}

export async function promptTargetPlayer(target) {
  const picker = ownedTargetPicker(target.actorUuid, { allowSpecial: true });
  const actor = picker.entries.find(entry => entry.key === target.actorUuid)?.actor
    ?? picker.entries.find(entry => entry.actor)?.actor;
  if (!picker.entries.length) {
    ui.notifications.warn(t("Casting.NoActor"));
    return null;
  }
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const rollMode = target.rollMode ?? defaultRollMode();
  const bonusField = target.ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label>${t("Dialog.BonusDice")}</label>
        <div class="form-fields"><input type="text" name="bonusFormula" value="${escapeHTML(target.bonusFormula)}" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceHint")}</p>
      </div>`
    : "";
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(target.actorUuid ? (picker.entries.find(entry => entry.key === target.actorUuid)?.name ?? "") : t("Participants.ConfirmCharacter"))}</strong>
        <span>${t("Dialog.YouAreCountered")}</span>
      </div>
      ${picker.html}
      <div class="form-group">
        <label>${t("Dialog.SpellName")}</label>
        <div class="form-fields"><input type="text" name="spellName" value="${escapeHTML(target.spellName)}" required></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SpellSlotLevel")}</label>
        <div class="form-fields"><select name="spellLevel">${levelOptions(target.spellLevel)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.Ability")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.RollMode")}</label>
        <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(rollMode))}</select></div>
      </div>
      <div class="form-group"><label>${t("Dialog.SourceType")}</label><div class="form-fields">
        <select name="sourceType"><option value="spell">${t("Dialog.NormalSpell")}</option><option value="scroll">${t("Dialog.Scroll")}</option><option value="glyph">${t("Dialog.Glyph")}</option></select>
      </div></div>
      <fieldset><legend>${t("Dialog.ManualCasterCreator")}</legend>
        <div class="form-group"><label>${t("Dialog.CreatorModifier")}</label><div class="form-fields"><input type="number" name="creatorMod" value="0" step="1"></div></div>
        <div class="form-group"><label>${t("Dialog.CreatorProficiency")}</label><div class="form-fields"><input type="number" name="creatorProf" value="0" min="0" step="1"></div></div>
      </fieldset>
      ${bonusField}

      ${rollTraitsFields(target)}
      <p class="hint">${t("Dialog.PlayerDataHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.TargetPlayerTitle"),
    content,
    confirmLabel: t("Dialog.SendToInitiator"),
    onRender: (event, dialog) => {
      picker.render(event, dialog);
      const root = dialog.element;
      const select = root.querySelector('[name="actorUuid"]');
      const ability = root.querySelector('[name="ability"]');
      const update = () => {
        const entry = picker.entries.find(entry => entry.key === select.value);
        if (entry?.actor) ability.innerHTML = selectOptions(getAbilityEntries(entry.actor, getDefaultAbility(entry.actor)));
        if (select.value === "special:glyph") root.querySelector('[name="sourceType"]').value = "glyph";
      };
      select?.addEventListener("change", update);
      update();
    }
  });
  if (!result) return null;

  const selected = picker.read(result.actorUuid);
  if (!selected) return null;
  const selectedActor = selected.actor;
  const sourceType = selected.key === "special:glyph" ? "glyph" : String(result.sourceType || target.sourceType || "spell");
  const ability = String(result.ability || getDefaultAbility(selectedActor));
  return {
    ...target,
    ...readRollTraits(result, "", target),
    ...getAbilityData(selectedActor, ability),
    actorUuid: selectedActor ? selected.key : "",
    actorName: selected.name,
    targetType: selected.kind === "special" ? selected.key.slice(8) : "actor",
    ownerUserId: game.user.id,
    sourceType,
    creatorMod: parseNumber(result.creatorMod, 0),
    creatorProf: parseNumber(result.creatorProf, 0),
    ...(!selectedActor ? { abilityMod: parseNumber(result.creatorMod, 0), proficiency: parseNumber(result.creatorProf, 0) } : {}),
    spellName: String(result.spellName || target.spellName || t("Chat.UnknownSpell")),
    spellLevel: parseNumber(result.spellLevel, target.spellLevel),
    rollMode: String(result.rollMode),
    bonusFormula: target.ruleset === RULESETS.HOMEBREW ? normalizeBonusFormula(result.bonusFormula) : "",
    rollUserId: game.user.id,

  };
}

export async function promptGMReview(counter, target) {
  const isScroll = target.sourceType === "scroll";
  const isGlyph = target.sourceType === "glyph";
  const isFixedSource = isScroll || isGlyph;
  const sourceLabel = isScroll
    ? t("Dialog.Scroll")
    : isGlyph
      ? t("Dialog.Glyph")
      : t("Dialog.NormalSpell");
  const mod = isFixedSource ? target.creatorMod : target.abilityMod;
  const prof = isFixedSource ? target.creatorProf : target.proficiency;
  const proficiencyIncluded = usesHomebrewProficiency();
  const knowledgeField = counter.ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="knowsTargetSpell"${counter.knowsTargetSpell ? " checked" : ""}>
          ${t("Dialog.GMConfirmKnowledge")}
        </label>
        <p class="hint">${t("Dialog.GMConfirmKnowledgeHint")}</p>
      </div>`
    : "";
  const counterUsesScroll = counter.castingSource === "scroll";

  const content = `
    <div class="csp-form">
      <div class="csp-grid">
        <div class="csp-panel">
          <h3>${t("Review.Initiator")} — ${t("Dialog.CounterspellData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(counter.actorName)}</dd>
            <dt>${t("Dialog.CastingMethod")}</dt><dd>${counterUsesScroll ? t("Dialog.CastFromScroll") : t("Dialog.CastNormally")}</dd>
            <dt>${t("Dialog.AbilityModifier")}</dt><dd>${counter.abilityMod >= 0 ? "+" : ""}${counter.abilityMod}</dd>
            <dt>${t("Dialog.Proficiency")}</dt><dd>${counter.proficiency >= 0 ? "+" : ""}${counter.proficiency}</dd>
            <dt>${t("Dialog.SlotLevel")}</dt><dd>${counter.slotLevel}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(counter.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("Review.Target")} — ${t("Dialog.TargetData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(target.actorName)}</dd>
            <dt>${t("Dialog.SourceType")}</dt><dd>${escapeHTML(sourceLabel)}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(target.rollMode))}</dd>
          </dl>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CounterRollMode")}</label>
        <div class="form-fields"><select name="counterRollMode">${selectOptions(getRollModeEntries(counter.rollMode))}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.TargetRollMode")}</label>
        <div class="form-fields"><select name="targetRollMode">${selectOptions(getRollModeEntries(target.rollMode))}</select></div>
      </div>
      <div class="form-group">
        <label>${counterUsesScroll ? t("Dialog.ScrollAuthorModifier") : t("Dialog.AbilityModifier")}</label>
        <div class="form-fields"><input type="number" name="counterAbilityMod" value="${counter.abilityMod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${counterUsesScroll ? t("Dialog.ScrollAuthorProficiency") : t("Dialog.Proficiency")}</label>
        <div class="form-fields"><input type="number" name="counterProficiency" value="${counter.proficiency}" min="0" step="1"${counterUsesScroll ? ` data-csp-scroll-author-prof data-base-proficiency="${proficiencyIncluded}"` : ""}></div>
      </div>
      ${counterUsesScroll ? `
        <div class="form-group">
          <label>${t("Dialog.ScrollLevel")}</label>
          <div class="form-fields"><input type="number" name="counterScrollLevel" value="${counter.slotLevel}" min="3" max="9" step="1"></div>
        </div>` : ""}
      <div class="form-group">
        <label>${t("Dialog.SpellName")}</label>
        <div class="form-fields"><input type="text" name="spellName" value="${escapeHTML(target.spellName)}" required></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SpellSlotLevel")}</label>
        <div class="form-fields"><select name="spellLevel">${levelOptions(target.spellLevel)}</select></div>
      </div>
      <div class="form-group">
        <label>${isFixedSource ? t("Dialog.CreatorModifier") : t("Dialog.AbilityModifier")}</label>
        <div class="form-fields"><input type="number" name="targetMod" value="${mod}" step="1"></div>
      </div>
      <div class="form-group">
        <label>${isFixedSource ? t("Dialog.CreatorProficiency") : t("Dialog.Proficiency")}</label>
        <div class="form-fields"><input type="number" name="targetProf" value="${prof}" min="0" step="1"></div>
      </div>
      <div class="form-group stacked">
        <label>${t("Dialog.CounterBonusDice")}</label>
        <div class="form-fields"><input type="text" name="counterBonusFormula" value="${escapeHTML(counter.bonusFormula)}" placeholder="1d4 + 1d8"></div>
        <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
      </div>
      ${counter.ruleset === RULESETS.HOMEBREW && !isFixedSource ? `
        <div class="form-group stacked">
          <label>${t("Dialog.TargetBonusDice")}</label>
          <div class="form-fields"><input type="text" name="targetBonusFormula" value="${escapeHTML(target.bonusFormula)}" placeholder="1d4 + 1d8"></div>
          <p class="hint">${t("Dialog.BonusDiceGMHint")}</p>
        </div>` : ""}
      ${knowledgeField}

      ${rollTraitsFields(counter, { prefix: "initiator", side: "Initiator" })}
      ${rollTraitsFields(target, { prefix: "target", side: "Target", passive: isFixedSource || counter.ruleset !== RULESETS.HOMEBREW })}
      <p class="hint">${t("Dialog.GMReviewHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Dialog.Roll"),
    onRender: (event, dialog) => {
      activateAbjurerProficiency(event, dialog);
      labelReviewSides(dialog, "counterspell");
    }
  });
  if (!result) return null;

  const reviewed = {
    ...target,
    ...readRollTraits(result, "target", target),
    rollMode: String(result.targetRollMode || target.rollMode),
    spellName: String(result.spellName || target.spellName),
    spellLevel: parseNumber(result.spellLevel, target.spellLevel)
  };
  if (isFixedSource) {
    reviewed.creatorMod = parseNumber(result.targetMod, target.creatorMod);
    reviewed.creatorProf = parseNumber(result.targetProf, target.creatorProf);
  } else {
    reviewed.abilityMod = parseNumber(result.targetMod, target.abilityMod);
    reviewed.proficiency = parseNumber(result.targetProf, target.proficiency);
    reviewed.bonusFormula = normalizeBonusFormula(result.targetBonusFormula);
  }
  const reviewedCounterScrollLevel = Math.min(9, Math.max(3, Math.trunc(parseNumber(result.counterScrollLevel, counter.slotLevel))));
  const reviewedCounter = {
    ...counter,
    ...readRollTraits(result, "initiator", counter),
    rollMode: String(result.counterRollMode || counter.rollMode),
    abilityMod: parseNumber(result.counterAbilityMod, counter.abilityMod),
    proficiency: parseNumber(result.counterProficiency, counter.proficiency),
    slotLevel: counterUsesScroll ? reviewedCounterScrollLevel : counter.slotLevel,
    slotLabel: counterUsesScroll
      ? tf("Dialog.ScrollCastingLevel", { level: reviewedCounterScrollLevel })
      : counter.slotLabel,
    bonusFormula: normalizeBonusFormula(result.counterBonusFormula),

    knowsTargetSpell: counter.ruleset === RULESETS.HOMEBREW && Boolean(result.knowsTargetSpell),

  };
  return { counter: reviewedCounter, target: reviewed };
}
