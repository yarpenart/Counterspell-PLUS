import { escapeHTML, getPrimaryGM, normalizeName, t, tf } from "./utils.js";

export function ownsActor(actor, user = game.user) {
  return Boolean(actor && user && (user.isGM
    || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)));
}

/** Filter documents before creating any labels or HTML, including on GM clients. */
export function participantEntries(owner, observer = game.user) {
  const entries = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!ownsActor(token.actor, owner)) continue;
    if (!observer.isGM && (token.visible === false || token.document.hidden)) continue;
    entries.push({ key: token.document.uuid, name: token.name, actor: token.actor, kind: "token" });
  }
  for (const actor of game.actors) {
    if (!ownsActor(actor, owner) || !ownsActor(actor, observer)) continue;
    entries.push({ key: actor.uuid, name: actor.name, actor, kind: "actor" });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function actorOptions(entries, selected = "", optional = true) {
  const placeholder = optional ? t("Participants.ChooseLater") : t("Participants.ChooseCharacter");
  return `<option value=""${!entries.some(e => e.key === selected) ? " selected" : ""}>${escapeHTML(placeholder)}</option>`
    + entries.map(entry => `<option value="${escapeHTML(entry.key)}"${entry.key === selected ? " selected" : ""}>${escapeHTML(t(entry.kind === "token" ? "Casting.Token" : entry.kind === "special" ? "Participants.Special" : "Casting.Actor"))} - ${escapeHTML(entry.name)}</option>`).join("");
}

function specialEntries(kinds) {
  return kinds.map(kind => ({ key: `special:${kind}`, name: t(kind === "object" ? "Dialog.SpecialObject" : "Dialog.SpecialUnknown"), kind: "special" }));
}

export function ownedTargetPicker(suggestedUuid = "", { allowSpecial = false, specialKinds = ["unknown"] } = {}) {
  const entries = participantEntries(game.user);
  if (allowSpecial) entries.push(...specialEntries(specialKinds));
  return {
    entries,
    html: `<div class="form-group stacked"><label>${t("Participants.ConfirmCharacter")}</label>
      <div class="form-fields csp-target-search">
        <input type="search" data-csp-participant-search placeholder="${escapeHTML(t("Dialog.SearchTargetPlaceholder"))}" autocomplete="off">
        <select name="actorUuid" data-csp-participant-actor size="6" required>${actorOptions(entries, suggestedUuid, false)}</select>
        <small data-csp-participant-count></small>
      </div></div>`,
    render: (_event, dialog) => activateParticipantSearch(dialog, entries, suggestedUuid, false),
    read(uuid) {
      const entry = entries.find(entry => entry.key === String(uuid ?? ""));
      if (!entry || (entry.actor && !ownsActor(entry.actor))) {
        ui.notifications.warn(t("Participants.InvalidCharacter"));
        return null;
      }
      return entry;
    }
  };
}

function activateParticipantSearch(dialog, entries, suggestedUuid, optional, onChange) {
  const root = dialog.element;
  const search = root.querySelector('[data-csp-participant-search]');
  const select = root.querySelector('[data-csp-participant-actor]');
  const count = root.querySelector('[data-csp-participant-count]');
  if (!search || !select) return;
  const update = () => {
    const query = normalizeName(search.value);
    const previous = select.value || suggestedUuid || "";
    const matches = entries.filter(e => normalizeName(`${e.name} ${t(e.kind === "token" ? "Casting.Token" : "Casting.Actor")}`).includes(query));
    select.innerHTML = actorOptions(matches, previous, optional);
    if (count) count.textContent = tf("Dialog.TargetsFound", { count: matches.length });
    onChange?.();
  };
  search.addEventListener("input", update);
  search.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); select.focus(); }
  });
  update();
}

