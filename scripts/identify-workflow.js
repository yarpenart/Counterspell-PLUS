import { MODULE_ID, RULESETS, SOCKET_NAME } from "./config.js";
import { promptGMIdentifyReview, promptIdentifier } from "./identify-dialogs.js";
import {
  escapeHTML,
  getActivityItem,
  getActorFromUuidSync,
  getItemActor,
  getPrimaryGM,
  isIdentifyActivity,
  randomRequestId,
  speakerFor,
  t,
  tf
} from "./utils.js";

const pendingRequests = new Map();
const activeActors = new Set();
const REQUEST_TIMEOUT = 180_000;

function debug(...args) {
  console.debug(`${MODULE_ID} | Identify |`, ...args);
}

function emitTo(recipientId, message) {
  const envelope = { ...message, recipientId };
  if (recipientId === game.user.id) {
    void handleSocket(envelope);
    return;
  }
  game.socket.emit(SOCKET_NAME, envelope);
}

function requestRemote(type, recipientId, payload) {
  return new Promise(resolve => {
    const requestId = randomRequestId();
    const timer = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      ui.notifications.warn(t("Identify.Notifications.RequestTimeout"));
      resolve(null);
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, result => {
      window.clearTimeout(timer);
      resolve(result);
    });

    emitTo(recipientId, {
      type,
      requestId,
      senderId: game.user.id,
      payload
    });
  });
}

async function answerRequest(message, result) {
  emitTo(message.senderId, {
    type: "response",
    replyTo: message.requestId,
    senderId: game.user.id,
    result
  });
}

