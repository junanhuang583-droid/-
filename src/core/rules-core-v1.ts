export const RULES_CORE_V1 = {
  startingHeroHealth: 80,
  startingHandSize: 8,
  normalDrawPerTurn: 4,
  secondPlayerFirstDraw: 5,
  normalBoardSlots: 5,
  normalSummonsPerTurn: 1,
  startingSuperEvolutionStonesPerPlayer: 1,
  secondPlayerExtraNormalEvolutionStones: 1,
  handLimit: null,
  fatigueDamage: false,
  attackFloor: 0,
  normalMinionAttacksPerTurn: 1,
  fastAttackAttacksPerTurn: 2,
  normalMinionCanAttackOnSummonTurn: false,
  hasteCanAttackOnSummonTurn: true,
  evolutionConsumesNormalSummon: false,
  sacrificeCountsAsDeath: true,
  evolutionCountsAsDeath: null,
  evolutionTriggersDeathrattle: null,
  weaponSlotsPerPlayer: 1,
  sceneSlotsPerPlayer: 1,
} as const;

/**
 * `null` 表示设计记录明确尚未定义。
 * 这里故意不补默认值，避免程序把“未知”悄悄变成一条新规则。
 */
export type RulesCoreV1 = typeof RULES_CORE_V1;
