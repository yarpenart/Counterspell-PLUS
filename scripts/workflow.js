import { MODULE_ID, RULESETS, SOCKET_NAME } from "./config.js";
import {
  promptCounterspeller,
  promptGMReview,
  promptGMTarget,
  promptTargetPlayer
} from "./dialogs.js";
import {
  applyRollMode,
  escapeHTML,
  getActivityItem,
  getActorFromUuidSync,
  getItemActor,
  getPrimaryGM,
  isCounterspellActivity,
  isCounterspellName,
  randomRequestId,
  speakerFor,
  t,
  tf
} from "./utils.js";

const pendingRequests = new Map();
const activeActors = new Set();
const REQUEST_TIMEOUT = 180_000;

function debug(...args) {
  console.debug(`${MODULE_ID} |`, ...args);
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
      ui.notifications.warn(t("Notifications.RequestTimeout"));
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

  try {
    let result = null;
    switch (message.type) {
      case "gm-target":
        if (game.user.isGM) result = await promptGMTarget(message.payload.counter);
        break;
      case "target-player":
        result = await promptTargetPlayer(message.payload.target);
        break;
      case "gm-review":
        if (game.user.isGM) {
          result = await promptGMReview(message.payload.counter, message.payload.target);
        }
        break;
      default:
        debug("Unknown socket message", message.type);
    }
    await answerRequest(message, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Remote dialog failed`, error);
    await answerRequest(message, null);
  }
}

async function consumeCounterspellSlot(counter) {
  const actor = getActorFromUuidSync(counter.actorUuid);
  if (!actor) throw new Error(t("Notifications.ActorNotFound"));

  const slot = actor.system?.spells?.[counter.slotKey];
  const current = Number(slot?.value ?? 0);
  if (current <= 0) throw new Error(t("Notifications.SlotUnavailable"));

  await actor.update({ [`system.spells.${counter.slotKey}.value`]: current - 1 });
}

async function postRoll(roll, { actor, alias, flavor, rollMode }) {
  return roll.toMessage({
    speaker: speakerFor(actor, alias),
    flavor
  }, { rollMode });
}

async function postFixedTarget(target, total, rollMode) {
  const messageData = applyRollMode({
    speaker: speakerFor(null, target.actorName),
    content: `
      <div class="counterspell-plus-chat csp-fixed">
        <h3>${t("Chat.ScrollDefense")}</h3>
        <p class="csp-formula">7 + ${target.spellLevel} + ${target.creatorMod} + ${target.creatorProf} = <strong>${total}</strong></p>
      </div>`
  }, rollMode);
  return ChatMessage.create(messageData);
}

async function postResult({ counter, target, counterTotal, targetTotal, success, automatic = false, dc = null }) {
  const resultLabel = success ? t("Chat.Countered") : t("Chat.NotCountered");
  const resultClass = success ? "success" : "failure";
  const detail = automatic
    ? t("Chat.AutomaticSuccess")
    : dc !== null
      ? tf("Chat.OfficialResult", { counterTotal, dc })
      : tf("Chat.OpposedResult", { counterTotal, targetTotal });
  const tieNote = counter.ruleset === RULESETS.HOMEBREW
    ? `<p class="csp-tie-note">${t("Chat.TieRule")}</p>`
    : "";

  const messageData = applyRollMode({
    speaker: speakerFor(null, counter.actorName),
    content: `
      <div class="counterspell-plus-chat">
        <h3>${escapeHTML(counter.itemName)}</h3>
        <div class="csp-result ${resultClass}">${escapeHTML(resultLabel)}</div>
        <p><strong>${escapeHTML(target.spellName)}</strong> — ${escapeHTML(target.actorName)}</p>
        <p>${escapeHTML(detail)}</p>
        ${tieNote}
      </div>`
  }, counter.rollMode);
  await ChatMessage.create(messageData);

  if (game.settings.get(MODULE_ID, "wildMagic") && isCounterspellName(target.spellName)) {
    const wildData = applyRollMode({
      speaker: speakerFor(null, counter.actorName),
      content: `
        <div class="counterspell-plus-chat csp-wild-magic">
          <h3>${t("Chat.WildMagicTitle")}</h3>
          <p>${t("Chat.WildMagicBody")}</p>
        </div>`
    }, counter.rollMode);
    await ChatMessage.create(wildData);
  }
}

async function resolveHomebrew(counter, target) {
  const counterActor = getActorFromUuidSync(counter.actorUuid);
  const counterRoll = await new Roll("1d20 + @slot + @mod + @prof", {
    slot: counter.slotLevel,
    mod: counter.abilityMod,
    prof: counter.proficiency
  }).evaluate();

  await postRoll(counterRoll, {
    actor: counterActor,
    alias: counter.actorName,
    flavor: tf("Chat.CounterspellRoll", { actor: counter.actorName }),
    rollMode: counter.rollMode
  });

  let targetTotal;
  if (target.sourceType === "scroll") {
    targetTotal = 7 + target.spellLevel + target.creatorMod + target.creatorProf;
    await postFixedTarget(target, targetTotal, counter.rollMode);
  } else {
    const targetActor = getActorFromUuidSync(target.actorUuid);
    const targetRoll = await new Roll("1d20 + @slot + @mod + @prof", {
      slot: target.spellLevel,
      mod: target.abilityMod,
      prof: target.proficiency
    }).evaluate();
    targetTotal = targetRoll.total;
    await postRoll(targetRoll, {
      actor: targetActor,
      alias: target.actorName,
      flavor: tf("Chat.TargetRoll", { spell: target.spellName, actor: target.actorName }),
      rollMode: counter.rollMode
    });
  }

  await postResult({
    counter,
    target,
    counterTotal: counterRoll.total,
    targetTotal,
    success: counterRoll.total > targetTotal
  });
}

async function resolveOfficial2014(counter, target) {
  if (counter.slotLevel >= target.spellLevel) {
    await postResult({
      counter,
      target,
      counterTotal: null,
      targetTotal: null,
      success: true,
      automatic: true
    });
    return;
  }

  const counterActor = getActorFromUuidSync(counter.actorUuid);
  const dc = 10 + target.spellLevel;
  const roll = await new Roll("1d20 + @mod", { mod: counter.abilityMod }).evaluate();
  await postRoll(roll, {
    actor: counterActor,
    alias: counter.actorName,
    flavor: tf("Chat.OfficialRoll", { dc }),
    rollMode: counter.rollMode
  });
  await postResult({
    counter,
    target,
    counterTotal: roll.total,
    targetTotal: null,
    success: roll.total >= dc,
    dc
  });
}

async function startCounterspell(activity) {
  const item = getActivityItem(activity);
  const actor = getItemActor(item);
  if (!item || !actor) {
    ui.notifications.error(t("Notifications.ActorNotFound"));
    return;
  }

  if (activeActors.has(actor.uuid)) {
    ui.notifications.warn(t("Notifications.AlreadyPending"));
    return;
  }

  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.error(t("Notifications.NoGM"));
    return;
  }

  activeActors.add(actor.uuid);
  try {
    const ruleset = game.settings.get(MODULE_ID, "ruleset");
    const counter = await promptCounterspeller(actor, item, ruleset);
    if (!counter) return;

    let target = await requestRemote("gm-target", gm.id, { counter });
    if (!target) {
      ui.notifications.info(t("Notifications.CancelledByGM"));
      return;
    }

    if (target.sourceType === "spell" && target.askOwner && target.ownerUserId) {
      const playerTarget = await requestRemote("target-player", target.ownerUserId, { target });
      if (!playerTarget) {
        ui.notifications.info(t("Notifications.CancelledByTarget"));
        return;
      }
      target = playerTarget;
    }

    target = await requestRemote("gm-review", gm.id, { counter, target });
    if (!target) {
      ui.notifications.info(t("Notifications.CancelledByGM"));
      return;
    }

    await consumeCounterspellSlot(counter);

    if (ruleset === RULESETS.OFFICIAL_2014) {
      await resolveOfficial2014(counter, target);
    } else {
      await resolveHomebrew(counter, target);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Counterspell workflow failed`, error);
    ui.notifications.error(error?.message || t("Notifications.GenericError"));
  } finally {
    activeActors.delete(actor.uuid);
  }
}

export function initializeWorkflow() {
  game.socket.on(SOCKET_NAME, handleSocket);

  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!isCounterspellActivity(activity)) return;
    queueMicrotask(() => void startCounterspell(activity));
    return false;
  });

  game.counterspellPlus = {
    startFromActivity: startCounterspell,
    version: "0.1.2"
  };

  debug("Ready");
}
