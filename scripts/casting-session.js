import { promptCounterspeller } from "./dialogs.js";
import { promptDispeller } from "./dispel-dialogs.js";

export async function promptCasting(session, method, ...args) {
  if (session.userId !== game.user.id) return null;
  const prompt = { counterspell: promptCounterspeller, dispel: promptDispeller }[method];
  return prompt ? prompt(session.actor, session.item, ...args) : null;
}

export function initializeCastingSessions() {}
