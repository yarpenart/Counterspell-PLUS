import { SOCKET_NAME } from "./config.js";
import { escapeHTML, getActorFromUuidSync, getSceneCasterEntries, getItemActor,
  isCounterspellActivity, isDispelMagicActivity, isRemoveCurseActivity,
  isIdentifyActivity, getRestorationActivityType, randomRequestId, t } from "./utils.js";
import { promptCounterspeller } from "./dialogs.js";
import { promptDispeller, promptDispellerEffects, promptGMDispelEffect } from "./dispel-dialogs.js";
import { promptCurseRemover, promptCurseRemoverEffects, promptGMRemoveCurseEffect } from "./remove-curse-dialogs.js";
import { promptRestorer, promptRestorationEffect } from "./restoration-dialogs.js";
import { promptIdentifier } from "./identify-dialogs.js";

const pending = new Map();
const busy = new Set();
let selecting = false;
const methods = {
  "dispel-source": promptGMDispelEffect,
  "remove-curse-source": promptGMRemoveCurseEffect,
  counterspell: promptCounterspeller,
  dispel: promptDispeller,
  "remove-curse": promptCurseRemover,
  restoration: promptRestorer,
  identify: promptIdentifier,
  "dispel-effects": promptDispellerEffects,
  "remove-curse-effects": promptCurseRemoverEffects,
  "restoration-effect": promptRestorationEffect
};

function owns(actor, user) {
  return Boolean(actor && user && (user.isGM
    || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)));
}

function matches(item, kind, activityType) {
  const activity = { item };
  if (kind === "restoration") return getRestorationActivityType(activity) === activityType;
  return ({ counterspell: isCounterspellActivity, dispel: isDispelMagicActivity,
    "remove-curse": isRemoveCurseActivity, identify: isIdentifyActivity })[kind]?.(activity) ?? false;
}

function options(entries, selected) {
  return entries.map(entry => `<option value="${escapeHTML(entry.id)}"${entry.id === selected ? " selected" : ""}>${escapeHTML(entry.name)}</option>`).join("");
}

/** Select the actual caster and the person who fills in the casting forms. */
export async function selectCastingSession(originalActor, originalItem, kind, activityType) {
  const source = kind.endsWith("-source");
  if (selecting) {
    ui.notifications.warn(t("Notifications.AlreadyPending"));
    return null;
  }
  selecting = true;
  try {
    const users = game.user.isGM
      ? game.users.filter(user => user.active && (!user.isGM || user.id === game.user.id))
      : [game.user];
    const sceneEntries = getSceneCasterEntries();
    const actorEntries = Array.from(game.actors).filter(actor => !sceneEntries.some(entry => entry.kind === "actor" && entry.actor.uuid === actor.uuid))
      .map(actor => ({ uuid: actor.uuid, actor, name: actor.name, kind: "actor" }));
    const entries = [...sceneEntries, ...actorEntries].filter(entry => owns(entry.actor, game.user))
      .flatMap(entry => (source ? [null] : Array.from(entry.actor.items).filter(item => matches(item, kind, activityType)))
        .map(item => ({ id: source ? entry.uuid : `${entry.uuid}|${item.id}`, actor: entry.actor, item,
          name: `${t(entry.kind === "token" ? "Casting.Token" : "Casting.Actor")}: ${entry.name}${item ? ` — ${item.name}` : ""}` })));
    if (!entries.length) {
      ui.notifications.warn(t("Casting.NoSpell"));
      return null;
    }
    const preferredUser = game.user;
    const defaultItem = entries.find(entry => source ? entry.actor.uuid === originalActor?.uuid : entry.item.uuid === originalItem?.uuid)?.id;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: t(source ? "Casting.SourceTitle" : "Casting.Title") }, position: { width: 620 },
      classes: ["counterspell-plus-dialog"], modal: false, rejectClose: false,
      content: `<div class="csp-form">
        <p class="hint">${t(source ? "Casting.SourceHint" : "Casting.Hint")}</p>
        <div class="form-group"><label>${t("Casting.Player")}</label><div class="form-fields"><select name="userId">${options(users, preferredUser.id)}</select></div></div>
        <div class="form-group"><label>${t("Casting.Caster")}</label><div class="form-fields"><select name="itemUuid" required></select></div></div>
        <p class="hint">${t("Casting.OwnershipHint")}</p>
      </div>`,
      render: (_event, dialog) => {
        const userSelect = dialog.element.querySelector('[name="userId"]');
        const itemSelect = dialog.element.querySelector('[name="itemUuid"]');
        const update = () => {
          const selected = itemSelect.value || defaultItem;
          const user = game.users.get(userSelect.value);
          itemSelect.innerHTML = options(entries.filter(entry => owns(entry.actor, user)), selected);
        };
        userSelect.addEventListener("change", update);
        update();
      },
      buttons: [
        { action: "cancel", label: t("Dialog.Cancel"), callback: () => null },
        { action: "confirm", label: t("Dialog.Continue"), default: true,
          callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
      ]
    });
    if (!result) return null;
    const user = users.find(user => user.id === result.userId);
    const entry = entries.find(entry => entry.id === result.itemUuid);
    if (!user?.active || !entry || !owns(entry.actor, user)) {
      ui.notifications.warn(t("Casting.InvalidSelection"));
      return null;
    }
    return { actor: entry.actor, item: entry.item, userId: user.id };
  } finally {
    selecting = false;
  }
}

