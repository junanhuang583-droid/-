import type { CardId } from "../model/cards.js";
import { attackHero, attackMinion, choosePendingEffectTarget, chooseUnitEffectTarget, endTurn, revealCurrentTurn, summonFromHand, type BasicGameCatalog, type BasicGameSession } from "./basic-game.js";
import { summonIntoSacrificedSlot } from "./sacrifice-placement.js";

export type GameCommand =
  | { type: "summon"; handIndex: number; slotIndex: number; cardId: CardId; sacrifices?: string[] }
  | { type: "sacrifice-summon"; handIndex: number; cardId: CardId; sacrifices: string[] }
  | { type: "attack-minion"; attackerId: string; targetId: string }
  | { type: "attack-hero"; attackerId: string }
  | { type: "end-turn" }
  | { type: "reveal-turn" }
  | { type: "choose-control"; effectId: string; targetId: string }
  | { type: "choose-unit"; effectId: string; targetKey: string };

/** All browser gameplay actions enter the same pure rules boundary. */
export function applyCommand(session: BasicGameSession, catalog: BasicGameCatalog, command: GameCommand): string | null {
  if (command.type === "summon" || command.type === "sacrifice-summon") {
    if (session.state.players[session.state.activePlayer].hand[command.handIndex] !== command.cardId) return "手牌已变化，请重新选择。";
  }
  switch (command.type) {
    case "summon": return summonFromHand(session, catalog, command.handIndex, command.slotIndex, command.sacrifices ?? []);
    case "sacrifice-summon": return summonIntoSacrificedSlot(session, catalog, command.handIndex, command.sacrifices);
    case "attack-minion": return attackMinion(session, catalog, command.attackerId, command.targetId);
    case "attack-hero": return attackHero(session, catalog, command.attackerId);
    case "end-turn": return endTurn(session);
    case "reveal-turn":
      if (session.state.winner) return "对局已经结束。";
      if (!session.handoffRequired) return "本回合已经开始。";
      revealCurrentTurn(session); return null;
    case "choose-control": return choosePendingEffectTarget(session, catalog, command.targetId, command.effectId);
    case "choose-unit": return chooseUnitEffectTarget(session, catalog, command.effectId, command.targetKey);
  }
}
