import { MODULE_ID } from "./config.js";
import { getPrimaryGM, getSpecialMinimum, usesHomebrewProficiency } from "./utils.js";

const JOURNAL_FLAG = "rulesReference";
const PAGE_FLAG = "rulesPage";
const CONTENT_VERSION = 2;
const JOURNAL_NAME = "Counterspell PLUS — Rules Reference";

let refreshTimer = null;

function configuredNumber(setting, fallback) {
  const configured = Number(game.settings.get(MODULE_ID, setting));
  return Number.isFinite(configured) ? configured : fallback;
}

function configuration() {
  const dramaticFailureMin = Math.max(1, Math.trunc(configuredNumber("removeCurseDramaticFailureMin", 5)));
  const barelySuccessMax = Math.max(1, Math.trunc(configuredNumber("removeCurseBarelySuccessMax", 5)));
  return {
    includeProficiency: usesHomebrewProficiency(),
    abjurerEnabled: Boolean(game.settings.get(MODULE_ID, "abjurerEnabled")),
    wildMagic: Boolean(game.settings.get(MODULE_ID, "wildMagic")),
    counterspellScrollBase: configuredNumber("scrollDefenseBase", 7),
    counterspellGlyphBase: configuredNumber("glyphDefenseBase", 10),
    dispelSpellBase: configuredNumber("dispelDefenseBase", 10),
    dispelScrollBase: configuredNumber("dispelScrollDefenseBase", 7),
    dispelGlyphBase: configuredNumber("dispelGlyphDefenseBase", 10),
    removeCurseBase: configuredNumber("removeCurseDefenseBase", 10),
    restorationCurseBase: configuredNumber("restorationCurseDefenseBase", 8),
    restorationAttunementBase: configuredNumber("restorationAttunementDefenseBase", 7),
    dramaticFailureMin,
    barelySuccessMax,
    counterspellMinimum: getSpecialMinimum("counterspellSpecialMinimum"),
    dispelMinimum: getSpecialMinimum("dispelSpecialMinimum"),
    removeCurseMinimum: getSpecialMinimum("removeCurseSpecialMinimum"),
    restorationMinimum: getSpecialMinimum("restorationSpecialMinimum")
  };
}

