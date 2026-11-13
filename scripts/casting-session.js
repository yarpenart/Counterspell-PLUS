import { promptCounterspeller } from "./dialogs.js";

/** The initiating user always fills in their own Counterspell form. */
export async function promptCasting(session, method, ...args) {
  if (session.userId !== game.user.id || method !== "counterspell") return null;
  return promptCounterspeller(session.actor, session.item, ...args);
}

export function initializeCastingSessions() {}