async function handleSocket(message) {
  if (!message || message.recipientId !== game.user.id) return;

  if (message.type === "response") {
    const resolver = pendingRequests.get(message.replyTo);
    if (!resolver) return;
    pendingRequests.delete(message.replyTo);
    resolver(message.result ?? null);
    return;
  }
  if (!String(message.type).startsWith("identify-")) return;

  try {
    let result = null;
    if (message.type === "identify-gm-review" && game.user.isGM) {
      const review = await promptGMIdentifyReview(message.payload.identifier);
      if (review) {
        await completeIdentification(review);
        result = { approved: true };
      }
    }
    await answerRequest(message, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Identify remote workflow failed`, error);
    ui.notifications.error(error?.message || t("Identify.Notifications.GenericError"));
    await answerRequest(message, null);
  }
}

async function consumeIdentifySlot(identifier) {
  if (identifier.castingSource !== "spell") return;
  const actor = getActorFromUuidSync(identifier.actorUuid);
  if (!actor) throw new Error(t("Identify.Notifications.ActorNotFound"));
  const slot = actor.system?.spells?.[identifier.slotKey];
  const current = Number(slot?.value ?? 0);
  if (current <= 0) throw new Error(t("Identify.Notifications.SlotUnavailable"));
  await actor.update({ [`system.spells.${identifier.slotKey}.value`]: current - 1 });
}

function privateRecipients(identifier) {
  return [...new Set([
    ...game.users.filter(user => user.isGM).map(user => user.id),
    identifier.userId
  ].filter(Boolean))];
}

function castingSourceLabel(identifier) {
  return t(`Identify.Dialog.Source.${identifier.castingSource}`);
}

async function enrichRevealedText(value) {
  const content = String(value ?? "");
  const editor = foundry.applications?.ux?.TextEditor?.implementation;
  if (typeof editor?.enrichHTML === "function") {
    return editor.enrichHTML(content, { async: true });
  }
  return escapeHTML(content).replaceAll("\n", "<br>");
}

async function postIdentificationResult(identifier) {
  const hasDocument = Boolean(identifier.actualItemUuid);
  const description = hasDocument && identifier.mundaneItem
    ? t("Identify.Chat.MundaneItem")
    : hasDocument && identifier.revealDescription
    ? await enrichRevealedText(identifier.revealDescription)
    : hasDocument
      ? t("Identify.Chat.DetailsSoon")
      : t("Identify.Chat.MissingItemDetailsSoon");
  const curseDetails = identifier.revealCurse && identifier.curseDetails
    ? await enrichRevealedText(identifier.curseDetails)
    : "";
  const curse = curseDetails
    ? `<section class="csp-identify-curse"><h4>${t("Identify.Chat.CurseTitle")}</h4>${curseDetails}</section>`
    : "";
  await ChatMessage.create({
    speaker: speakerFor(getActorFromUuidSync(identifier.actorUuid), identifier.actorName),
    whisper: privateRecipients(identifier),
    content: `
      <div class="counterspell-plus-chat csp-identify-result success">
        <header class="csp-identify-result-header">
          <img src="${escapeHTML(identifier.itemImg)}" alt="">
          <div>
            <h3>${escapeHTML(t("Identify.Chat.Success"))}</h3>
            <strong>${escapeHTML(identifier.finalItemName)}</strong>
          </div>
        </header>
        <p>${tf("Identify.Chat.CastSummary", {
          caster: escapeHTML(identifier.actorName),
          level: identifier.castLevel,
          source: escapeHTML(castingSourceLabel(identifier))
        })}</p>
        <section class="csp-identify-description">${description}</section>
        ${curse}
        <small>${t("Identify.Chat.PrivateRecipients")}</small>
      </div>`
  });
}

async function openRiskSave(identifier) {
  if (!identifier.risk || identifier.ruleset !== RULESETS.HOMEBREW) return;
  const api = game.statShift?.openHomebrewSave;
  if (typeof api !== "function") {
    ui.notifications.warn(t("Identify.Notifications.StatShiftMissing"));
    await ChatMessage.create({
      speaker: speakerFor(null, t("Identify.Chat.GMNotice")),
      whisper: game.users.filter(user => user.isGM).map(user => user.id),
      content: `<div class="counterspell-plus-chat csp-identify-risk-warning"><strong>${escapeHTML(t("Identify.Notifications.StatShiftMissing"))}</strong></div>`
    });
    return;
  }

  api({
    actorUuid: identifier.actorUuid,
    sourceLabel: tf("Identify.StatShift.Source", { item: identifier.finalItemName }),
    defaults: {
      title: tf("Identify.StatShift.Title", { item: identifier.finalItemName }),
      effectName: tf("Identify.StatShift.EffectName", { item: identifier.finalItemName }),
      description: tf("Identify.StatShift.Description", { level: identifier.castLevel }),
      dc: 15,
      rollBonus: identifier.castLevel,
      rollMode: identifier.rollMode,
      mode: "add",
      durationValue: 1,
      durationUnit: "hours",
      successIcon: "icons/sundries/scrolls/scroll-bound-blue-red.webp",
      failureIcon: "icons/sundries/scrolls/scroll-bound-blue-red.webp",
      applySuccess: false,
      applyFailure: true
    }
  });
}

async function completeIdentification(identifier) {
  await consumeIdentifySlot(identifier);
  await openRiskSave(identifier);
  await postIdentificationResult(identifier);
}

async function startIdentify(activity) {
  const item = getActivityItem(activity);
  const actor = getItemActor(item);
  if (!item || !actor) {
    ui.notifications.error(t("Identify.Notifications.ActorNotFound"));
    return;
  }
  if (activeActors.has(actor.uuid)) {
    ui.notifications.warn(t("Identify.Notifications.AlreadyPending"));
    return;
  }
  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.error(t("Identify.Notifications.NoGM"));
    return;
  }

  activeActors.add(actor.uuid);
  try {
    const ruleset = game.settings.get(MODULE_ID, "identifyRuleset");
    const identifier = await promptIdentifier(actor, item, ruleset);
    if (!identifier) return;
    const result = await requestRemote("identify-gm-review", gm.id, { identifier });
    if (!result?.approved) {
      ui.notifications.info(t("Identify.Notifications.CancelledByGM"));
      return;
    }
    ui.notifications.info(t("Identify.Notifications.Approved"));
  } catch (error) {
    console.error(`${MODULE_ID} | Identify workflow failed`, error);
    ui.notifications.error(error?.message || t("Identify.Notifications.GenericError"));
  } finally {
    activeActors.delete(actor.uuid);
  }
}

export function initializeIdentifyWorkflow() {
  game.socket.on(SOCKET_NAME, handleSocket);
  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!isIdentifyActivity(activity)) return;
    queueMicrotask(() => void startIdentify(activity));
    return false;
  });

  game.counterspellPlus = game.counterspellPlus ?? {};
  game.counterspellPlus.startIdentifyFromActivity = startIdentify;
  game.counterspellPlus.version = "0.5.2";
  debug("Ready");
}
