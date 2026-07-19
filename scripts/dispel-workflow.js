import { MODULE_ID, RULESETS, SOCKET_NAME } from "./config.js";
import {
  promptDispeller,
  promptDispellerEffects,
  promptGMDispelEffect,
  promptGMDispelReview,
  promptGMDispelSetup
} from "./dispel-dialogs.js";
import {
  applyRollMode,
  bonusRollPart,
  escapeHTML,
  getActivityItem,
  getActorFromUuidSync,
  getItemActor,
  getHomebrewProficiencyMultiplier,
  getPrimaryGM,
  getSpecialMinimum,
  isDispelMagicActivity,
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
  console.debug(`${MODULE_ID} | Dispel Magic |`, ...args);
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
      ui.notifications.warn(t("Dispel.Notifications.RequestTimeout"));
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
  if (!String(message.type).startsWith("dispel-")) return;

  try {
    let result = null;
    switch (message.type) {
      case "dispel-gm-setup":
        if (game.user.isGM) {
          const setup = await promptGMDispelSetup(message.payload.dispeller);
          if (setup) {
            for (let index = 0; index < setup.effectCount; index += 1) {
              const effect = await promptGMDispelEffect(index, setup.effectCount, setup.targetType);
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
      case "dispel-gm-review":
        if (game.user.isGM) {
          result = await promptGMDispelReview(message.payload.dispeller, message.payload.setup);
        }
        break;
      case "dispel-post-defense":
        if (game.user.isGM) {
          await postDefenseSummary(
            message.payload.dispeller,
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
    console.error(`${MODULE_ID} | Dispel Magic remote dialog failed`, error);
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

async function consumeDispelSlot(dispeller) {
  if (dispeller.castingSource === "scroll") return;
  const actor = getActorFromUuidSync(dispeller.actorUuid);
  if (!actor) throw new Error(t("Dispel.Notifications.ActorNotFound"));

  const slot = actor.system?.spells?.[dispeller.slotKey];
  const current = Number(slot?.value ?? 0);
  if (current <= 0) throw new Error(t("Dispel.Notifications.SlotUnavailable"));
  await actor.update({ [`system.spells.${dispeller.slotKey}.value`]: current - 1 });
}

function configuredNumber(setting, fallback) {
  const configured = Number(game.settings.get(MODULE_ID, setting));
  return Number.isFinite(configured) ? configured : fallback;
}

function getHomebrewBase(sourceType) {
  if (sourceType === "scroll") return configuredNumber("dispelScrollDefenseBase", 7);
  if (sourceType === "glyph") return configuredNumber("dispelGlyphDefenseBase", 10);
  return configuredNumber("dispelDefenseBase", 10);
}

function calculateHomebrewDefenses(setup) {
  const countBonus = setup.effects.length > 1 ? setup.effects.length : 0;
  const proficiencyIncluded = usesHomebrewProficiency();
  return setup.effects.map(effect => {
    const base = getHomebrewBase(effect.sourceType);
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

function sourceLabel(sourceType) {
  if (sourceType === "scroll") return t("Dialog.Scroll");
  if (sourceType === "glyph") return t("Dialog.Glyph");
  return t("Dialog.NormalSpell");
}

async function postDefenseSummary(dispeller, setup, defenses) {
  const homebrew = dispeller.ruleset === RULESETS.HOMEBREW;
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
      <div class="counterspell-plus-chat csp-dispel-defense">
        <h3>${t("Dispel.Chat.DefenseTitle")}</h3>
        <table><tbody>${rows}</tbody></table>
      </div>`
  }, setup.defenseRollMode);
  await ChatMessage.create(data);
}

async function postFinalResults(dispeller, setup, results) {
  const totalsVisible = dispeller.rollMode === "publicroll" && setup.defenseRollMode === "publicroll";
  const sourceVisible = setup.defenseRollMode === "publicroll";
  const rows = results.map(result => {
    const status = result.success ? t("Dispel.Chat.Dispelled") : t("Dispel.Chat.Remains");
    const resultClass = result.success ? "success" : "failure";
    const detail = result.automatic
      ? t("Dispel.Chat.Automatic")
      : totalsVisible
        ? tf("Dispel.Chat.NumericResult", { total: result.total, dc: result.dc })
        : t("Dispel.Chat.HiddenResult");
    return `
      <li class="csp-dispel-result ${resultClass}">
        <div><strong>${escapeHTML(result.spellName)}</strong>${sourceVisible ? `<span>${escapeHTML(sourceLabel(result.sourceType))}</span>` : ""}</div>
        <div><strong>${escapeHTML(status)}</strong><span>${escapeHTML(detail)}</span></div>
      </li>`;
  }).join("");
  const tieNote = dispeller.ruleset === RULESETS.HOMEBREW
    ? `<p class="csp-tie-note">${t("Dispel.Chat.TieRule")}</p>`
    : "";

  const data = applyRollMode({
    speaker: speakerFor(null, dispeller.actorName),
    content: `
      <div class="counterspell-plus-chat csp-dispel-results">
        <h3>${escapeHTML(dispeller.itemName)}</h3>
        <p>${tf("Dispel.Chat.TargetSummary", { target: escapeHTML(setup.targetName) })}</p>
        <ul>${rows}</ul>
        ${tieNote}
        <p class="csp-effect-note">${t("Dispel.Chat.ManualRemoval")}</p>
      </div>`
  }, "publicroll");
  await ChatMessage.create(data);
}

async function resolveHomebrew(dispeller, setup) {
  const actor = getActorFromUuidSync(dispeller.actorUuid);
  const bonusPart = bonusRollPart(dispeller.bonusFormula);
  const specialMinimum = dispeller.specialSpellcaster
    ? getSpecialMinimum("dispelSpecialMinimum")
    : undefined;
  const proficiencyMultiplier = getHomebrewProficiencyMultiplier(dispeller.abjurer);
  const proficiencyPart = proficiencyMultiplier === 2
    ? "2 * @prof"
    : proficiencyMultiplier === 1
      ? "@prof"
      : null;
  const parts = ["@slot", "@mod", proficiencyPart, bonusPart].filter(Boolean);
  const roll = await createD20Roll(parts, {
    slot: dispeller.slotLevel,
    mod: dispeller.abilityMod,
    prof: dispeller.proficiency
  }, {
    disadvantage: Boolean(dispeller.disadvantage),
    minimum: specialMinimum
  }).evaluate();

  await postRoll(roll, {
    actor,
    alias: dispeller.actorName,
    flavor: `${tf("Dispel.Chat.HomebrewRoll", { actor: dispeller.actorName })}${specialMinimum ? ` — ${tf("Chat.SpecialMinimum", { minimum: specialMinimum })}` : ""}`,
    rollMode: dispeller.rollMode
  });

  const defenses = calculateHomebrewDefenses(setup);
  const defensePosted = await requestRemote("dispel-post-defense", setup.defenseUserId, {
    dispeller,
    setup,
    defenses
  });
  if (!defensePosted) throw new Error(t("Dispel.Notifications.DefensePostFailed"));
  const results = defenses.map(effect => ({
    ...effect,
    total: roll.total,
    success: roll.total > effect.dc,
    automatic: false
  }));
  await postFinalResults(dispeller, setup, results);
}

async function resolveOfficial2014(dispeller, setup) {
  const actor = getActorFromUuidSync(dispeller.actorUuid);
  const specialMinimum = dispeller.specialSpellcaster
    ? getSpecialMinimum("dispelSpecialMinimum")
    : undefined;
  const defenses = calculateOfficialDefenses(setup);
  const defensePosted = await requestRemote("dispel-post-defense", setup.defenseUserId, {
    dispeller,
    setup,
    defenses
  });
  if (!defensePosted) throw new Error(t("Dispel.Notifications.DefensePostFailed"));
  const results = [];

  for (const effect of defenses) {
    if (dispeller.slotLevel >= effect.spellLevel) {
      results.push({ ...effect, total: null, success: true, automatic: true });
      continue;
    }

    const bonusPart = bonusRollPart(effect.bonusFormula);
    const roll = await createD20Roll(["@mod", bonusPart].filter(Boolean), {
      mod: dispeller.abilityMod
    }, {
      disadvantage: Boolean(dispeller.disadvantage),
      minimum: specialMinimum
    }).evaluate();
    await postRoll(roll, {
      actor,
      alias: dispeller.actorName,
      flavor: `${tf("Dispel.Chat.OfficialRoll", { spell: effect.spellName, dc: effect.dc })}${specialMinimum ? ` — ${tf("Chat.SpecialMinimum", { minimum: specialMinimum })}` : ""}`,
      rollMode: dispeller.rollMode
    });
    results.push({
      ...effect,
      total: roll.total,
      success: roll.total >= effect.dc,
      automatic: false
    });
  }

  await postFinalResults(dispeller, setup, results);
}

function validateBonuses(dispeller, setup) {
  if (dispeller.ruleset === RULESETS.HOMEBREW) {
    return validateBonusFormula(dispeller.bonusFormula);
  }
  return setup.effects.every(effect => validateBonusFormula(effect.bonusFormula));
}

async function startDispelMagic(activity) {
  const item = getActivityItem(activity);
  const actor = getItemActor(item);
  if (!item || !actor) {
    ui.notifications.error(t("Dispel.Notifications.ActorNotFound"));
    return;
  }
  if (activeActors.has(actor.uuid)) {
    ui.notifications.warn(t("Dispel.Notifications.AlreadyPending"));
    return;
  }

  const gm = getPrimaryGM();
  if (!gm) {
    ui.notifications.error(t("Dispel.Notifications.NoGM"));
    return;
  }

  activeActors.add(actor.uuid);
  try {
    const ruleset = game.settings.get(MODULE_ID, "dispelRuleset");
    let dispeller = await promptDispeller(actor, item, ruleset);
    if (!dispeller) return;

    let setup = await requestRemote("dispel-gm-setup", gm.id, { dispeller });
    if (!setup) {
      ui.notifications.info(t("Dispel.Notifications.CancelledByGM"));
      return;
    }

    setup = await promptDispellerEffects(dispeller, setup);
    if (!setup) {
      ui.notifications.info(t("Dispel.Notifications.CancelledByPlayer"));
      return;
    }

    const review = await requestRemote("dispel-gm-review", gm.id, { dispeller, setup });
    if (!review?.dispeller || !review?.setup) {
      ui.notifications.info(t("Dispel.Notifications.CancelledByGM"));
      return;
    }
    dispeller = review.dispeller;
    setup = review.setup;

    if (!validateBonuses(dispeller, setup)) {
      ui.notifications.error(t("Notifications.InvalidBonusFormula"));
      return;
    }

    await consumeDispelSlot(dispeller);
    if (ruleset === RULESETS.OFFICIAL_2014) {
      await resolveOfficial2014(dispeller, setup);
    } else {
      await resolveHomebrew(dispeller, setup);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Dispel Magic workflow failed`, error);
    ui.notifications.error(error?.message || t("Dispel.Notifications.GenericError"));
  } finally {
    activeActors.delete(actor.uuid);
  }
}

export function initializeDispelWorkflow() {
  game.socket.on(SOCKET_NAME, handleSocket);
  Hooks.on("dnd5e.preUseActivity", activity => {
    if (!isDispelMagicActivity(activity)) return;
    queueMicrotask(() => void startDispelMagic(activity));
    return false;
  });

  game.counterspellPlus = game.counterspellPlus ?? {};
  game.counterspellPlus.startDispelFromActivity = startDispelMagic;
  game.counterspellPlus.version = "0.3.3";
  debug("Ready");
}
