import type { CardId } from '../model/cards.js';
import type { PlayerId } from '../model/state.js';
import type { QueuedCard } from './card-acquisition-queue.js';

export const HAND_DRAW = { staggerMs: 165, maxFlying: 3, reflowMs: 180, backOutMs: 55, frontInMs: 65 } as const;
/** Validate receipt positions against the committed hand. Do not search by card
 * name/definition: identical cards are separate occurrences. A stale receipt is
 * discarded cosmetically rather than revealing a different card at that index. */
export function bindDrawSlots(cards: QueuedCard[], hand: CardId[], player: PlayerId): QueuedCard[] | null {
  const indices = new Set<number>(), identities = new Set<string>();
  for (const card of cards) {
    const index = card.handIndexAtReceipt;
    if (card.playerId !== player || !Number.isSafeInteger(index) || index < 0 || index >= hand.length
      || hand[index] !== card.cardId || indices.has(index) || identities.has(card.id)) return null;
    indices.add(index); identities.add(card.id);
  }
  return cards.map(card => ({ ...card }));
}
