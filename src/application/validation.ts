import type { BasicGameSession } from "../core/basic-game.js";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === "string";
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(text);
const integer = (x: unknown): boolean => typeof x === "number" && Number.isInteger(x) && x >= 0;
const finite = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x);
const player = (x: unknown): boolean => x === "P1" || x === "P2";
const time = (x: unknown): boolean => text(x) && Number.isFinite(Date.parse(x));
const optional = (x: unknown, check: (v: unknown) => boolean): boolean => x === undefined || check(x);

export function isPendingEffect(x: unknown): boolean {
  if (!isRecord(x) || !text(x.id) || !player(x.sourcePlayer) || !text(x.sourceCardId)
    || !text(x.sourceName) || !integer(x.remainingTargets)) return false;
  if (x.kind === "unit") return ["damage", "health_loss", "heal", "attack_buff"].includes(String(x.action))
    && ["all_units", "all_minions", "enemy_units", "enemy_minions", "friendly_units", "friendly_minions"].includes(String(x.scope))
    && finite(x.amount) && (x.amount as number) > 0 && strings(x.selectedKeys) && text(x.text);
  return ["freeze", "petrify"].includes(String(x.kind)) && player(x.targetPlayer)
    && integer(x.durationOwnTurns) && (x.durationOwnTurns as number) > 0 && strings(x.selectedTargetIds);
}

function isMinion(x: unknown): boolean {
  if (!isRecord(x) || !text(x.instanceId) || !text(x.cardId) || !player(x.owner) || !player(x.controller)
    || !finite(x.currentHealth) || !finite(x.attackModifier) || !integer(x.attacksUsedThisTurn)
    || !integer(x.summonedOnTurn) || !Array.isArray(x.statuses)) return false;
  return x.statuses.every((status: unknown) => isRecord(status) && text(status.keyword)
    && ["charges", "remainingOwnTurns", "activeFromOwnTurn", "expiresAfterOwnTurn"].every((key) => optional(status[key], integer))
    && optional(status.sourceCardId, text));
}

/** Validate disk input before any view or command reads nested fields. v1 remains supported. */
export function isSession(x: unknown): x is BasicGameSession {
  if (!isRecord(x) || x.schemaVersion !== 1 || !text(x.gameId) || !time(x.createdAt) || !time(x.updatedAt)
    || typeof x.handoffRequired !== "boolean" || !isRecord(x.turnsStarted) || !isRecord(x.state)
    || !optional(x.revision, integer) || !optional(x.demoSpecialsAdded, (v) => typeof v === "boolean")) return false;
  const state = x.state;
  if (!integer(state.turn) || (state.turn as number) < 1 || !player(state.activePlayer)
    || !(state.firstPlayer === null || player(state.firstPlayer)) || !strings(state.sharedDeck)
    || ![null, "P1", "P2", "draw"].includes(state.winner as null | string) || !isRecord(state.players)
    || !Array.isArray(state.deathLog) || !Array.isArray(x.log)) return false;
  for (const id of ["P1", "P2"]) {
    const p = state.players[id];
    if (!isRecord(p) || p.id !== id || !finite(p.health) || !strings(p.hand) || !strings(p.discardPile)
      || !Array.isArray(p.board) || p.board.length !== 5 || !p.board.every((m) => m === null || isMinion(m))
      || !Array.isArray(p.overflowMinions) || !p.overflowMinions.every(isMinion)
      || !integer(p.normalSummonsUsedThisTurn) || !integer(x.turnsStarted[id])
      || !(p.equipment === null || text(p.equipment)) || !(p.scene === null || text(p.scene))) return false;
  }
  if (!state.deathLog.every((d) => isRecord(d) && integer(d.turn) && player(d.owner) && text(d.cardId)
    && text(d.instanceId) && ["damage", "sacrifice", "execution", "other"].includes(String(d.cause))
    && typeof d.canRevive === "boolean" && optional(d.controllerAtDeath, player)
    && optional(d.deathrattleSuppressed, (v) => typeof v === "boolean"))) return false;
  if (!x.log.every((l) => isRecord(l) && text(l.at) && integer(l.turn) && text(l.text))) return false;
  return x.pendingEffects === undefined || (Array.isArray(x.pendingEffects) && x.pendingEffects.every(isPendingEffect));
}
