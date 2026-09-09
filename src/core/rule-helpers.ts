import type { Keyword } from "../model/cards.js";
import { RULES_CORE_V1 } from "./rules-core-v1.js";

export function clampAttack(value: number): number {
  return Math.max(RULES_CORE_V1.attackFloor, value);
}

export function attackLimitFor(keywords: ReadonlySet<Keyword>): number {
  return keywords.has("fast_attack")
    ? RULES_CORE_V1.fastAttackAttacksPerTurn
    : RULES_CORE_V1.normalMinionAttacksPerTurn;
}

export function canAttackOnSummonTurn(keywords: ReadonlySet<Keyword>): boolean {
  return keywords.has("haste");
}

export function isActionLocked(keywords: ReadonlySet<Keyword>): boolean {
  return keywords.has("sleep") || keywords.has("freeze") || keywords.has("petrify");
}

export interface DamageReductionResult {
  damage: number;
  consumedGuard: boolean;
}

/**
 * 只实现 Rules Core v1 已确认的通用减伤：守护、甲一、甲二。
 * 高阶卡牌的“不可无视”等优先级以后进入独立优先级系统。
 */
export function reduceIncomingDamage(
  incomingDamage: number,
  keywords: ReadonlySet<Keyword>,
): DamageReductionResult {
  const normalized = Math.max(0, incomingDamage);
  if (normalized === 0) return { damage: 0, consumedGuard: false };
  if (keywords.has("guard")) return { damage: 0, consumedGuard: true };

  let reduction = 0;
  if (keywords.has("armor_1")) reduction += 1;
  if (keywords.has("armor_2")) reduction += 2;
  return { damage: Math.max(0, normalized - reduction), consumedGuard: false };
}