async function runPrompt(method, actor, item, args) {
  if (method.endsWith("-effects") || method.endsWith("-source") || method === "restoration-effect") return methods[method](...args);
  return methods[method](actor, item, ...args);
}

/** Keep every player-side form on the selected owner's client. */
export async function promptCasting(session, method, ...args) {
  if (session.userId === game.user.id) return runPrompt(method, session.actor, session.item, args);
  const user = game.users.get(session.userId);
  if (!user?.active || !owns(session.actor, user)) {
    ui.notifications.warn(t("Casting.PlayerUnavailable"));
    return null;
  }
  return new Promise(resolve => {
    const requestId = randomRequestId();
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      ui.notifications.warn(t("Notifications.RequestTimeout"));
      resolve(null);
    }, 180_000);
    pending.set(requestId, { userId: user.id, resolve, timer });
    game.socket.emit(SOCKET_NAME, { type: "casting-prompt", requestId,
      senderId: game.user.id, recipientId: user.id, method,
      actorUuid: session.actor.uuid, itemUuid: session.item?.uuid, args });
  });
}

export function initializeCastingSessions() {
  game.socket.on(SOCKET_NAME, async message => {
    if (!message || message.recipientId !== game.user.id) return;
    if (message.type === "casting-response") {
      const request = pending.get(message.replyTo);
      if (!request || request.userId !== message.senderId) return;
      pending.delete(message.replyTo);
      window.clearTimeout(request.timer);
      request.resolve(message.result ?? null);
      return;
    }
    if (message.type !== "casting-prompt") return;
    const sender = game.users.get(message.senderId);
    const actor = getActorFromUuidSync(message.actorUuid);
    const item = message.itemUuid ? fromUuidSync(message.itemUuid) : null;
    let result = null;
    const key = actor?.uuid;
    const valid = sender?.active && sender.isGM && owns(actor, game.user)
      && (message.method?.endsWith("-source") || getItemActor(item)?.uuid === actor.uuid)
      && Object.hasOwn(methods, message.method)
      && Array.isArray(message.args);
    if (valid && !busy.has(key)) {
      busy.add(key);
      try {
        result = await runPrompt(message.method, actor, item, message.args);
      } catch (error) {
        console.error("Counterspell PLUS | Player casting form failed", error);
      } finally {
        busy.delete(key);
      }
    }
    game.socket.emit(SOCKET_NAME, { type: "casting-response", recipientId: message.senderId,
      senderId: game.user.id, replyTo: message.requestId, result });
  });
}