function officialRules(config) {
  return `
    <article class="counterspell-plus-rules">
      <h1>Official 2014 Rules</h1>
      <p class="csp-rules-lead">A player-facing quick reference for Counterspell, Dispel Magic, Remove Curse, Lesser Restoration and Greater Restoration. The resolution notes below describe the <strong>Official D&amp;D 2014</strong> mode available in Counterspell PLUS.</p>

      <section>
        <h2>Counterspell</h2>
        <ol>
          <li><strong>Trigger and target.</strong> Use a reaction when you see a creature within 60 feet casting a spell.</li>
          <li><strong>Choose the Counterspell level.</strong> Normal casting uses an available spell slot. Casting Counterspell from a spell scroll uses the selected scroll level and the scroll author's ability modifier; no character spell slot is consumed.</li>
          <li><strong>Automatic interruption.</strong> If the Counterspell level is equal to or higher than the target spell level, the target spell is countered automatically.</li>
          <li><strong>Ability check.</strong> If the target spell is higher, roll against <code>DC 10 + target spell level</code>.</li>
        </ol>
        <div class="csp-rules-formula">1d20 + spellcasting ability modifier + optional dice<br><strong>vs.</strong> DC 10 + target spell level</div>
        <ul>
          <li>Meeting the DC succeeds.</li>
          <li>Proficiency is not added in Official 2014 mode.</li>
          <li>Declared disadvantage and optional dice are applied to the check.</li>
          <li>Special Spellcaster uses a minimum kept d20 result of <strong>${config.counterspellMinimum}</strong>.</li>
        </ul>
      </section>

      <section>
        <h2>Dispel Magic</h2>
        <ol>
          <li><strong>Choose the target.</strong> Select a creature, object or magical effect within 120 feet.</li>
          <li><strong>List every affected spell.</strong> Each spell effect is resolved separately.</li>
          <li><strong>Automatic dispel.</strong> An effect ends automatically when its spell level is equal to or lower than the Dispel Magic level.</li>
          <li><strong>Higher-level effects.</strong> Make a separate spellcasting ability check for every higher-level effect.</li>
        </ol>
        <div class="csp-rules-formula">1d20 + spellcasting ability modifier + optional dice for that effect<br><strong>vs.</strong> DC 10 + effect level</div>
        <ul>
          <li>Meeting the DC succeeds. Proficiency is not added.</li>
          <li>Different optional dice may be entered for different effects.</li>
          <li>The selected roll mode and disadvantage apply to every required check.</li>
          <li>Special Spellcaster uses a minimum kept d20 result of <strong>${config.dispelMinimum}</strong>.</li>
          <li>The module identifies effects to remove; the GM removes them manually.</li>
        </ul>
      </section>

      <section>
        <h2>Remove Curse</h2>
        <h3>Official spell rule</h3>
        <ul>
          <li>Use an action to touch one creature or object.</li>
          <li>All curses affecting the touched creature or object end.</li>
          <li>If the object is a cursed magic item, the curse remains on the item, but the spell breaks the owner's attunement so the item can be removed or discarded.</li>
          <li>The official spell does not require an ability check and has no higher-level scaling.</li>
        </ul>
        <div class="csp-rules-note"><strong>Counterspell PLUS campaign procedure:</strong> as requested for this module, its Official 2014 workflow resolves Remove Curse with the same level-based, per-curse procedure as Dispel Magic. A curse at or below the Remove Curse level is removed automatically; each higher-level curse uses a separate <code>1d20 + ability modifier + optional dice</code> check against <code>DC 10 + curse level</code>. Special Cursecaster uses a minimum kept d20 result of <strong>${config.removeCurseMinimum}</strong>.</div>
      </section>

      <section>
        <h2>Lesser Restoration</h2>
        <ul>
          <li>Cast at 2nd level or higher and choose exactly one option: one disease, Blinded, Deafened, Paralyzed or Poisoned.</li>
          <li>The chosen disease or condition ends automatically; no ability check is made.</li>
          <li>There is no priced material component.</li>
        </ul>

        <h2>Greater Restoration</h2>
        <ul>
          <li>Cast at 5th level or higher and choose exactly one option: one level of Exhaustion, Charmed, Petrified, one curse, attunement to a cursed item, one Ability Score reduction, or Hit Point Maximum reduction.</li>
          <li>The selected effect ends automatically; no ability check is made.</li>
          <li>The material is <strong>Diamond Dust worth 100 gp</strong>, consumed by the spell. Counterspell PLUS shows this requirement but never removes inventory.</li>
        </ul>
        <div class="csp-rules-note">The effect list belongs to the selected spell. Casting from a scroll uses the scroll level and consumes no character spell slot; scroll inventory remains manual.</div>
      </section>

      <section>
        <h2>Shared module procedure</h2>
        <ol>
          <li>The caster selects normal or scroll casting, spellcasting ability, casting level, roll mode, optional dice and disadvantage.</li>
          <li>The GM selects the target, enters hidden effect data and reviews every declaration.</li>
          <li>A normal spell slot is consumed only after final GM approval. Scroll inventory is handled manually.</li>
          <li>Public, Private GM and Blind GM rolls are respected. Hidden values remain hidden, while the final success or failure is public.</li>
          <li>Natural 20 and natural 1 receive normal D&amp;D5e colors when visible, but they are not automatic success or failure unless the rule's total says so.</li>
        </ol>
      </section>

      <p class="csp-rules-source">This page is a concise play aid. Consult the 2014 spell descriptions and your GM for the complete rules and table rulings.</p>
    </article>`;
}

