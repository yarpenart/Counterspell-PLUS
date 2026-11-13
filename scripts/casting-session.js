import { ownsActor } from "./participants.js";
import { SOCKET_NAME } from "./config.js";
import { getActorFromUuidSync, randomRequestId, t } from "./utils.js";
import { promptCounterspeller } from "./dialogs.js";
import { promptDispeller, promptDispellerEffects, promptGMDispelEffect } from "./dispel-dialogs.js";

const pending = new Map();
const busy = new Set();
const methods = {
  "dispel-source": promptGMDispelEffect,
  counterspell: promptCounterspeller,
  dispel: promptDispeller,
  "dispel-effects": promptDispellerEffects,
};

async function runPrompt(method, actor, item, args) {
  if (method.endsWith("-effects") || method.endsWith("-source")) return methods[method](...args);
  return methods[method](actor, item, ...args);
}

/** Caster forms stay local; the GM can request target-only forms remotely. */
export async function promptCasting(session, method, ...args) {
  if (session.userId === game.user.id) return runPrompt(method, session.actor, session.item, args);
  if (!game.user.isGM || !["dispel-source"].includes(method)) return null;
  const user = game.users.get(session.userId);
  if (!user?.active || (session.actor && !ownsActor(session.actor, user))) {
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
      actorUuid: session.actor?.uuid ?? session.actorUuid ?? "", spell: session.item ? { uuid: session.item.uuid, name: session.item.name, system: { level: session.item.system?.level } } : null, args });
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
    const item = message.spell;
    let result = null;
    const key = actor?.uuid ?? message.recipientId;
    const valid = sender?.active && sender.isGM
      && (!actor || ownsActor(actor, game.user))
      && ["dispel-source"].includes(message.method)
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
