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

function createD20Roll(parts, data, { advantage = false, disadvantage = false } = {}) {
  const RollClass = CONFIG.Dice.D20Roll;
  const formula = ["1d20", ...parts].join(" + ");
  if ( RollClass ) {
    return new RollClass(formula, data, {
      advantage,
      disadvantage,
      criticalSuccess: 20,
      criticalFailure: 1
    });
  }

  const die = advantage && !disadvantage
    ? "2d20kh"
    : disadvantage && !advantage
      ? "2d20kl"
      : "1d20";
  return new Roll([die, ...parts].join(" + "), data);
}

function getNaturalD20(roll) {
  const die = roll?.dice?.find(term => term.faces === 20);
  const natural = Number(die?.total);
  return Number.isFinite(natural) ? natural : null;
}

function highlightNaturalD20(message, html) {
  if (!message.getFlag(MODULE_ID, "highlightD20")) return;
  const total = html.querySelector(".dice-total");
  if (!total) return;

  const natural = getNaturalD20(message.rolls?.[0]);
  if (natural === 20) total.classList.add("critical");
  else if (natural === 1) total.classList.add("fumble");
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
      case "execute-target-roll":
        result = await executeTargetRoll(message.payload.target);
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
  const messageData = {
    speaker: speakerFor(actor, alias),
    flavor,
    flags: { [MODULE_ID]: { highlightD20: true } }
  };
  const D20Roll = CONFIG.Dice.D20Roll;
  if (D20Roll && roll instanceof D20Roll) {
    return D20Roll.toMessage([roll], messageData, { rollMode });
  }
  return roll.toMessage(messageData, { rollMode });
}

async function postFixedTarget(target, total) {
  const base = target.sourceType === "glyph" ? 10 : 7;
  const title = target.sourceType === "glyph" ? t("Chat.GlyphDefense") : t("Chat.ScrollDefense");
  const messageData = applyRollMode({
    speaker: speakerFor(null, target.actorName),
    content: `
      <div class="counterspell-plus-chat csp-fixed">
        <h3>${title}</h3>
        <p class="csp-formula">${base} + ${target.spellLevel} + ${target.creatorMod} + ${target.creatorProf} = <strong>${total}</strong></p>
      </div>`
  }, target.rollMode);
  return ChatMessage.create(messageData);
}

async function postResult({ counter, target, counterTotal, targetTotal, success, automatic = false, dc = null }) {
  const resultLabel = success ? t("Chat.Countered") : t("Chat.NotCountered");
  const resultClass = success ? "success" : "failure";
  const allRelevantRollsPublic = dc !== null
    ? counter.rollMode === "publicroll"
    : counter.rollMode === "publicroll" && target.rollMode === "publicroll";
  const detail = automatic
    ? t("Chat.AutomaticSuccess")
    : !allRelevantRollsPublic
      ? t("Chat.HiddenResults")
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
  }, "publicroll");
  await ChatMessage.create(messageData);

  if (game.settings.get(MODULE_ID, "wildMagic") && isCounterspellName(target.spellName)) {
    const wildData = applyRollMode({
      speaker: speakerFor(null, counter.actorName),
      content: `
        <div class="counterspell-plus-chat csp-wild-magic">
          <h3>${t("Chat.WildMagicTitle")}</h3>
          <p>${t("Chat.WildMagicBody")}</p>
        </div>`
    }, "publicroll");
    await ChatMessage.create(wildData);
  }
}

async function executeTargetRoll(target) {
  if (["scroll", "glyph"].includes(target.sourceType)) {
    const base = target.sourceType === "glyph" ? 10 : 7;
    const total = base + target.spellLevel + target.creatorMod + target.creatorProf;
    await postFixedTarget(target, total);
    return { total };
  }

  const targetActor = getActorFromUuidSync(target.actorUuid);
  const targetRoll = await createD20Roll(["@slot", "@mod", "@prof"], {
    slot: target.spellLevel,
    mod: target.abilityMod,
    prof: target.proficiency
  }, {
    disadvantage: Boolean(target.disadvantage)
  }).evaluate();
  await postRoll(targetRoll, {
    actor: targetActor,
    alias: target.actorName,
    flavor: tf("Chat.TargetRoll", { spell: target.spellName, actor: target.actorName }),
    rollMode: target.rollMode
  });
  return { total: targetRoll.total };
}

async function resolveHomebrew(counter, target) {
  const counterActor = getActorFromUuidSync(counter.actorUuid);
  const hasAdvantage = Boolean(counter.knowsTargetSpell) && !isCounterspellName(target.spellName);
  const counterRoll = await createD20Roll(["@slot", "@mod", "@prof"], {
    slot: counter.slotLevel,
    mod: counter.abilityMod,
    prof: counter.proficiency
  }, {
    advantage: hasAdvantage,
    disadvantage: Boolean(counter.disadvantage)
  }).evaluate();

  await postRoll(counterRoll, {
    actor: counterActor,
    alias: counter.actorName,
    flavor: tf("Chat.CounterspellRoll", { actor: counter.actorName }),
    rollMode: counter.rollMode
  });

  const targetResult = await requestRemote("execute-target-roll", target.rollUserId, { target });
  if (!targetResult) throw new Error(t("Notifications.TargetRollFailed"));
  const targetTotal = Number(targetResult.total);

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
  const roll = await createD20Roll(["@mod"], { mod: counter.abilityMod }, {
    disadvantage: Boolean(counter.disadvantage)
  }).evaluate();
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
    let counter = await promptCounterspeller(actor, item, ruleset);
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

    const review = await requestRemote("gm-review", gm.id, { counter, target });
    if (!review?.counter || !review?.target) {
      ui.notifications.info(t("Notifications.CancelledByGM"));
      return;
    }
    counter = review.counter;
    target = review.target;

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
  Hooks.on("renderChatMessageHTML", highlightNaturalD20);

  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!isCounterspellActivity(activity)) return;
    queueMicrotask(() => void startCounterspell(activity));
    return false;
  });

  game.counterspellPlus = {
    startFromActivity: startCounterspell,
    version: "0.1.6"
  };

  debug("Ready");
}
