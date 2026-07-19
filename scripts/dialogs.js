import { RULESETS } from "./config.js";
import {
  escapeHTML,
  getAbilityData,
  getAbilityEntries,
  getActiveOwner,
  getActorFromUuidSync,
  getDefaultAbility,
  getRollModeEntries,
  getSceneCasterEntries,
  getSlotChoices,
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

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 560 }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog"],
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

export async function promptCounterspeller(actor, item, ruleset) {
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const slots = getSlotChoices(actor, item);

  if (!slots.length) {
    ui.notifications.warn(t("Notifications.NoSlots"));
    return null;
  }

  const rollMode = defaultRollMode();
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
  const disadvantageField = `
    <div class="form-group stacked">
      <label class="checkbox">
        <input type="checkbox" name="disadvantage">
        ${t("Dialog.DeclareDisadvantage")}
      </label>
      <p class="hint">${t("Dialog.DisadvantageHint")}</p>
    </div>`;

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(ruleset === RULESETS.HOMEBREW ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
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
          <select name="slotKey">${selectOptions(slots)}</select>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.RollMode")}</label>
        <div class="form-fields">
          <select name="rollMode">${selectOptions(getRollModeEntries(rollMode))}</select>
        </div>
      </div>
      ${knowledgeField}
      ${disadvantageField}
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.CounterspellerTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM")
  });
  if (!result) return null;

  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (!selectedSlot) return null;
  const ability = String(result.ability);

  return {
    ...getAbilityData(actor, ability),
    slotKey: selectedSlot.key,
    slotLevel: selectedSlot.level,
    slotLabel: selectedSlot.label,
    rollMode: String(result.rollMode),
    knowsTargetSpell: ruleset === RULESETS.HOMEBREW && Boolean(result.knowsTargetSpell),
    disadvantage: Boolean(result.disadvantage),
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemUuid: item.uuid,
    itemName: item.name,
    ruleset
  };
}

export async function promptGMTarget(counter) {
  const casters = getSceneCasterEntries();
  if (!casters.length) {
    ui.notifications.warn(t("Notifications.NoCasters"));
    return null;
  }

  const genericActor = casters[0].actor;
  const abilities = getAbilityEntries(genericActor, getDefaultAbility(genericActor));
  const targetRollMode = defaultRollMode();
  const targetDisadvantageField = counter.ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="disadvantage">
          ${t("Dialog.GMTargetDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.GMTargetDisadvantageHint")}</p>
      </div>`
    : "";
  const casterOptions = casters.map((entry, index) => ({
    key: entry.uuid,
    label: entry.name,
    selected: index === 0
  }));

  const content = `
    <div class="csp-form">
      <div class="csp-panel">
        <h3>${t("Dialog.CounterspellData")}</h3>
        <dl>
          <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(counter.actorName)}</dd>
          <dt>${t("Dialog.Ability")}</dt><dd>${escapeHTML(counter.ability.toUpperCase())} (${counter.abilityMod >= 0 ? "+" : ""}${counter.abilityMod})</dd>
          <dt>${t("Dialog.Proficiency")}</dt><dd>${counter.proficiency >= 0 ? "+" : ""}${counter.proficiency}</dd>
          <dt>${t("Dialog.CounterspellSlot")}</dt><dd>${escapeHTML(counter.slotLabel)}</dd>
        </dl>
      </div>
      <div class="form-group">
        <label>${t("Dialog.TargetCaster")}</label>
        <div class="form-fields"><select name="actorUuid">${selectOptions(casterOptions)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SourceType")}</label>
        <div class="form-fields">
          <select name="sourceType">
            <option value="spell">${t("Dialog.NormalSpell")}</option>
            <option value="scroll">${t("Dialog.Scroll")}</option>
            <option value="glyph">${t("Dialog.Glyph")}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SpellName")}</label>
        <div class="form-fields"><input type="text" name="spellName" placeholder="Fireball" required></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.SpellSlotLevel")}</label>
        <div class="form-fields"><select name="spellLevel">${levelOptions(3)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.TargetAbility")}</label>
        <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.TargetRollMode")}</label>
        <div class="form-fields"><select name="targetRollMode">${selectOptions(getRollModeEntries(targetRollMode))}</select></div>
      </div>
      ${targetDisadvantageField}
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="askOwner" checked>
          ${t("Dialog.AskOwner")}
        </label>
        <p class="hint">${t("Dialog.AskOwnerHint")}</p>
      </div>
      <fieldset>
        <legend>${t("Dialog.ScrollCreator")}</legend>
        <div class="form-group">
          <label>${t("Dialog.CreatorModifier")}</label>
          <div class="form-fields"><input type="number" name="creatorMod" value="0" step="1"></div>
        </div>
        <div class="form-group">
          <label>${t("Dialog.CreatorProficiency")}</label>
          <div class="form-fields"><input type="number" name="creatorProf" value="0" min="0" step="1"></div>
        </div>
      </fieldset>
      <p class="hint">${t("Dialog.ScrollHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.GMTargetTitle"),
    content,
    confirmLabel: t("Dialog.Continue")
  });
  if (!result) return null;

  const actor = getActorFromUuidSync(result.actorUuid);
  if (!actor) {
    ui.notifications.error(t("Notifications.CasterNotFound"));
    return null;
  }

  const owner = getActiveOwner(actor);
  const ability = String(result.ability);
  const computed = getAbilityData(actor, ability);

  return {
    actorUuid: String(result.actorUuid),
    actorName: actor.name,
    ownerUserId: owner?.id ?? null,
    askOwner: Boolean(result.askOwner) && Boolean(owner),
    sourceType: String(result.sourceType),
    spellName: String(result.spellName || t("Chat.UnknownSpell")),
    spellLevel: parseNumber(result.spellLevel, 0),
    ability,
    abilityMod: computed.abilityMod,
    proficiency: computed.proficiency,
    creatorMod: parseNumber(result.creatorMod, 0),
    creatorProf: parseNumber(result.creatorProf, 0),
    rollMode: String(result.targetRollMode),
    rollUserId: game.user.id,
    ruleset: counter.ruleset,
    disadvantage: counter.ruleset === RULESETS.HOMEBREW && Boolean(result.disadvantage)
  };
}

