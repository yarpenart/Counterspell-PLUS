import { MODULE_ID, RULESETS, SOCKET_NAME } from "./config.js";
import {
  promptCurseRemover,
  promptCurseRemoverEffects,
  promptGMRemoveCurseEffect,
  promptGMRemoveCurseReview,
  promptGMRemoveCurseSetup
} from "./remove-curse-dialogs.js";
import {
  applyRollMode,
  bonusRollPart,
  escapeHTML,
  getActivityItem,
  getActorFromUuidSync,
  getItemActor,
  getPrimaryGM,
  getSpecialMinimum,
  isRemoveCurseActivity,
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
  console.debug(`${MODULE_ID} | Remove Curse |`, ...args);
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
      ui.notifications.warn(t("RemoveCurse.Notifications.RequestTimeout"));
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
  if (!String(message.type).startsWith("remove-curse-")) return;

  try {
    let result = null;
    switch (message.type) {
      case "remove-curse-gm-setup":
        if (game.user.isGM) {
          const setup = await promptGMRemoveCurseSetup(message.payload.remover);
          if (setup) {
            for (let index = 0; index < setup.effectCount; index += 1) {
              const effect = await promptGMRemoveCurseEffect(index, setup.effectCount, setup.targetType);
              if (!effect) {
                result = null;
                break;
              }
              setup.effects.push(effect);
            }
            if (setup.effects.length === setup.effectCount) result = setup;
          }
        }
        break;
      case "remove-curse-gm-review":
        if (game.user.isGM) {
          result = await promptGMRemoveCurseReview(message.payload.remover, message.payload.setup);
        }
        break;
      case "remove-curse-post-defense":
        if (game.user.isGM) {
          await postDefenseSummary(
            message.payload.remover,
            message.payload.setup,
            message.payload.defenses
          );
          result = true;
        }
        break;
      default:
        debug("Unknown socket message", message.type);
    }
    await answerRequest(message, result);
  } catch (error) {
    console.error(`${MODULE_ID} | Remove Curse remote dialog failed`, error);
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

async function consumeRemoveCurseSlot(remover) {
  if (remover.castingSource === "scroll") return;
  const actor = getActorFromUuidSync(remover.actorUuid);
  if (!actor) throw new Error(t("RemoveCurse.Notifications.ActorNotFound"));

  const slot = actor.system?.spells?.[remover.slotKey];
  const current = Number(slot?.value ?? 0);
  if (current <= 0) throw new Error(t("RemoveCurse.Notifications.SlotUnavailable"));
  await actor.update({ [`system.spells.${remover.slotKey}.value`]: current - 1 });
}

function configuredNumber(setting, fallback) {
  const configured = Number(game.settings.get(MODULE_ID, setting));
  return Number.isFinite(configured) ? configured : fallback;
}

function getHomebrewBase() {
  return configuredNumber("removeCurseDefenseBase", 10);
}

function calculateHomebrewDefenses(setup) {
  const countBonus = setup.effects.length > 1 ? setup.effects.length : 0;
  const proficiencyIncluded = usesHomebrewProficiency();
  return setup.effects.map(effect => {
    const base = getHomebrewBase();
    const knownReduction = effect.known ? 5 : 0;
    const dc = base
      + Number(effect.spellLevel)
      + Number(effect.casterMod)
      + (proficiencyIncluded ? Number(effect.casterProf) : 0)
      + countBonus
      - knownReduction;
    return { ...effect, base, countBonus, knownReduction, proficiencyIncluded, dc };
  });
}

function calculateOfficialDefenses(setup) {
  return setup.effects.map(effect => ({
    ...effect,
    base: 10,
    countBonus: 0,
    knownReduction: 0,
    dc: 10 + Number(effect.spellLevel)
  }));
}

function sourceLabel() {
  return t("RemoveCurse.Dialog.CurseSource");
}

async function postDefenseSummary(remover, setup, defenses) {
  const homebrew = remover.ruleset === RULESETS.HOMEBREW;
  const rows = defenses.map(effect => {
    const formula = homebrew
      ? `${effect.base} + ${effect.spellLevel} + ${effect.casterMod}${effect.proficiencyIncluded ? ` + ${effect.casterProf}` : ""}${effect.countBonus ? ` + ${effect.countBonus}` : ""}${effect.knownReduction ? ` - ${effect.knownReduction}` : ""}`
      : `10 + ${effect.spellLevel}`;
    return `
      <tr>
        <td><strong>${escapeHTML(effect.spellName)}</strong><br><small>${escapeHTML(sourceLabel(effect.sourceType))}</small></td>
        <td class="csp-formula">${formula} = <strong>${effect.dc}</strong></td>
      </tr>`;
  }).join("");

  const data = applyRollMode({
    speaker: speakerFor(null, setup.targetName),
    content: `
      <div class="counterspell-plus-chat csp-remove-curse-defense">
        <h3>${t("RemoveCurse.Chat.DefenseTitle")}</h3>
        <table><tbody>${rows}</tbody></table>
      </div>`
  }, setup.defenseRollMode);
  await ChatMessage.create(data);
}

async function postFinalResults(remover, setup, results) {
  const totalsVisible = remover.rollMode === "publicroll" && setup.defenseRollMode === "publicroll";
  const sourceVisible = setup.defenseRollMode === "publicroll";
  const rows = results.map(result => {
    const status = result.success ? t("RemoveCurse.Chat.Dispelled") : t("RemoveCurse.Chat.Remains");
    const resultClass = result.success ? "success" : "failure";
    const detail = result.automatic
      ? t("RemoveCurse.Chat.Automatic")
      : totalsVisible
        ? tf("RemoveCurse.Chat.NumericResult", { total: result.total, dc: result.dc })
        : t("RemoveCurse.Chat.HiddenResult");
    return `
      <li class="csp-remove-curse-result ${resultClass}">
        <div><strong>${escapeHTML(result.spellName)}</strong>${sourceVisible ? `<span>${escapeHTML(sourceLabel(result.sourceType))}</span>` : ""}</div>
        <div><strong>${escapeHTML(status)}</strong><span>${escapeHTML(detail)}</span></div>
      </li>`;
  }).join("");
  const tieNote = remover.ruleset === RULESETS.HOMEBREW
    ? `<p class="csp-tie-note">${t("RemoveCurse.Chat.TieRule")}</p>`
    : "";

  const data = applyRollMode({
    speaker: speakerFor(null, remover.actorName),
    content: `
      <div class="counterspell-plus-chat csp-remove-curse-results">
        <h3>${escapeHTML(remover.itemName)}</h3>
        <p>${tf("RemoveCurse.Chat.TargetSummary", { target: escapeHTML(setup.targetName) })}</p>
        <ul>${rows}</ul>
        ${tieNote}
        <p class="csp-effect-note">${t("RemoveCurse.Chat.ManualRemoval")}</p>
      </div>`
  }, "publicroll");
  await ChatMessage.create(data);
}

export function getOutcomeThresholds() {
  const configuredDramaticMin = Math.max(1, Math.trunc(configuredNumber("removeCurseDramaticFailureMin", 5)));
  const configuredFailureMax = Math.max(0, Math.trunc(configuredNumber("removeCurseFailureMax", 4)));
  const configuredBarelyMax = Math.max(1, Math.trunc(configuredNumber("removeCurseBarelySuccessMax", 5)));
  const configuredSuccessMin = Math.max(2, Math.trunc(configuredNumber("removeCurseSuccessMin", 6)));
  const dramaticFailureMin = Math.max(configuredDramaticMin, configuredFailureMax + 1);
  const successMin = Math.max(configuredSuccessMin, configuredBarelyMax + 1);
  return {
    dramaticFailureMin,
    failureMax: dramaticFailureMin - 1,
    barelySuccessMax: successMin - 1,
    successMin
  };
}

export function getCurseOutcome(result, thresholds) {
  const margin = Number(result.total) - Number(result.dc);
  if (margin <= -thresholds.dramaticFailureMin) {
    return {
      className: "dramatic-failure",
      title: t("RemoveCurse.Outcome.DramaticFailure.Title"),
      body: tf("RemoveCurse.Outcome.DramaticFailure.Body", { minimum: thresholds.dramaticFailureMin })
    };
  }
  if (margin <= 0) {
    return {
      className: "failure",
      title: t("RemoveCurse.Outcome.Failure.Title"),
      body: tf("RemoveCurse.Outcome.Failure.Body", { minimum: 0, maximum: thresholds.failureMax })
    };
  }
  if (margin <= thresholds.barelySuccessMax) {
    return {
      className: "barely-success",
      title: t("RemoveCurse.Outcome.BarelySuccess.Title"),
      body: tf("RemoveCurse.Outcome.BarelySuccess.Body", { minimum: 1, maximum: thresholds.barelySuccessMax })
    };
  }
  return {
    className: "success",
    title: t("RemoveCurse.Outcome.Success.Title"),
    body: tf("RemoveCurse.Outcome.Success.Body", { minimum: thresholds.successMin })
  };
}

async function postHomebrewOutcomes(remover, setup, results) {
  const thresholds = getOutcomeThresholds();
  for (const result of results) {
    const outcome = getCurseOutcome(result, thresholds);
    await ChatMessage.create(applyRollMode({
      speaker: speakerFor(null, remover.actorName),
      content: `
        <div class="counterspell-plus-chat csp-curse-outcome ${outcome.className}">
          <h3>${escapeHTML(outcome.title)}</h3>
          <p class="csp-curse-name">${escapeHTML(result.spellName)}</p>
          <p>${escapeHTML(outcome.body)}</p>
        </div>`
    }, "publicroll"));
  }
}

async function resolveHomebrew(remover, setup) {
  const actor = getActorFromUuidSync(remover.actorUuid);
  const bonusPart = bonusRollPart(remover.bonusFormula);
  const specialMinimum = remover.specialSpellcaster
    ? getSpecialMinimum("removeCurseSpecialMinimum")
    : undefined;
  const parts = ["@slot", "@mod", usesHomebrewProficiency() ? "@prof" : null, bonusPart].filter(Boolean);
  const roll = await createD20Roll(parts, {
    slot: remover.slotLevel,
    mod: remover.abilityMod,
    prof: remover.proficiency
  }, {
    disadvantage: Boolean(remover.disadvantage),
    minimum: specialMinimum
  }).evaluate();

  await postRoll(roll, {
    actor,
    alias: remover.actorName,
    flavor: `${tf("RemoveCurse.Chat.HomebrewRoll", { actor: remover.actorName })}${specialMinimum ? ` — ${tf("Chat.SpecialMinimum", { minimum: specialMinimum })}` : ""}`,
    rollMode: remover.rollMode
  });

  const defenses = calculateHomebrewDefenses(setup);
  const defensePosted = await requestRemote("remove-curse-post-defense", setup.defenseUserId, {
    remover,
    setup,
    defenses
  });
  if (!defensePosted) throw new Error(t("RemoveCurse.Notifications.DefensePostFailed"));
  const results = defenses.map(effect => ({
    ...effect,
    total: roll.total,
    success: roll.total > effect.dc,
    automatic: false
  }));
  await postFinalResults(remover, setup, results);
  await postHomebrewOutcomes(remover, setup, results);
}

async function resolveOfficial2014(remover, setup) {
  const actor = getActorFromUuidSync(remover.actorUuid);
  const specialMinimum = remover.specialSpellcaster
    ? getSpecialMinimum("removeCurseSpecialMinimum")
    : undefined;
  const defenses = calculateOfficialDefenses(setup);
  const defensePosted = await requestRemote("remove-curse-post-defense", setup.defenseUserId, {
    remover,
    setup,
    defenses
  });
  if (!defensePosted) throw new Error(t("RemoveCurse.Notifications.DefensePostFailed"));
  const results = [];

  for (const effect of defenses) {
    if (remover.slotLevel >= effect.spellLevel) {
      results.push({ ...effect, total: null, success: true, automatic: true });
      continue;
    }

    const bonusPart = bonusRollPart(effect.bonusFormula);
    const roll = await createD20Roll(["@mod", bonusPart].filter(Boolean), {
      mod: remover.abilityMod
    }, {
      disadvantage: Boolean(remover.disadvantage),
      minimum: specialMinimum
    }).evaluate();
    await postRoll(roll, {
      actor,
      alias: remover.actorName,
      flavor: `${tf("RemoveCurse.Chat.OfficialRoll", { curse: effect.spellName, dc: effect.dc })}${specialMinimum ? ` — ${tf("Chat.SpecialMinimum", { minimum: specialMinimum })}` : ""}`,
      rollMode: remover.rollMode
    });
    results.push({
      ...effect,
      total: roll.total,
      success: roll.total >= effect.dc,
      automatic: false
    });
  }

  await postFinalResults(remover, setup, results);
}

function validateBonuses(remover, setup) {
  if (remover.ruleset === RULESETS.HOMEBREW) {
    return validateBonusFormula(remover.bonusFormula);
  }
  return setup.effects.every(effect => validateBonusFormula(effect.bonusFormula));
}

async function startRemoveCurse(activity) {
  const item = getActivityItem(activity);
  const actor = getItemActor(item);
  if (!item || !actor) {
    ui.notifications.error(t("RemoveCurse.Notifications.ActorNotFound"));
    return;
  }
  if (activeActors.has(actor.uuid)) {
    ui.notifications.warn(t("RemoveCurse.Notifications.AlreadyPending"));
    return;
  }

  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.error(t("RemoveCurse.Notifications.NoGM"));
    return;
  }

  activeActors.add(actor.uuid);
  try {
    const ruleset = game.settings.get(MODULE_ID, "removeCurseRuleset");
    let remover = await promptCurseRemover(actor, item, ruleset);
    if (!remover) return;

    let setup = await requestRemote("remove-curse-gm-setup", gm.id, { remover });
    if (!setup) {
      ui.notifications.info(t("RemoveCurse.Notifications.CancelledByGM"));
      return;
    }

    setup = await promptCurseRemoverEffects(remover, setup);
    if (!setup) {
      ui.notifications.info(t("RemoveCurse.Notifications.CancelledByPlayer"));
      return;
    }

    const review = await requestRemote("remove-curse-gm-review", gm.id, { remover, setup });
    if (!review?.remover || !review?.setup) {
      ui.notifications.info(t("RemoveCurse.Notifications.CancelledByGM"));
      return;
    }
    remover = review.remover;
    setup = review.setup;

    if (!validateBonuses(remover, setup)) {
      ui.notifications.error(t("Notifications.InvalidBonusFormula"));
      return;
    }

    await consumeRemoveCurseSlot(remover);
    if (ruleset === RULESETS.OFFICIAL_2014) {
      await resolveOfficial2014(remover, setup);
    } else {
      await resolveHomebrew(remover, setup);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Remove Curse workflow failed`, error);
    ui.notifications.error(error?.message || t("RemoveCurse.Notifications.GenericError"));
  } finally {
    activeActors.delete(actor.uuid);
  }
}

export function initializeRemoveCurseWorkflow() {
  game.socket.on(SOCKET_NAME, handleSocket);
  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!isRemoveCurseActivity(activity)) return;
    queueMicrotask(() => void startRemoveCurse(activity));
    return false;
  });

  game.counterspellPlus = game.counterspellPlus ?? {};
  game.counterspellPlus.startRemoveCurseFromActivity = startRemoveCurse;
  game.counterspellPlus.version = "0.3.1";
  debug("Ready");
}
