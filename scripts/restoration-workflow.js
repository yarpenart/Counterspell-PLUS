import { MODULE_ID, RULESETS, SOCKET_NAME } from "./config.js";
import {
  promptGMRestorationReview,
  promptRestorationEffect,
  promptRestorer
} from "./restoration-dialogs.js";
import {
  RESTORATION_EFFECTS,
  getRarityValue,
  restorationEffectNeedsCheck
} from "./restoration-rules.js";
import { getOutcomeThresholds } from "./remove-curse-workflow.js";
import {
  applyRollMode,
  bonusRollPart,
  escapeHTML,
  getActivityItem,
  getActorFromUuidSync,
  getHomebrewProficiencyMultiplier,
  getItemActor,
  getPrimaryGM,
  getRestorationActivityType,
  getSpecialMinimum,
  randomRequestId,
  speakerFor,
  t,
  tf,
  usesHomebrewProficiency,
  validateBonusFormula
} from "./utils.js";

const pendingRequests = new Map();
const activeActors = new Set();
const REQUEST_TIMEOUT = 180_000;

function debug(...args) {
  console.debug(`${MODULE_ID} | Restoration |`, ...args);
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
      ui.notifications.warn(t("Restoration.Notifications.RequestTimeout"));
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
  if (!String(message.type).startsWith("restoration-")) return;

  try {
    let result = null;
    switch (message.type) {
      case "restoration-gm-review":
        if (game.user.isGM) {
          result = await promptGMRestorationReview(message.payload.restorer, message.payload.selection);
        }
        break;
      case "restoration-post-defense":
        if (game.user.isGM) {
          await postDefenseSummary(message.payload.selection, message.payload.defense);
          result = true;
        }
        break;
      default:
        debug("Unknown socket message", message.type);
    }
    await answerRequest(message, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Restoration remote dialog failed`, error);
    await answerRequest(message, null);
  }
}

function createD20Roll(parts, data, { disadvantage = false, minimum } = {}) {
  const RollClass = CONFIG.Dice.D20Roll;
  const formula = ["1d20", ...parts].join(" + ");
  if (RollClass) {
    return new RollClass(formula, data, {
      disadvantage,
      minimum,
      criticalSuccess: 20,
      criticalFailure: 1
    });
  }
  const baseDie = disadvantage ? "2d20kl" : "1d20";
  const die = Number.isFinite(minimum) ? `${baseDie}min${minimum}` : baseDie;
  return new Roll([die, ...parts].join(" + "), data);
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

async function consumeRestorationSlot(restorer) {
  if (restorer.castingSource === "scroll") return;
  const actor = getActorFromUuidSync(restorer.actorUuid);
  if (!actor) throw new Error(t("Restoration.Notifications.ActorNotFound"));
  const slot = actor.system?.spells?.[restorer.slotKey];
  const current = Number(slot?.value ?? 0);
  if (current <= 0) throw new Error(t("Restoration.Notifications.SlotUnavailable"));
  await actor.update({ [`system.spells.${restorer.slotKey}.value`]: current - 1 });
}

function configuredNumber(setting, fallback) {
  const configured = Number(game.settings.get(MODULE_ID, setting));
  return Number.isFinite(configured) ? configured : fallback;
}

export function calculateRestorationDefense(selection) {
  const proficiencyIncluded = usesHomebrewProficiency();
  const knownReduction = selection.known ? 5 : 0;
  if (selection.effectId === RESTORATION_EFFECTS.CURSED_ATTUNEMENT) {
    const base = configuredNumber("restorationAttunementDefenseBase", 7);
    const level = Number(selection.itemCurseLevel);
    const modifier = getRarityValue(selection.rarity);
    const proficiency = proficiencyIncluded ? Number(selection.itemProf) : 0;
    return {
      type: "attunement",
      name: selection.itemName,
      base,
      level,
      modifier,
      proficiency,
      proficiencyIncluded,
      knownReduction,
      dc: base + level + modifier + proficiency - knownReduction
    };
  }

  const base = configuredNumber("restorationCurseDefenseBase", 8);
  const level = Number(selection.curseLevel);
  const modifier = Number(selection.curseMod);
  const proficiency = proficiencyIncluded ? Number(selection.curseProf) : 0;
  return {
    type: "curse",
    name: selection.curseName,
    base,
    level,
    modifier,
    proficiency,
    proficiencyIncluded,
    knownReduction,
    dc: base + level + modifier + proficiency - knownReduction
  };
}

async function postDefenseSummary(selection, defense) {
  const proficiencyPart = defense.proficiencyIncluded ? ` + ${defense.proficiency}` : "";
  const knownPart = defense.knownReduction ? ` - ${defense.knownReduction}` : "";
  const modifierLabel = defense.type === "attunement"
    ? t("Restoration.Chat.RarityModifier")
    : t("Restoration.Chat.CurseModifier");
  const data = applyRollMode({
    speaker: speakerFor(null, selection.targetName),
    content: `
      <div class="counterspell-plus-chat csp-restoration-defense">
        <h3>${t("Restoration.Chat.DefenseTitle")}</h3>
        <p><strong>${escapeHTML(defense.name)}</strong></p>
        <p class="csp-formula">${defense.base} + ${defense.level} + ${defense.modifier}${proficiencyPart}${knownPart} = <strong>${defense.dc}</strong></p>
        <small>${escapeHTML(modifierLabel)}</small>
      </div>`
  }, selection.defenseRollMode);
  await ChatMessage.create(data);
}

function materialLine(material) {
  if (!material) return t("Restoration.Chat.NoMaterial");
  return tf("Restoration.Chat.Material", {
    material: material.name,
    cost: material.cost
  });
}

async function postFinalResult(restorer, selection, result) {
  const totalsVisible = result.automatic
    || (restorer.rollMode === "publicroll" && selection.defenseRollMode === "publicroll");
  const detail = result.automatic
    ? t("Restoration.Chat.Automatic")
    : totalsVisible
      ? tf("Restoration.Chat.NumericResult", { total: result.total, dc: result.dc })
      : t("Restoration.Chat.HiddenResult");
  const status = result.success ? t("Restoration.Chat.Success") : t("Restoration.Chat.Failure");
  const resultClass = result.success ? "success" : "failure";
  const data = applyRollMode({
    speaker: speakerFor(null, restorer.actorName),
    content: `
      <div class="counterspell-plus-chat csp-restoration-result ${resultClass}">
        <h3>${escapeHTML(restorer.itemName)}</h3>
        <p>${tf("Restoration.Chat.Target", { target: escapeHTML(selection.targetName) })}</p>
        <p>${tf("Restoration.Chat.Effect", { effect: escapeHTML(selection.effectName) })}</p>
        <div class="csp-material-note">
          <strong>${escapeHTML(materialLine(selection.material))}</strong>
          ${selection.material ? `<br><span>${t("Restoration.Chat.MaterialInformational")}</span>` : ""}
        </div>
        <div class="csp-result ${resultClass}"><strong>${escapeHTML(status)}</strong><span>${escapeHTML(detail)}</span></div>
        <p class="csp-effect-note">${t("Restoration.Chat.ManualEffect")}</p>
      </div>`
  }, "publicroll");
  await ChatMessage.create(data);
}

function getRestorationCurseOutcome(result) {
  const thresholds = getOutcomeThresholds();
  const margin = Number(result.total) - Number(result.dc);
  if (margin <= -thresholds.dramaticFailureMin) {
    return {
      className: "dramatic-failure",
      title: t("Restoration.Outcome.DramaticFailure.Title"),
      body: tf("Restoration.Outcome.DramaticFailure.Body", { minimum: thresholds.dramaticFailureMin })
    };
  }
  if (margin <= 0) {
    return {
      className: "failure",
      title: t("Restoration.Outcome.Failure.Title"),
      body: tf("Restoration.Outcome.Failure.Body", { minimum: 0, maximum: thresholds.failureMax })
    };
  }
  if (margin <= thresholds.barelySuccessMax) {
    return {
      className: "barely-success",
      title: t("Restoration.Outcome.BarelySuccess.Title"),
      body: tf("Restoration.Outcome.BarelySuccess.Body", { minimum: 1, maximum: thresholds.barelySuccessMax })
    };
  }
  return {
    className: "success",
    title: t("Restoration.Outcome.Success.Title"),
    body: tf("Restoration.Outcome.Success.Body", { minimum: thresholds.successMin })
  };
}

async function postCurseOutcome(restorer, selection, result) {
  if (selection.effectId !== RESTORATION_EFFECTS.CURSE) return;
  const outcome = getRestorationCurseOutcome(result);
  await ChatMessage.create(applyRollMode({
    speaker: speakerFor(null, restorer.actorName),
    content: `
      <div class="counterspell-plus-chat csp-curse-outcome ${outcome.className}">
        <h3>${escapeHTML(outcome.title)}</h3>
        <p class="csp-curse-name">${escapeHTML(selection.curseName)}</p>
        <p>${escapeHTML(outcome.body)}</p>
      </div>`
  }, "publicroll"));
}

async function resolveCheck(restorer, selection) {
  const actor = getActorFromUuidSync(restorer.actorUuid);
  const bonusPart = bonusRollPart(restorer.bonusFormula);
  const specialMinimum = restorer.specialSpellcaster
    ? getSpecialMinimum("restorationSpecialMinimum")
    : undefined;
  const proficiencyMultiplier = getHomebrewProficiencyMultiplier(restorer.abjurer);
  const proficiencyPart = proficiencyMultiplier === 2
    ? "2 * @prof"
    : proficiencyMultiplier === 1
      ? "@prof"
      : null;
  const roll = await createD20Roll(
    ["@slot", "@mod", proficiencyPart, bonusPart].filter(Boolean),
    { slot: restorer.slotLevel, mod: restorer.abilityMod, prof: restorer.proficiency },
    { disadvantage: Boolean(restorer.disadvantage), minimum: specialMinimum }
  ).evaluate();

  await postRoll(roll, {
    actor,
    alias: restorer.actorName,
    flavor: `${tf("Restoration.Chat.Roll", { actor: restorer.actorName })}${specialMinimum ? ` — ${tf("Chat.SpecialMinimum", { minimum: specialMinimum })}` : ""}`,
    rollMode: restorer.rollMode
  });

  const defense = calculateRestorationDefense(selection);
  const defensePosted = await requestRemote("restoration-post-defense", selection.defenseUserId, {
    selection,
    defense
  });
  if (!defensePosted) throw new Error(t("Restoration.Notifications.DefensePostFailed"));
  const result = {
    total: roll.total,
    dc: defense.dc,
    success: roll.total > defense.dc,
    automatic: false
  };
  await postFinalResult(restorer, selection, result);
  // Only One Curse uses the four Remove Curse complication bands. Cursed-item
  // attunement intentionally stops after the plain Success / Failure result.
  await postCurseOutcome(restorer, selection, result);
}

async function startRestoration(activity, activityType = getRestorationActivityType(activity)) {
  const item = getActivityItem(activity);
  const actor = getItemActor(item);
  if (!activityType || !item || !actor) {
    ui.notifications.error(t("Restoration.Notifications.ActorNotFound"));
    return;
  }
  if (activeActors.has(actor.uuid)) {
    ui.notifications.warn(t("Restoration.Notifications.AlreadyPending"));
    return;
  }
  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.error(t("Restoration.Notifications.NoGM"));
    return;
  }

  activeActors.add(actor.uuid);
  try {
    const ruleset = game.settings.get(MODULE_ID, "restorationRuleset");
    let restorer = await promptRestorer(actor, item, ruleset, activityType);
    if (!restorer) return;
    let selection = await promptRestorationEffect(restorer);
    if (!selection) {
      ui.notifications.info(t("Restoration.Notifications.CancelledByPlayer"));
      return;
    }

    const review = await requestRemote("restoration-gm-review", gm.id, { restorer, selection });
    if (!review?.restorer || !review?.selection) {
      ui.notifications.info(t("Restoration.Notifications.CancelledByGM"));
      return;
    }
    restorer = review.restorer;
    selection = review.selection;

    const checkRequired = restorationEffectNeedsCheck(restorer.activityType, selection.effectId);
    if (checkRequired && !validateBonusFormula(restorer.bonusFormula)) {
      ui.notifications.error(t("Notifications.InvalidBonusFormula"));
      return;
    }
    await consumeRestorationSlot(restorer);
    if (checkRequired) {
      await resolveCheck(restorer, selection);
    } else {
      await postFinalResult(restorer, selection, {
        total: null,
        dc: null,
        success: true,
        automatic: true
      });
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Restoration workflow failed`, error);
    ui.notifications.error(error?.message || t("Restoration.Notifications.GenericError"));
  } finally {
    activeActors.delete(actor.uuid);
  }
}

export function initializeRestorationWorkflow() {
  game.socket.on(SOCKET_NAME, handleSocket);
  Hooks.on("dnd5e.preUseActivity", activity => {
    const activityType = getRestorationActivityType(activity);
    if (!activityType) return;
    queueMicrotask(() => void startRestoration(activity, activityType));
    return false;
  });

  game.counterspellPlus = game.counterspellPlus ?? {};
  game.counterspellPlus.startRestorationFromActivity = startRestoration;
  game.counterspellPlus.version = "0.4.1";
  debug("Ready");
}
