import { summonFromHand, type BasicGameCatalog, type BasicGameSession } from "./basic-game.js";

/** Fixed five-slot board: sacrifice placement is validated by the core command. */
export function summonIntoSacrificedSlot(session: BasicGameSession, catalog: BasicGameCatalog, handIndex: number, ids: string[]): string | null {
  const sacrifices = [...new Set(ids)];
  if (sacrifices.length === 0) return "至少需要选择一只献祭随从。";
  const board = session.state.players[session.state.activePlayer].board;
  const slots = sacrifices.map((id) => board.findIndex((m) => m?.instanceId === id));
  if (slots.some((slot) => slot < 0)) return "献祭目标必须仍在己方场上。";
  return summonFromHand(session, catalog, handIndex, Math.min(...slots), sacrifices);
}
