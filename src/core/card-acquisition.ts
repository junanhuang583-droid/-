import type { CardId } from '../model/cards.js';
import type { PlayerId } from '../model/state.js';

export type DrawReason = 'opening-hand' | 'turn-start' | 'effect';
/** An occurrence at receipt time, not a persistent identity of a hand card.
 * Later effects may move/remove it; consumers must not treat this index as current. */
export interface ReceivedCard { cardId: CardId; handIndexAtReceipt: number }
export interface DrawnCard extends ReceivedCard {
  deckRemaining: number;
  /** Actual refill immediately before this pop, not a second shuffle request. */
  recycledBefore: number;
}
export interface CardsDrawn {
  kind: 'draw'; playerId: PlayerId; reason: DrawReason;
  requested: number; deckBefore: number; deckAfter: number; cards: DrawnCard[];
}
/** Reserved for explicitly implemented grants. Merely adding this result type
 * does not implement evolution stones, card generation or a new command. */
export interface CardsGranted {
  kind: 'grant'; playerId: PlayerId; reason: string; cards: ReceivedCard[];
}
export type CardAcquisition = CardsDrawn | CardsGranted;

/** Draft-local result journal. No DOM, callbacks, persistence or game-state owner.
 * The transaction discards it on rejection; observers see only committed copies. */
export class AcquisitionJournal {
  private readonly entries: CardAcquisition[] = [];
  record(result: CardAcquisition): void { this.entries.push(structuredClone(result)); }
  read(): CardAcquisition[] { return structuredClone(this.entries); }
}
