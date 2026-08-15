import { MODULE_ID, RULESETS } from "./config.js";
import {
  escapeHTML,
  getAbilityEntries,
  getDefaultAbility,
  getRollModeEntries,
  getSlotChoices,
  normalizeName,
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

function levelOptions(selected = 1) {
  return Array.from({ length: 9 }, (_, index) => index + 1)
    .map(level => `<option value="${level}"${level === Number(selected) ? " selected" : ""}>${level}</option>`)
    .join("");
}

function defaultRollMode() {
  const configured = game.settings.get("core", "rollMode");
  return ["publicroll", "gmroll", "blindroll"].includes(configured) ? configured : "publicroll";
}

function inventoryItems(actor) {
  const excluded = new Set(["spell", "class", "subclass", "background", "race", "species", "feat"]);
  return actor.items
    .filter(item => !excluded.has(item.type))
    .map(item => ({ uuid: item.uuid, name: item.name, type: item.type, document: item }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function allWorldItems() {
  const entries = [];
  const seen = new Set();
  const add = (item, source) => {
    if (!item?.uuid || item.type === "spell" || seen.has(item.uuid)) return;
    seen.add(item.uuid);
    entries.push({
      uuid: item.uuid,
      name: item.name,
      source,
      description: getItemDescription(item),
      img: item.img ?? "icons/svg/item-bag.svg"
    });
  };

  for (const item of game.items.contents) add(item, t("Identify.Dialog.WorldItem"));
  for (const actor of game.actors.contents) {
    for (const item of actor.items) add(item, tf("Identify.Dialog.ActorItem", { actor: actor.name }));
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name) || left.source.localeCompare(right.source));
}

function getItemDescription(item) {
  const description = item?.system?.description;
  if (typeof description === "string") return description;
  return String(description?.value ?? "");
}

function dragData(event) {
  try {
    const legacy = globalThis.TextEditor?.getDragEventData?.(event);
    if (legacy) return legacy;
  } catch (_error) {
    // Continue to the V14 implementation and plain-text fallback.
  }
  try {
    const implementation = foundry.applications?.ux?.TextEditor?.implementation;
    const current = implementation?.getDragEventData?.(event);
    if (current) return current;
  } catch (_error) {
    // Continue to the plain-text fallback.
  }
  try {
    return JSON.parse(event.dataTransfer?.getData("text/plain") || "{}");
  } catch (_error) {
    return {};
  }
}

async function droppedItem(event) {
  event.preventDefault();
  const data = dragData(event);
  const uuid = String(data.uuid ?? data.itemUuid ?? "");
  const document = uuid ? await fromUuid(uuid) : null;
  return document?.documentName === "Item" && document.type !== "spell" ? document : null;
}

async function waitForm({ title, content, confirmLabel = t("Dialog.Confirm"), width = 680, onRender }) {
  return DialogV2.wait({
    window: { title },
    position: { width },
    classes: ["counterspell-plus-dialog", "identify-plus-dialog"],
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
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      }
    ],
    rejectClose: false,
    modal: false
  });
}

function activateCasterForm(entries) {
  return (_event, dialog) => {
    const root = dialog?.element;
    const source = root?.querySelector("[data-csp-identify-source]");
    const sourceFields = root?.querySelectorAll("[data-csp-identify-source-field]") ?? [];
    const filter = root?.querySelector("[data-csp-identify-inventory-filter]");
    const select = root?.querySelector("[data-csp-identify-inventory]");
    const chosenUuid = root?.querySelector('input[name="subjectItemUuid"]');
    const manualName = root?.querySelector('input[name="subjectName"]');
    const count = root?.querySelector("[data-csp-identify-inventory-count]");
    const dropZone = root?.querySelector("[data-csp-identify-drop]");
    const itemByUuid = new Map(entries.map(entry => [entry.uuid, entry]));

    const updateSources = () => {
      for (const field of sourceFields) {
        const disabled = field.dataset.cspIdentifySourceField !== source?.value;
        field.disabled = disabled;
        const group = field.closest(".form-group");
        group?.classList.toggle("csp-field-disabled", disabled);
        group?.setAttribute("aria-disabled", String(disabled));
      }
    };

    const updateChoice = (uuid, name) => {
      if (chosenUuid) chosenUuid.value = uuid ?? "";
      if (manualName && name) manualName.value = name;
      if (dropZone) dropZone.querySelector("span").textContent = name || t("Identify.Dialog.DropInventoryHint");
    };

    const rebuild = () => {
      if (!select) return;
      const query = normalizeName(filter?.value);
      const previous = select.value;
      const matches = entries.filter(entry => normalizeName(`${entry.name} ${entry.type}`).includes(query));
      const fragment = document.createDocumentFragment();
      const manual = document.createElement("option");
      manual.value = "";
      manual.textContent = t("Identify.Dialog.ManualItem");
      fragment.append(manual);
      for (const entry of matches) {
        const option = document.createElement("option");
        option.value = entry.uuid;
        option.textContent = `${entry.name} (${entry.type})`;
        fragment.append(option);
      }
      select.replaceChildren(fragment);
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
      if (count) count.textContent = tf("Identify.Dialog.ItemsFound", { count: matches.length });
    };

    source?.addEventListener("change", updateSources);
    filter?.addEventListener("input", rebuild);
    select?.addEventListener("change", () => {
      const entry = itemByUuid.get(select.value);
      updateChoice(entry?.uuid ?? "", entry?.name ?? "");
    });
    manualName?.addEventListener("input", () => {
      const entry = itemByUuid.get(chosenUuid?.value);
      if (entry && normalizeName(entry.name) !== normalizeName(manualName.value)) {
        if (chosenUuid) chosenUuid.value = "";
        if (select) select.value = "";
      }
    });
    dropZone?.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone?.addEventListener("drop", async event => {
      dropZone.classList.remove("dragover");
      const item = await droppedItem(event);
      if (!item) {
        ui.notifications.warn(t("Identify.Notifications.InvalidDrop"));
        return;
      }
      updateChoice(item.uuid, item.name);
      if (select && [...select.options].some(option => option.value === item.uuid)) select.value = item.uuid;
    });
    rebuild();
    updateSources();
  };
}

export async function promptIdentifier(actor, item, ruleset) {
  const homebrew = ruleset === RULESETS.HOMEBREW;
  const entries = inventoryItems(actor);
  const slots = getSlotChoices(actor, item);
  const slotOptions = slots.length
    ? selectOptions(slots)
    : `<option value="">${t("Dialog.NoSlotsAvailable")}</option>`;
  const defaultSource = slots.length ? "spell" : "ritual";
  const defaultAbility = getDefaultAbility(actor);
  const abilities = getAbilityEntries(actor, defaultAbility);
  const minimumLevel = Math.max(1, Number(item.system?.level ?? 1));
  const initialInventory = [
    `<option value="">${t("Identify.Dialog.ManualItem")}</option>`,
    ...entries.map(entry => `<option value="${escapeHTML(entry.uuid)}">${escapeHTML(entry.name)} (${escapeHTML(entry.type)})</option>`)
  ].join("");
  const homebrewFields = homebrew ? `
    <div class="form-group">
      <label>${t("Dialog.Ability")}</label>
      <div class="form-fields"><select name="ability">${selectOptions(abilities)}</select></div>
    </div>
    <div class="form-group">
      <label>${t("Dialog.RollMode")}</label>
      <div class="form-fields"><select name="rollMode">${selectOptions(getRollModeEntries(defaultRollMode()))}</select></div>
    </div>
    <p class="hint">${t("Identify.Dialog.RiskRollHint")}</p>` : "";

  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(actor.name)}</strong>
        <span>${escapeHTML(homebrew ? t("Rules.Homebrew") : t("Rules.Official2014"))}</span>
      </div>
      <div class="form-group">
        <label>${t("Dialog.CastingMethod")}</label>
        <div class="form-fields"><select name="castingSource" data-csp-identify-source>
          <option value="spell"${defaultSource === "spell" ? " selected" : ""}>${t("Dialog.CastNormally")}</option>
          <option value="scroll">${t("Dialog.CastFromScroll")}</option>
          <option value="ritual"${defaultSource === "ritual" ? " selected" : ""}>${t("Identify.Dialog.CastAsRitual")}</option>
        </select></div>
      </div>
      <div class="form-group">
        <label>${t("Identify.Dialog.Slot")}</label>
        <div class="form-fields"><select name="slotKey" data-csp-identify-source-field="spell">${slotOptions}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Dialog.ScrollLevel")}</label>
        <div class="form-fields"><select name="scrollLevel" data-csp-identify-source-field="scroll">${levelOptions(minimumLevel)}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Identify.Dialog.RitualLevel")}</label>
        <div class="form-fields"><input type="number" value="${minimumLevel}" disabled data-csp-identify-source-field="ritual"></div>
      </div>
      ${homebrewFields}
      <hr>
      <div class="form-group stacked">
        <label>${t("Identify.Dialog.InventoryItem")}</label>
        <input type="search" data-csp-identify-inventory-filter placeholder="${t("Identify.Dialog.SearchInventory")}">
        <select data-csp-identify-inventory size="6">${initialInventory}</select>
        <small data-csp-identify-inventory-count>${tf("Identify.Dialog.ItemsFound", { count: entries.length })}</small>
      </div>
      <input type="hidden" name="subjectItemUuid" value="">
      <div class="form-group stacked">
        <label>${t("Identify.Dialog.TypedName")}</label>
        <input type="text" name="subjectName" autocomplete="off" placeholder="${t("Identify.Dialog.TypedNamePlaceholder")}">
        <p class="hint">${t("Identify.Dialog.TypedNameHint")}</p>
      </div>
      <div class="csp-identify-drop" data-csp-identify-drop>
        <i class="fa-solid fa-hand-sparkles"></i><span>${t("Identify.Dialog.DropInventoryHint")}</span>
      </div>
      <div class="csp-material-note">
        <strong>${t("Identify.Dialog.MaterialTitle")}</strong>
        <span>${t("Identify.Dialog.MaterialText")}</span>
      </div>
      <p class="hint">${t("Dialog.GMWillReview")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Identify.Dialog.CasterTitle"),
    content,
    confirmLabel: t("Dialog.Continue"),
    onRender: activateCasterForm(entries)
  });
  if (!result) return null;

  const castingSource = ["spell", "scroll", "ritual"].includes(result.castingSource)
    ? String(result.castingSource)
    : defaultSource;
  const selectedSlot = slots.find(slot => slot.key === result.slotKey);
  if (castingSource === "spell" && !selectedSlot) {
    ui.notifications.warn(t("Identify.Notifications.NoSlots"));
    return null;
  }
  const selectedItem = entries.find(entry => entry.uuid === result.subjectItemUuid);
  const subjectName = String(result.subjectName ?? selectedItem?.name ?? "").trim();
  if (!subjectName) {
    ui.notifications.warn(t("Identify.Notifications.ItemRequired"));
    return null;
  }
  const castLevel = castingSource === "spell"
    ? selectedSlot.level
    : castingSource === "scroll"
      ? Math.min(9, Math.max(minimumLevel, Math.trunc(parseNumber(result.scrollLevel, minimumLevel))))
      : minimumLevel;

  return {
    ruleset,
    actorUuid: actor.uuid,
    actorName: actor.name,
    spellUuid: item.uuid,
    spellName: item.name,
    userId: game.user.id,
    castingSource,
    slotKey: castingSource === "spell" ? selectedSlot.key : null,
    castLevel,
    subjectItemUuid: String(result.subjectItemUuid ?? ""),
    subjectName,
    ability: homebrew ? String(result.ability || defaultAbility) : defaultAbility,
    rollMode: homebrew ? String(result.rollMode || defaultRollMode()) : "gmroll"
  };
}