function homebrewRules(config) {
  const proficiencyState = config.includeProficiency ? "included" : "not included";
  const abjurerState = config.abjurerEnabled ? "available" : "disabled";
  const wildMagicState = config.wildMagic ? "enabled" : "disabled";
  const ordinaryMultiplier = config.includeProficiency ? 1 : 0;
  const abjurerMultiplier = ordinaryMultiplier + 1;
  return `
    <article class="counterspell-plus-rules">
      <h1>Homebrew Rules</h1>
      <p class="csp-rules-lead">The complete Counterspell PLUS homebrew reference for Counterspell, Dispel Magic, Remove Curse and Restoration. Numerical values shown here reflect the current world settings.</p>

      <section>
        <h2>Shared caster rules</h2>
        <table>
          <thead><tr><th>World option</th><th>Current value</th></tr></thead>
          <tbody>
            <tr><td>Proficiency in homebrew calculations</td><td><strong>${proficiencyState}</strong></td></tr>
            <tr><td>Abjurer declaration</td><td><strong>${abjurerState}</strong></td></tr>
            <tr><td>Counterspell against Counterspell — Wild Magic reminder</td><td><strong>${wildMagicState}</strong></td></tr>
          </tbody>
        </table>
        <ul>
          <li>An ordinary caster adds <strong>${ordinaryMultiplier}× proficiency</strong> to their homebrew caster roll.</li>
          <li>When the Abjurer option is available and confirmed by the GM, an Abjurer adds <strong>${abjurerMultiplier}× proficiency</strong> to their caster roll.</li>
          <li>Abjurer changes only the caster's Counterspell, Dispel Magic, Remove Curse or Restoration roll. It does not change the opposing spell roll or a passive defense DC.</li>
          <li>When one of these spells is cast from a scroll, its level, ability modifier and proficiency come from the scroll author. No character spell slot is consumed, and the scroll item is removed manually.</li>
          <li>Optional dice, disadvantage and roll visibility are selected by the appropriate participant and remain editable by the GM.</li>
        </ul>
      </section>

      <section>
        <h2>Counterspell</h2>
        <h3>Against a normal spell</h3>
        <p>Both sides roll. The original spell wins a tie, so Counterspell must have a <strong>strictly higher</strong> total.</p>
        <div class="csp-rules-formula"><strong>Counterspell:</strong> 1d20 + Counterspell level + ability modifier + caster proficiency + optional dice<br><strong>Original spell:</strong> 1d20 + spell level + ability modifier + normal proficiency + optional dice</div>
        <ul>
          <li>Knowing the normal target spell grants advantage, except when the target spell is another Counterspell.</li>
          <li>Each rolling side can declare disadvantage separately. Advantage and disadvantage cancel each other.</li>
          <li>Special Spellcaster uses a minimum kept d20 result of <strong>${config.counterspellMinimum}</strong>.</li>
        </ul>

        <h3>Against a spell scroll or Spell Glyph</h3>
        <p>The target does not roll. It uses a fixed defense:</p>
        <div class="csp-rules-formula"><strong>Scroll DC:</strong> ${config.counterspellScrollBase} + spell level + creator modifier + normal creator proficiency<br><strong>Glyph DC:</strong> ${config.counterspellGlyphBase} + stored spell level + creator modifier + normal creator proficiency</div>
        <ul>
          <li>Knowing the stored spell reduces its fixed DC by 5 instead of granting advantage.</li>
          <li>The creator's proficiency is included only when the shared proficiency setting is enabled.</li>
          <li>Counterspelling another Counterspell posts a Wild Magic reminder when that world option is enabled. The GM determines the effect.</li>
        </ul>
      </section>

      <section>
        <h2>Dispel Magic</h2>
        <p>The caster rolls once, then the same total is compared with every effect on the selected target.</p>
        <div class="csp-rules-formula">1d20 + Dispel Magic level + ability modifier + caster proficiency + optional dice</div>
        <p>Every effect has its own passive defense:</p>
        <div class="csp-rules-formula">source base + effect level + original caster/creator modifier + normal original proficiency + multiple-effect bonus − knowledge reduction</div>
        <table>
          <thead><tr><th>Effect source</th><th>Current base</th></tr></thead>
          <tbody>
            <tr><td>Normal Spell</td><td>${config.dispelSpellBase}</td></tr>
            <tr><td>Spell Scroll</td><td>${config.dispelScrollBase}</td></tr>
            <tr><td>Spell Glyph</td><td>${config.dispelGlyphBase}</td></tr>
          </tbody>
        </table>
        <ul>
          <li>With one effect, the multiple-effect bonus is 0. With two or more effects, add the total number of effects to every DC.</li>
          <li>Knowing an individual effect reduces only that effect's DC by 5.</li>
          <li>The original caster or creator proficiency is included only when the shared proficiency setting is enabled.</li>
          <li>The Dispel Magic result must be <strong>strictly higher</strong> than an effect's DC. A tie leaves that effect in place.</li>
          <li>Special Spellcaster uses a minimum kept d20 result of <strong>${config.dispelMinimum}</strong>.</li>
          <li>The module reports which effects should be removed but never deletes them automatically.</li>
        </ul>
      </section>

      <section>
        <h2>Remove Curse</h2>
        <p>Remove Curse follows the Dispel Magic homebrew structure. The caster rolls once and compares that total with every curse. The target merely identifies the cursed creature or object; each curse has separate creator/caster values entered and confirmed by the GM.</p>
        <div class="csp-rules-formula"><strong>Remove Curse roll:</strong> 1d20 + Remove Curse level + ability modifier + caster proficiency + optional dice<br><strong>Each curse DC:</strong> ${config.removeCurseBase} + curse level + curse caster/creator modifier + normal curse proficiency + multiple-curse bonus − knowledge reduction</div>
        <ul>
          <li>Remove Curse offers only the <strong>Curse</strong> affected-source type. A scroll may still be used to cast Remove Curse itself.</li>
          <li>With one curse, the multiple-curse bonus is 0. With two or more curses, add the total number of curses to every DC.</li>
          <li>Knowing an individual curse reduces only that curse's DC by 5.</li>
          <li>The result must be strictly higher than the curse DC. A tie is a failure.</li>
          <li>Special Cursecaster uses a minimum kept d20 result of <strong>${config.removeCurseMinimum}</strong>.</li>
        </ul>

        <h3>Curse-removal outcome cards</h3>
        <table>
          <thead><tr><th>Margin</th><th>Outcome</th><th>Result</th></tr></thead>
          <tbody>
            <tr><td>Failure by ${config.dramaticFailureMin} or more</td><td>Dramatic Curse Removal Failure</td><td>The curse remains and significant complications occur. The GM determines the effect.</td></tr>
            <tr><td>Failure by 0–${config.dramaticFailureMin - 1}</td><td>Failed Curse Removal</td><td>The curse remains and minor complications occur. The GM determines the effect.</td></tr>
            <tr><td>Success by 1–${config.barelySuccessMax}</td><td>Barely Successful Curse Removal</td><td>The curse ends, but minor complications occur. The GM determines the effect.</td></tr>
            <tr><td>Success by ${config.barelySuccessMax + 1} or more</td><td>Successful Curse Removal</td><td>The curse ends without negative effects.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Restoration</h2>
        <p>Restoration uses separate, non-cumulative effect lists for each casting tier. A 5th-level casting does not offer the effects from levels 2–4.</p>
        <table>
          <thead><tr><th>Cast level</th><th>Diamond Dust</th><th>Choose one effect</th></tr></thead>
          <tbody>
            <tr><td>2nd</td><td>None</td><td>One disease; Blinded; Deafened; Frightened; Paralyzed; Poisoned</td></tr>
            <tr><td>3rd</td><td>10 gp</td><td>Charmed; one level of Exhaustion</td></tr>
            <tr><td>4th</td><td>50 gp</td><td>Reduction to one Ability Score; Hit Point Maximum Reduction</td></tr>
            <tr><td>5th or higher</td><td>100 gp</td><td>Petrified; One Curse; Attunement to a Cursed Item</td></tr>
          </tbody>
        </table>
        <p>The displayed Diamond Dust is consumed by the spell under the described rule, but the module treats the component as information only and never edits inventory.</p>

        <h3>Automatic options</h3>
        <p>Every listed option is automatic except <strong>One Curse</strong> and <strong>Attunement to a Cursed Item</strong>. Petrified requires no roll.</p>

        <h3>One Curse</h3>
        <div class="csp-rules-formula"><strong>Restoration roll:</strong> 1d20 + Restoration level + ability modifier + caster proficiency + optional dice<br><strong>Curse DC:</strong> ${config.restorationCurseBase} + curse level + curse ability modifier + normal curse proficiency − 5 if known</div>
        <ul>
          <li>The result must be strictly higher than the DC; a tie is a failure.</li>
          <li>Special Spellcaster uses a minimum kept d20 result of <strong>${config.restorationMinimum}</strong>.</li>
          <li>The shared proficiency, Abjurer, scroll-author, disadvantage, bonus-dice and roll-mode rules all apply.</li>
          <li>One Curse uses the same four complication bands as Remove Curse: dramatic failure at ${config.dramaticFailureMin} or more below DC; ordinary failure through a tie; barely successful at 1–${config.barelySuccessMax} above DC; full success at ${config.barelySuccessMax + 1} or more above DC.</li>
        </ul>

        <h3>Attunement to a Cursed Item</h3>
        <div class="csp-rules-formula"><strong>Restoration roll:</strong> 1d20 + Restoration level + ability modifier + caster proficiency + optional dice<br><strong>Item DC:</strong> ${config.restorationAttunementBase} + curse level + rarity modifier + normal curse proficiency − 5 if known</div>
        <table>
          <thead><tr><th>Rarity</th><th>Modifier</th></tr></thead>
          <tbody>
            <tr><td>Common</td><td>1</td></tr>
            <tr><td>Uncommon</td><td>2</td></tr>
            <tr><td>Rare</td><td>3</td></tr>
            <tr><td>Very Rare</td><td>5</td></tr>
            <tr><td>Legendary</td><td>6</td></tr>
            <tr><td>Artifact</td><td>8</td></tr>
          </tbody>
        </table>
        <ul>
          <li>Rarity replaces the curse ability modifier; target statistics are never used.</li>
          <li>The test inherits the same caster options and strict tie rule as One Curse.</li>
          <li>This option posts only <strong>Success</strong> or <strong>Failure</strong>. It never posts the four complication outcome cards.</li>
        </ul>
      </section>

      <section>
        <h2>Roll presentation and GM control</h2>
        <ul>
          <li>Players choose Public Roll, Private GM Roll or Blind GM Roll for their side. The GM reviews the declarations before rolling.</li>
          <li>A Blind GM defense hides spell or curse levels and numerical defense data from the player while still publishing the final outcome.</li>
          <li>Visible natural 20 and natural 1 results use the standard D&amp;D5e colors. They are visual highlights only and do not override the compared totals.</li>
          <li>Dice So Nice is used for actual d20 rolls. Fixed Scroll and Glyph defenses do not roll a d20.</li>
        </ul>
      </section>
    </article>`;
}

