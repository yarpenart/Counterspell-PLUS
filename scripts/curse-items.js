import { escapeHTML, getActorFromUuidSync, normalizeName, t } from "./utils.js";

function itemEntries(actorUuid) {
  if (!game.user.isGM) return [];
  const actor = getActorFromUuidSync(actorUuid);
  const excluded = new Set(["spell", "feat", "class", "subclass", "background", "race", "species"]);
  const entries = [];
  const seen = new Set();
  const add = (item, owner = "") => {
    if (!item?.uuid || excluded.has(item.type) || seen.has(item.uuid)) return;
    seen.add(item.uuid);
    entries.push({ uuid: item.uuid, name: item.name, label: owner ? `${owner} — ${item.name}` : item.name });
  };
  if (actor) {
    for (const item of actor.items) add(item, actor.name);
  } else {
    for (const item of game.items?.contents ?? []) add(item, t("Identify.Dialog.WorldItem"));
    for (const owner of game.actors) for (const item of owner.items) add(item, owner.name);
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

export function curseItemFields(data = {}) {
  return `<fieldset class="csp-effect-card">
    <legend>${t("CurseItem.Title")}</legend>
    <div class="form-group stacked"><label>${t("CurseItem.Name")}</label>
      <input type="text" name="targetItemName" value="${escapeHTML(data.targetItemName ?? "")}" placeholder="${escapeHTML(t("CurseItem.Placeholder"))}"></div>
    <div class="form-group stacked"><label>${t("CurseItem.Select")}</label>
      <input type="search" data-csp-curse-item-search placeholder="${escapeHTML(t("CurseItem.Search"))}" autocomplete="off">
      <select name="targetItemUuid" size="5" data-csp-curse-item-select><option value="">${escapeHTML(t("CurseItem.Manual"))}</option></select></div>
    <p class="hint">${t("CurseItem.Hint")}</p>
  </fieldset>`;
}

export function activateCurseItemPicker(dialog, data = {}) {
  const root = dialog?.element;
  const actor = root?.querySelector('[name="targetUuid"]');
  const name = root?.querySelector('[name="targetItemName"]');
  const search = root?.querySelector('[data-csp-curse-item-search]');
  const select = root?.querySelector('[data-csp-curse-item-select]');
  if (!name || !search || !select) return;
  let entries = [];
  const filter = () => {
    const selected = select.value || data.targetItemUuid || "";
    const query = normalizeName(search.value);
    const matches = entries.filter(item => normalizeName(item.label).includes(query));
    select.innerHTML = `<option value="">${escapeHTML(t("CurseItem.Manual"))}</option>`
      + matches.map(item => `<option value="${escapeHTML(item.uuid)}"${item.uuid === selected ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("");
  };
  const changeActor = () => {
    const previous = select.value;
    entries = itemEntries(actor?.value || data.targetUuid);
    if (previous && !entries.some(item => item.uuid === previous)) { name.value = ""; select.value = ""; }
    filter();
  };
  actor?.addEventListener("change", changeActor);
  root.querySelector('[data-csp-target-filter]')?.addEventListener("input", changeActor);
  search.addEventListener("input", filter);
  select.addEventListener("change", () => {
    const item = entries.find(item => item.uuid === select.value);
    if (item) name.value = item.name;
  });
  name.addEventListener("input", () => { select.value = ""; data = { ...data, targetItemUuid: "" }; });
  changeActor();
}

export function readCurseItem(form, actorUuid) {
  const selected = itemEntries(actorUuid).find(item => item.uuid === String(form.targetItemUuid ?? ""));
  const name = String(form.targetItemName ?? "").trim() || selected?.name || "";
  return { targetItemName: name, targetItemUuid: selected && name === selected.name ? selected.uuid : "" };
}

export function curseTargetName(actorName, itemName, fallback) {
  return itemName ? (actorName ? `${actorName} — ${itemName}` : itemName) : actorName || fallback;
}