function activateGMItemPicker(entries, initialUuid) {
  return (_event, dialog) => {
    const root = dialog?.element;
    const filter = root?.querySelector("[data-csp-identify-world-filter]");
    const select = root?.querySelector("[data-csp-identify-world-select]");
    const hiddenUuid = root?.querySelector('input[name="actualItemUuid"]');
    const finalName = root?.querySelector('input[name="finalItemName"]');
    const count = root?.querySelector("[data-csp-identify-world-count]");
    const dropZone = root?.querySelector("[data-csp-identify-world-drop]");
    const preview = root?.querySelector("[data-csp-identify-preview]");
    const loadDescription = root?.querySelector("[data-csp-identify-load-description]");
    const revealDescription = root?.querySelector('textarea[name="revealDescription"]');
    const revealCurse = root?.querySelector('input[name="revealCurse"]');
    const curseGroup = root?.querySelector("[data-csp-identify-curse-group]");
    const itemByUuid = new Map(entries.map(entry => [entry.uuid, entry]));

    const selectedEntry = () => itemByUuid.get(hiddenUuid?.value);
    const updatePreview = entry => {
      if (revealDescription) revealDescription.required = Boolean(entry);
      if (!preview) return;
      if (!entry) {
        preview.innerHTML = `<p>${escapeHTML(t("Identify.Dialog.NoActualItem"))}</p>`;
        return;
      }
      preview.innerHTML = `
        <header><img src="${escapeHTML(entry.img)}" alt=""><div><strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(entry.source)}</small></div></header>
        <div class="csp-identify-preview-description">${entry.description || `<p>${escapeHTML(t("Identify.Dialog.NoStoredDescription"))}</p>`}</div>`;
    };
    const choose = entry => {
      if (hiddenUuid) hiddenUuid.value = entry?.uuid ?? "";
      if (entry && finalName) finalName.value = entry.name;
      if (dropZone) dropZone.querySelector("span").textContent = entry?.name ?? t("Identify.Dialog.DropWorldHint");
      if (select) select.value = entry?.uuid ?? "";
      updatePreview(entry);
    };
    const rebuild = () => {
      if (!select) return;
      const query = normalizeName(filter?.value);
      const previous = hiddenUuid?.value ?? "";
      const matches = entries.filter(entry => normalizeName(`${entry.name} ${entry.source}`).includes(query));
      const fragment = document.createDocumentFragment();
      const manual = document.createElement("option");
      manual.value = "";
      manual.textContent = t("Identify.Dialog.NoActualItem");
      fragment.append(manual);
      for (const entry of matches) {
        const option = document.createElement("option");
        option.value = entry.uuid;
        option.textContent = `${entry.name} — ${entry.source}`;
        fragment.append(option);
      }
      select.replaceChildren(fragment);
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
      if (count) count.textContent = tf("Identify.Dialog.ItemsFound", { count: matches.length });
    };
    const updateCurse = () => {
      if (curseGroup) curseGroup.hidden = !revealCurse?.checked;
    };

    filter?.addEventListener("input", rebuild);
    select?.addEventListener("change", () => choose(itemByUuid.get(select.value)));
    loadDescription?.addEventListener("click", () => {
      const entry = selectedEntry();
      if (!entry || !revealDescription) return;
      revealDescription.value = entry.description;
      ui.notifications.info(t("Identify.Notifications.DescriptionLoaded"));
    });
    revealCurse?.addEventListener("change", updateCurse);
    dropZone?.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone?.addEventListener("drop", async event => {
      dropZone.classList.remove("dragover");
      const item = await droppedItem(event);
      if (!item) {
        ui.notifications.warn(t("Identify.Notifications.InvalidDrop"));
        return;
      }
      let entry = itemByUuid.get(item.uuid);
      if (!entry) {
        entry = {
          uuid: item.uuid,
          name: item.name,
          source: t("Identify.Dialog.DroppedItem"),
          description: getItemDescription(item),
          img: item.img ?? "icons/svg/item-bag.svg"
        };
        entries.push(entry);
        itemByUuid.set(entry.uuid, entry);
      }
      choose(entry);
    });
    rebuild();
    choose(itemByUuid.get(initialUuid));
    updateCurse();
  };
}