function pageDefinitions(config) {
  return [
    {
      key: "official",
      name: "Official Rules — Counterspell, Dispel Magic, Remove Curse & Restoration",
      sort: 100000,
      content: officialRules(config)
    },
    {
      key: "homebrew",
      name: "Homebrew Rules — Counterspell, Dispel Magic, Remove Curse & Restoration",
      sort: 200000,
      content: homebrewRules(config)
    }
  ];
}

function configurationSignature(config) {
  return JSON.stringify(config);
}

function pageData(definition, signature) {
  return {
    name: definition.name,
    type: "text",
    sort: definition.sort,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    text: {
      content: definition.content,
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
    },
    flags: {
      [MODULE_ID]: {
        [PAGE_FLAG]: definition.key,
        contentVersion: CONTENT_VERSION,
        configurationSignature: signature
      }
    }
  };
}

function isPrimaryGM() {
  return game.user.isGM && getPrimaryGM()?.id === game.user.id;
}

export async function ensureRulesJournal() {
  if (!isPrimaryGM()) return null;

  const config = configuration();
  const signature = configurationSignature(config);
  const definitions = pageDefinitions(config);
  let journal = game.journal.find(entry => entry.getFlag(MODULE_ID, JOURNAL_FLAG));

  if (!journal) {
    journal = await JournalEntry.create({
      name: JOURNAL_NAME,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: {
        [MODULE_ID]: {
          [JOURNAL_FLAG]: true,
          contentVersion: CONTENT_VERSION
        }
      }
    });
    if (!journal) return null;
  }

  const missing = [];
  for (const definition of definitions) {
    const existing = journal.pages.find(page => page.getFlag(MODULE_ID, PAGE_FLAG) === definition.key);
    if (!existing) {
      missing.push(pageData(definition, signature));
      continue;
    }

    const currentVersion = Number(existing.getFlag(MODULE_ID, "contentVersion") ?? 0);
    const currentSignature = String(existing.getFlag(MODULE_ID, "configurationSignature") ?? "");
    if (currentVersion === CONTENT_VERSION && currentSignature === signature) continue;
    await existing.update(pageData(definition, signature));
  }

  if (missing.length) await journal.createEmbeddedDocuments("JournalEntryPage", missing);
  if (Number(journal.getFlag(MODULE_ID, "contentVersion") ?? 0) !== CONTENT_VERSION) {
    await journal.setFlag(MODULE_ID, "contentVersion", CONTENT_VERSION);
  }
  return journal;
}

function scheduleJournalRefresh() {
  if (!isPrimaryGM()) return;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void ensureRulesJournal().catch(error => {
      console.error(`${MODULE_ID} | Rules journal refresh failed`, error);
    });
  }, 250);
}

export function initializeRulesJournal() {
  void ensureRulesJournal().catch(error => {
    console.error(`${MODULE_ID} | Rules journal creation failed`, error);
  });

  Hooks.on("updateSetting", setting => {
    if (!String(setting?.key ?? "").startsWith(`${MODULE_ID}.`)) return;
    scheduleJournalRefresh();
  });
}