/** The initiator chooses the other person, never a replacement caster. */
export async function selectTargetParticipant({ specialKinds = ["unknown"] } = {}) {
  const users = game.users.filter(user => user.active);
  const defaultUserId = getPrimaryGM()?.id ?? game.user.id;
  const choices = new Map(users.map(user => [user.id, [...participantEntries(user), ...specialEntries(specialKinds)]]));
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Participants.ChooseRecipient") }, position: { width: 620 },
    classes: ["counterspell-plus-dialog"], modal: false, rejectClose: false,
    content: `<div class="csp-form"><p class="hint">${t("Participants.RecipientHint")}</p>
      <div class="form-group"><label>${t("Participants.Recipient")}</label><div class="form-fields">
        <select name="userId">${users.map(user => `<option value="${escapeHTML(user.id)}"${user.id === defaultUserId ? " selected" : ""}>${escapeHTML(user.name)}</option>`).join("")}</select>
      </div></div>
      <div class="form-group stacked"><label>${t("Participants.OptionalCharacter")}</label><div class="form-fields csp-target-search">
        <input type="search" data-csp-participant-search placeholder="${escapeHTML(t("Dialog.SearchTargetPlaceholder"))}" autocomplete="off">
        <select name="actorUuid" data-csp-participant-actor size="6">${actorOptions(choices.get(defaultUserId) ?? [], "", true)}</select>
        <small data-csp-participant-count></small>
      </div></div><p class="hint">${t("Participants.PrivacyHint")}</p></div>`,
    render: (_event, dialog) => {
      const userSelect = dialog.element.querySelector('[name="userId"]');
      const actorSelect = dialog.element.querySelector('[data-csp-participant-actor]');
      const search = dialog.element.querySelector('[data-csp-participant-search]');
      // Register search once; switch the filtered backing array on recipient changes.
      const currentEntries = [];
      const changeUser = () => {
        currentEntries.splice(0, currentEntries.length, ...(choices.get(userSelect.value) ?? []));
        search.value = "";
        actorSelect.innerHTML = actorOptions(currentEntries, "", true);
        const count = dialog.element.querySelector('[data-csp-participant-count]');
        if (count) count.textContent = tf("Dialog.TargetsFound", { count: currentEntries.length });
      };
      changeUser();
      activateParticipantSearch(dialog, currentEntries, "", true);
      userSelect.addEventListener("change", changeUser);
    },
    buttons: [
      { action: "cancel", label: t("Dialog.Cancel"), callback: () => null },
      { action: "confirm", label: t("Dialog.Continue"), default: true,
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
    ]
  });
  if (!result) return null;
  const user = users.find(user => user.id === result.userId && user.active);
  const actorUuid = String(result.actorUuid ?? "");
  if (!user || (actorUuid && !choices.get(user.id)?.some(entry => entry.key === actorUuid))) {
    ui.notifications.warn(t("Participants.InvalidCharacter"));
    return null;
  }
  return { userId: user.id, actorUuid };
}

export async function promptTargetConfirmation(data) {
  const picker = ownedTargetPicker(data.actorUuid, { allowSpecial: true });
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Participants.ConfirmTarget") }, position: { width: 620 },
    classes: ["counterspell-plus-dialog"], modal: false, rejectClose: false,
    content: `<div class="csp-form"><p>${escapeHTML(data.spellName ?? "")} ${escapeHTML(data.effectName ?? "")}</p>${picker.html}
      ${data.identify ? `<div class="form-group"><label>${t("Participants.ItemName")}</label><div class="form-fields"><input name="subjectName" type="text" value="${escapeHTML(data.subjectName ?? "")}" required></div></div>
      <div class="form-group"><label>${t("Participants.InventoryItem")}</label><div class="form-fields"><select name="subjectItemUuid"><option value="">${t("Identify.Dialog.ManualItem")}</option></select></div></div>` : ""}</div>`,
    render: (event, dialog) => {
      picker.render(event, dialog);
      if (!data.identify) return;
      const actorSelect = dialog.element.querySelector('[name="actorUuid"]');
      const itemSelect = dialog.element.querySelector('[name="subjectItemUuid"]');
      const name = dialog.element.querySelector('[name="subjectName"]');
      const updateItems = () => {
        const entry = picker.entries.find(e => e.key === actorSelect.value);
        const items = Array.from(entry?.actor?.items ?? []).filter(item => item.type !== "spell");
        itemSelect.innerHTML = `<option value="">${escapeHTML(t("Identify.Dialog.ManualItem"))}</option>`
          + items.map(item => `<option value="${escapeHTML(item.uuid)}">${escapeHTML(item.name)}</option>`).join("");
        if (items.some(item => item.uuid === data.subjectItemUuid)) itemSelect.value = data.subjectItemUuid;
      };
      actorSelect.addEventListener("change", updateItems);
      itemSelect.addEventListener("change", () => {
        const actor = picker.entries.find(e => e.key === actorSelect.value)?.actor;
        const item = Array.from(actor?.items ?? []).find(item => item.uuid === itemSelect.value);
        if (item) name.value = item.name;
      });
      name.addEventListener("input", () => { itemSelect.value = ""; });
      updateItems();
    },
    buttons: [
      { action: "cancel", label: t("Dialog.Cancel"), callback: () => null },
      { action: "confirm", label: t("Dialog.SendToInitiator"), default: true,
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
    ]
  });
  if (!result) return null;
  const entry = picker.read(result.actorUuid);
  if (!entry) return null;
  const subjectItem = data.identify ? Array.from(entry.actor?.items ?? []).find(item => item.uuid === result.subjectItemUuid && item.type !== "spell") : null;
  return { actorUuid: entry.actor ? entry.key : "", actorName: entry.name,
    targetType: entry.kind === "special" ? entry.key.slice(8) : "actor", userId: game.user.id,
    ...(data.identify ? { subjectName: String(result.subjectName || subjectItem?.name || data.subjectName || ""),
      subjectItemUuid: subjectItem?.uuid ?? "" } : {}) };

}