export async function promptGMIdentifyReview(identifier) {
  const homebrew = identifier.ruleset === RULESETS.HOMEBREW;
  const entries = allWorldItems();
  const initialUuid = entries.some(entry => entry.uuid === identifier.subjectItemUuid)
    ? identifier.subjectItemUuid
    : "";
  const options = [
    `<option value="">${t("Identify.Dialog.NoActualItem")}</option>`,
    ...entries.map(entry => `<option value="${escapeHTML(entry.uuid)}"${entry.uuid === initialUuid ? " selected" : ""}>${escapeHTML(entry.name)} — ${escapeHTML(entry.source)}</option>`)
  ].join("");
  const riskFields = homebrew ? `
    <hr>
    <div class="form-group stacked csp-identify-risk">
      <label class="checkbox"><input type="checkbox" name="risk"> ${t("Identify.Dialog.Risk")}</label>
      <p class="hint">${tf("Identify.Dialog.RiskHint", { level: identifier.castLevel })}</p>
    </div>` : `
    <p class="hint">${t("Identify.Dialog.OfficialNoRisk")}</p>`;
  const content = `
    <div class="csp-form">
      <div class="csp-summary">
        <strong>${escapeHTML(identifier.actorName)}</strong>
        <span>${escapeHTML(identifier.subjectName)}</span>
      </div>
      <div class="csp-identify-cast-summary">
        <span>${tf("Identify.Dialog.CastLevelSummary", { level: identifier.castLevel })}</span>
        <span>${t(`Identify.Dialog.Source.${identifier.castingSource}`)}</span>
      </div>
      <div class="form-group stacked">
        <label>${t("Identify.Dialog.WorldSearch")}</label>
        <input type="search" data-csp-identify-world-filter placeholder="${t("Identify.Dialog.SearchWorld")}">
        <select data-csp-identify-world-select size="8">${options}</select>
        <small data-csp-identify-world-count>${tf("Identify.Dialog.ItemsFound", { count: entries.length })}</small>
      </div>
      <input type="hidden" name="actualItemUuid" value="${escapeHTML(initialUuid)}">
      <div class="csp-identify-drop" data-csp-identify-world-drop>
        <i class="fa-solid fa-hand-sparkles"></i><span>${escapeHTML(initialUuid ? identifier.subjectName : t("Identify.Dialog.DropWorldHint"))}</span>
      </div>
      <div class="form-group stacked">
        <label>${t("Identify.Dialog.FinalName")}</label>
        <input type="text" name="finalItemName" value="${escapeHTML(identifier.subjectName)}" required>
        <p class="hint">${t("Identify.Dialog.FinalNameHint")}</p>
      </div>
      <section class="csp-identify-preview" data-csp-identify-preview></section>
      <button type="button" data-csp-identify-load-description>
        <i class="fa-solid fa-file-import"></i> ${t("Identify.Dialog.LoadStoredDescription")}
      </button>
      <div class="form-group stacked">
        <label>${t("Identify.Dialog.RevealedDescription")}</label>
        <textarea name="revealDescription" rows="6"></textarea>
        <p class="hint">${t("Identify.Dialog.RevealedDescriptionHint")}</p>
      </div>
      <div class="form-group stacked csp-identify-curse-control">
        <label class="checkbox"><input type="checkbox" name="revealCurse"> ${t("Identify.Dialog.RevealCurse")}</label>
        <p class="hint">${t("Identify.Dialog.RevealCurseHint")}</p>
      </div>
      <div class="form-group stacked" data-csp-identify-curse-group hidden>
        <label>${t("Identify.Dialog.CurseDetails")}</label>
        <textarea name="curseDetails" rows="4"></textarea>
      </div>
      ${riskFields}
      <p class="hint">${t("Identify.Dialog.PrivateResultHint")}</p>
    </div>`;

  const result = await waitForm({
    title: t("Identify.Dialog.GMTitle"),
    content,
    confirmLabel: t("Identify.Dialog.Approve"),
    width: 760,
    onRender: activateGMItemPicker(entries, initialUuid)
  });
  if (!result) return null;

  const actualItemUuid = String(result.actualItemUuid ?? "");
  const actualItem = actualItemUuid ? await fromUuid(actualItemUuid) : null;
  const finalItemName = String(result.finalItemName ?? actualItem?.name ?? identifier.subjectName).trim();
  if (!finalItemName) {
    ui.notifications.warn(t("Identify.Notifications.ItemRequired"));
    return null;
  }
  const revealDescription = String(result.revealDescription ?? "").trim();
  if (actualItem?.documentName === "Item" && !revealDescription) {
    ui.notifications.warn(t("Identify.Notifications.DescriptionRequired"));
    return null;
  }
  return {
    ...identifier,
    actualItemUuid: actualItem?.documentName === "Item" ? actualItem.uuid : "",
    finalItemName,
    itemImg: actualItem?.img ?? "icons/svg/item-bag.svg",
    revealDescription,
    revealCurse: Boolean(result.revealCurse),
    curseDetails: Boolean(result.revealCurse) ? String(result.curseDetails ?? "").trim() : "",
    risk: homebrew && Boolean(result.risk)
  };
}