export async function promptTargetPlayer(target) {
  const actor = getActorFromUuidSync(target.actorUuid);
  if (!actor) {
    ui.notifications.error(t("Notifications.CasterNotFound"));
    return null;
  }

  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const rollMode = defaultRollMode();
  const disadvantageField = target.ruleset === RULESETS.HOMEBREW
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="disadvantage"${target.disadvantage ? " checked" : ""}>
          ${t("Dialog.DeclareDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.DisadvantageHint")}</p>
      </div>`
    : "";
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${t("Dialog.YouAreCountered")}</span>
      </div>
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
      ${disadvantageField}
      <p class="hint">${t("Dialog.PlayerDataHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.TargetPlayerTitle"),
    content,
    confirmLabel: t("Dialog.SendToGM")
  });
  if (!result) return null;

  const ability = String(result.ability);
  return {
    ...target,
    ...getAbilityData(actor, ability),
    spellName: String(result.spellName || target.spellName),
    spellLevel: parseNumber(result.spellLevel, target.spellLevel),
    rollMode: String(result.rollMode),
    rollUserId: game.user.id,
    disadvantage: target.ruleset === RULESETS.HOMEBREW && Boolean(result.disadvantage)
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
  const counterDisadvantageField = `
    <div class="form-group stacked">
      <label class="checkbox">
        <input type="checkbox" name="counterDisadvantage"${counter.disadvantage ? " checked" : ""}>
        ${t("Dialog.GMConfirmCounterDisadvantage")}
      </label>
      <p class="hint">${t("Dialog.GMDisadvantageHint")}</p>
    </div>`;
  const targetDisadvantageField = counter.ruleset === RULESETS.HOMEBREW && !isFixedSource
    ? `
      <div class="form-group stacked">
        <label class="checkbox">
          <input type="checkbox" name="targetDisadvantage"${target.disadvantage ? " checked" : ""}>
          ${t("Dialog.GMConfirmTargetDisadvantage")}
        </label>
        <p class="hint">${t("Dialog.GMDisadvantageHint")}</p>
      </div>`
    : "";

  const content = `
    <div class="csp-form">
      <div class="csp-grid">
        <div class="csp-panel">
          <h3>${t("Dialog.CounterspellData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(counter.actorName)}</dd>
            <dt>${t("Dialog.AbilityModifier")}</dt><dd>${counter.abilityMod >= 0 ? "+" : ""}${counter.abilityMod}</dd>
            <dt>${t("Dialog.Proficiency")}</dt><dd>${counter.proficiency >= 0 ? "+" : ""}${counter.proficiency}</dd>
            <dt>${t("Dialog.SlotLevel")}</dt><dd>${counter.slotLevel}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(counter.rollMode))}</dd>
          </dl>
        </div>
        <div class="csp-panel">
          <h3>${t("Dialog.TargetData")}</h3>
          <dl>
            <dt>${t("Dialog.Caster")}</dt><dd>${escapeHTML(target.actorName)}</dd>
            <dt>${t("Dialog.SourceType")}</dt><dd>${escapeHTML(sourceLabel)}</dd>
            <dt>${t("Dialog.RollMode")}</dt><dd>${escapeHTML(rollModeLabel(target.rollMode))}</dd>
          </dl>
        </div>
      </div>
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
      ${knowledgeField}
      ${counterDisadvantageField}
      ${targetDisadvantageField}
      <p class="hint">${t("Dialog.GMReviewHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Dialog.GMReviewTitle"),
    content,
    confirmLabel: t("Dialog.Roll")
  });
  if (!result) return null;

  const reviewed = {
    ...target,
    spellName: String(result.spellName || target.spellName),
    spellLevel: parseNumber(result.spellLevel, target.spellLevel)
  };
  if (isFixedSource) {
    reviewed.creatorMod = parseNumber(result.targetMod, target.creatorMod);
    reviewed.creatorProf = parseNumber(result.targetProf, target.creatorProf);
  } else {
    reviewed.abilityMod = parseNumber(result.targetMod, target.abilityMod);
    reviewed.proficiency = parseNumber(result.targetProf, target.proficiency);
  }
  reviewed.disadvantage = counter.ruleset === RULESETS.HOMEBREW
    && !isFixedSource
    && Boolean(result.targetDisadvantage);
  const reviewedCounter = {
    ...counter,
    knowsTargetSpell: counter.ruleset === RULESETS.HOMEBREW && Boolean(result.knowsTargetSpell),
    disadvantage: Boolean(result.counterDisadvantage)
  };
  return { counter: reviewedCounter, target: reviewed };
}
