export const RESTORATION_EFFECTS = Object.freeze({
  DISEASE: "disease",
  BLINDED: "blinded",
  DEAFENED: "deafened",
  FRIGHTENED: "frightened",
  PARALYZED: "paralyzed",
  POISONED: "poisoned",
  CHARMED: "charmed",
  EXHAUSTION: "exhaustion",
  ABILITY_REDUCTION: "abilityReduction",
  HP_MAX_REDUCTION: "hpMaxReduction",
  PETRIFIED: "petrified",
  CURSE: "curse",
  CURSED_ATTUNEMENT: "cursedAttunement"
});

export const ITEM_RARITIES = Object.freeze([
  { id: "common", value: 1 },
  { id: "uncommon", value: 2 },
  { id: "rare", value: 3 },
  { id: "veryRare", value: 5 },
  { id: "legendary", value: 6 },
  { id: "artifact", value: 8 }
]);

const OFFICIAL_LESSER = Object.freeze([
  RESTORATION_EFFECTS.DISEASE,
  RESTORATION_EFFECTS.BLINDED,
  RESTORATION_EFFECTS.DEAFENED,
  RESTORATION_EFFECTS.PARALYZED,
  RESTORATION_EFFECTS.POISONED
]);

const OFFICIAL_GREATER = Object.freeze([
  RESTORATION_EFFECTS.EXHAUSTION,
  RESTORATION_EFFECTS.CHARMED,
  RESTORATION_EFFECTS.PETRIFIED,
  RESTORATION_EFFECTS.CURSE,
  RESTORATION_EFFECTS.CURSED_ATTUNEMENT,
  RESTORATION_EFFECTS.ABILITY_REDUCTION,
  RESTORATION_EFFECTS.HP_MAX_REDUCTION
]);

const HOMEBREW_BY_LEVEL = Object.freeze({
  2: Object.freeze([
    RESTORATION_EFFECTS.DISEASE,
    RESTORATION_EFFECTS.BLINDED,
    RESTORATION_EFFECTS.DEAFENED,
    RESTORATION_EFFECTS.FRIGHTENED,
    RESTORATION_EFFECTS.PARALYZED,
    RESTORATION_EFFECTS.POISONED
  ]),
  3: Object.freeze([
    RESTORATION_EFFECTS.CHARMED,
    RESTORATION_EFFECTS.EXHAUSTION
  ]),
  4: Object.freeze([
    RESTORATION_EFFECTS.ABILITY_REDUCTION,
    RESTORATION_EFFECTS.HP_MAX_REDUCTION
  ]),
  5: Object.freeze([
    RESTORATION_EFFECTS.PETRIFIED,
    RESTORATION_EFFECTS.CURSE,
    RESTORATION_EFFECTS.CURSED_ATTUNEMENT
  ])
});

export function getRestorationTier(activityType, slotLevel) {
  if (activityType === "lesser") return 2;
  if (activityType === "greater") return 5;
  return Math.min(5, Math.max(2, Math.trunc(Number(slotLevel) || 2)));
}

export function getRestorationEffectIds(activityType, slotLevel) {
  if (activityType === "lesser") return [...OFFICIAL_LESSER];
  if (activityType === "greater") return [...OFFICIAL_GREATER];
  return [...(HOMEBREW_BY_LEVEL[getRestorationTier(activityType, slotLevel)] ?? HOMEBREW_BY_LEVEL[2])];
}

export function getRestorationMaterial(activityType, slotLevel) {
  if (activityType === "lesser") return null;
  if (activityType === "greater") return { name: "Diamond Dust", cost: 100, consumed: true };

  const tier = getRestorationTier(activityType, slotLevel);
  const cost = { 3: 10, 4: 50, 5: 100 }[tier];
  return cost ? { name: "Diamond Dust", cost, consumed: true } : null;
}

export function restorationEffectNeedsCheck(activityType, effectId) {
  return activityType === "restoration"
    && [RESTORATION_EFFECTS.CURSE, RESTORATION_EFFECTS.CURSED_ATTUNEMENT].includes(effectId);
}

export function getRarityValue(rarityId) {
  return ITEM_RARITIES.find(rarity => rarity.id === rarityId)?.value ?? 1;
}
