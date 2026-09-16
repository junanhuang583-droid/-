import { readFileSync } from "node:fs";
import { createBasicGame, createCatalog, revealCurrentTurn } from "../src/core/basic-game.js";
import { parseMinionCardsFromRecord } from "../src/data/parse-card-record.js";
import type { MinionInstance, PlayerId, StatusState } from "../src/model/state.js";
import type { CardId } from "../src/model/cards.js";
export const cards = parseMinionCardsFromRecord(readFileSync("docs/卡牌游戏记录_v0.5.md", "utf8"));
export const catalog = createCatalog(cards);
let serial = 0;
export function unit(cardId: CardId, owner: PlayerId, health?: number, statuses: StatusState[] = []): MinionInstance {
  const c = catalog.cards.get(cardId)!;
  if (!c) throw Error(`Unknown fixture ${cardId}`);
  return {
    instanceId: `fixture-${++serial}`, cardId, owner, controller: owner, currentHealth: health ?? c.health ?? 1,
    attackModifier: 0, attacksUsedThisTurn: 0, summonedOnTurn: 0, statuses
  };
}
export function fresh() {
  const session = createBasicGame(cards, () => .1);
  revealCurrentTurn(session);
  session.state.activePlayer = "P1";
  session.state.firstPlayer = "P1";
  session.turnsStarted = { P1: 1, P2: 0 };
  return session;
}
