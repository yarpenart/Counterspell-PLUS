import { MODULE_ID } from "./config.js";

export function t(key) {
  return game.i18n.localize(`COUNTERSPELL_PLUS.${key}`);
}

export function tf(key, data) {
  return game.i18n.format(`COUNTERSPELL_PLUS.${key}`, data);
}

export function escapeHTML(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

export function getActivityItem(activity) {
  const candidates = [activity?.item, activity?.parent, activity?.subject];
  return candidates.find(candidate => candidate?.documentName === "Item" || candidate?.type === "spell") ?? null;
}

export function getItemActor(item) {
  return item?.actor ?? (item?.parent?.documentName === "Actor" ? item.parent : null);
}

export function isCounterspellActivity(activity) {
  if (!game.settings.get(MODULE_ID, "enabled")) return false;

  const item = getActivityItem(activity);
  if (!item || item.type !== "spell") return false;

  const identifier = normalizeName(item.system?.identifier);
  if (identifier === "counterspell") return true;

  const configured = game.settings.get(MODULE_ID, "counterspellNames")
    .split(",")
    .map(normalizeName)
    .filter(Boolean);
  const itemName = normalizeName(item.name);

  return configured.some(name => itemName === name || itemName.startsWith(`${name} (`));
}

export function isDispelMagicActivity(activity) {
  if (!game.settings.get(MODULE_ID, "dispelEnabled")) return false;

  const item = getActivityItem(activity);
  if (!item || item.type !== "spell") return false;

  const identifier = normalizeName(item.system?.identifier);
  if (identifier === "dispel-magic" || identifier === "dispelmagic") return true;

  const configured = game.settings.get(MODULE_ID, "dispelMagicNames")
    .split(",")
    .map(normalizeName)
    .filter(Boolean);
  const itemName = normalizeName(item.name);

  return configured.some(name => itemName === name || itemName.startsWith(`${name} (`));
}

export function isCounterspellName(name) {
  const normalized = normalizeName(name);
  return normalized.startsWith("counterspell")
    || normalized.startsWith("kontrzaklecie")
    || normalized.startsWith("kontrczar");
}

export function getPrimaryGM() {
  return game.users
    .filter(user => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export function getAbilityEntries(actor, selected) {
  const abilities = actor?.system?.abilities ?? {};
  return Object.keys(abilities).map(key => {
    const config = CONFIG.DND5E.abilities?.[key];
    const labelKey = typeof config === "object" ? config.label : config;
    const label = labelKey ? game.i18n.localize(labelKey) : key.toUpperCase();
    return {
      key,
      label,
      mod: Number(abilities[key]?.mod ?? 0),
      selected: key === selected
    };
  });
}

export function getDefaultAbility(actor) {
  const configured = actor?.system?.attributes?.spellcasting;
  if (configured && actor.system.abilities?.[configured]) return configured;
  return ["int", "wis", "cha"].find(key => actor?.system?.abilities?.[key])
    ?? Object.keys(actor?.system?.abilities ?? {})[0]
    ?? "int";
}

export function getAbilityData(actor, ability) {
  return {
    ability,
    abilityMod: Number(actor?.system?.abilities?.[ability]?.mod ?? 0),
    proficiency: Number(actor?.system?.attributes?.prof ?? 0)
  };
}

export function getSlotChoices(actor, item) {
  const minimumLevel = Math.max(1, Number(item?.system?.level ?? 3));
  const choices = [];

  for (let level = minimumLevel; level <= 9; level += 1) {
    const key = `spell${level}`;
    const slot = actor?.system?.spells?.[key];
    const value = Number(slot?.value ?? 0);
    if (value <= 0) continue;
    choices.push({
      key,
      level,
      value,
      label: tf("Dialog.SlotStandard", { level, value })
    });
  }

  const pact = actor?.system?.spells?.pact;
  const pactLevel = Number(pact?.level ?? 0);
  const pactValue = Number(pact?.value ?? 0);
  if (pactLevel >= minimumLevel && pactValue > 0) {
    choices.push({
      key: "pact",
      level: pactLevel,
      value: pactValue,
      label: tf("Dialog.SlotPact", { level: pactLevel, value: pactValue })
    });
  }

  return choices;
}

export function getRollModeEntries(selected) {
  const modes = [
    { key: "publicroll", label: t("Dialog.RollModePublic") },
    { key: "gmroll", label: t("Dialog.RollModePrivate") },
    { key: "blindroll", label: t("Dialog.RollModeBlind") }
  ];
  return modes.map(mode => ({
    ...mode,
    selected: mode.key === selected
  }));
}

export function getActorFromUuidSync(uuid) {
  if (!uuid) return null;
  const document = fromUuidSync(uuid);
  if (!document) return null;
  if (document.documentName === "Actor") return document;
  return document.actor ?? null;
}

export function getSceneCasterEntries() {
  const tokens = canvas?.tokens?.placeables ?? [];
  if (tokens.length) {
    return tokens
      .map(token => ({
        uuid: token.document.uuid,
        name: token.name,
        actor: token.actor
      }))
      .filter(entry => entry.actor)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return game.actors
    .map(actor => ({ uuid: actor.uuid, name: actor.name, actor }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveOwner(actor) {
  if (!actor) return null;
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return game.users.find(user => user.active && !user.isGM && actor.testUserPermission(user, ownerLevel)) ?? null;
}

export function speakerFor(actor, alias) {
  if (actor) return ChatMessage.getSpeaker({ actor });
  return { alias: alias || t("Chat.UnknownCaster") };
}

export function applyRollMode(messageData, rollMode) {
  if (typeof ChatMessage.applyRollMode === "function") {
    ChatMessage.applyRollMode(messageData, rollMode);
    return messageData;
  }

  const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
  if (rollMode === "gmroll") messageData.whisper = gmIds;
  if (rollMode === "blindroll") {
    messageData.whisper = gmIds;
    messageData.blind = true;
  }
  return messageData;
}

export function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeBonusFormula(value) {
  return String(value ?? "").trim();
}

export function validateBonusFormula(value) {
  const formula = normalizeBonusFormula(value);
  if (!formula) return true;
  try {
    void new Roll(formula, {});
    return true;
  } catch (_error) {
    return false;
  }
}

export function bonusRollPart(value) {
  const formula = normalizeBonusFormula(value);
  return formula ? `(${formula})` : null;
}

export function randomRequestId() {
  return foundry.utils.randomID(24);
}
