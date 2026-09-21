import { getSummonRequirement, validateSummonFromHand, type BasicGameCatalog, type BasicGameSession } from './basic-game.js';
import type { CardId } from '../model/cards.js';

export type SummonOptions =
  | { kind: 'blocked'; reason: string }
  | { kind: 'direct'; slots: number[] }
  | { kind: 'sacrifice'; count: number; candidates: string[] };

/** Ask the same validator as the command, without executing speculative moves.
 * At most five occupied slots means even multi-sacrifice previews stay bounded.
 * Health cost deliberately does not impose a new "must survive" restriction. */
export function summonOptions(session: BasicGameSession, catalog: BasicGameCatalog, handIndex: number, cardId: CardId): SummonOptions {
  const player = session.state.players[session.state.activePlayer];
  if (player.hand[handIndex] !== cardId) return { kind: 'blocked', reason: '手牌已变化，请重新选择。' };
  const definition = catalog.cards.get(cardId);
  const required = definition ? getSummonRequirement(definition).sacrificeCount : 0;
  if (!required) {
    const errors = player.board.map((_, slot) => validateSummonFromHand(session, catalog, handIndex, slot));
    const slots = errors.flatMap((error, slot) => error === null ? [slot] : []);
    return slots.length ? { kind: 'direct', slots } : { kind: 'blocked', reason: errors[0] ?? '没有合法召唤位置。' };
  }
  const units = player.board.flatMap((unit, slot) => unit ? [{ id: unit.instanceId, slot }] : []);
  const candidates = new Set<string>();
  let reason = validateSummonFromHand(session, catalog, handIndex, units[0]?.slot ?? 0, units.slice(0, required).map(u => u.id));
  // Enumerate only sets of the actual required size; all rule decisions still
  // come from validateSummonFromHand, including unsupported series/conditions.
  for (let mask = 1; mask < (1 << units.length); mask++) {
    const selected = units.filter((_, i) => mask & (1 << i));
    if (selected.length !== required) continue;
    const error = validateSummonFromHand(session, catalog, handIndex, selected[0]!.slot, selected.map(u => u.id));
    if (!error) selected.forEach(u => candidates.add(u.id));
    else reason = error;
  }
  return candidates.size ? { kind: 'sacrifice', count: required, candidates: [...candidates] }
    : { kind: 'blocked', reason: reason ?? '没有足够的合法祭品。' };
}
