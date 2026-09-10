import type { PlayerId } from "../model/state.js";

export type UnitTargetKind = "hero" | "minion";
export type UnitTargetScope =
  | "all_units"
  | "all_minions"
  | "enemy_units"
  | "enemy_minions"
  | "friendly_units"
  | "friendly_minions";

export interface UnitTargetDescriptor {
  playerId: PlayerId;
  kind: UnitTargetKind;
  isTaunt?: boolean;
}

/**
 * 用户确认：
 * - “单位”=双方英雄+双方随从；没有敌我限定时双方都可选。
 * - “随从”=双方随从；没有敌我限定时双方都可选。
 * - “敌方/我方”只收窄到对应一侧。
 */
export function scopeAllowsTarget(
  sourcePlayer: PlayerId,
  scope: UnitTargetScope,
  target: UnitTargetDescriptor,
): boolean {
  const friendly = target.playerId === sourcePlayer;
  const enemy = !friendly;

  if (scope === "all_units") return true;
  if (scope === "all_minions") return target.kind === "minion";
  if (scope === "enemy_units") return enemy;
  if (scope === "enemy_minions") return enemy && target.kind === "minion";
  if (scope === "friendly_units") return friendly;
  return friendly && target.kind === "minion";
}

/**
 * 用户确认：需要“选择目标”的效果同样遵守嘲讽。
 * 嘲讽只约束选择敌方单位；己方目标不会被敌方嘲讽挡住。
 */
export function targetedEffectPassesTaunt(
  sourcePlayer: PlayerId,
  target: UnitTargetDescriptor,
  enemyHasTaunt: boolean,
): boolean {
  if (!enemyHasTaunt || target.playerId === sourcePlayer) return true;
  return target.kind === "minion" && target.isTaunt === true;
}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}
