import type { AcquisitionBatch, QueuedCard } from './card-acquisition-queue.js';
import { BATTLEFIELD, gameplayGeometry, type ViewportTransform } from './battlefield-geometry.js';
import { V2 } from './battlefield-v2.js';
import { DRAW_CARD_RATIO, type FlightTarget } from './draw-flight.js';

export interface DrawSourceStep {
  card: QueuedCard; reason: 'opening-hand' | 'turn-start' | 'effect';
  before: number; after: number; refilled: number;
}
/** Preserve the actual pop order, including refills. These are committed result
 * facts, not a second deck simulation. Grants never acquire a deck-source lease. */
export function drawSequence(batches: AcquisitionBatch[]): DrawSourceStep[] | null {
  const steps: DrawSourceStep[] = [], ids = new Set<string>();
  const valid = (n: number) => Number.isSafeInteger(n) && n >= 0;
  for (const batch of batches) {
    const result = batch.acquisition;
    if (result.kind !== 'draw') continue;
    if (![result.deckBefore,result.deckAfter,result.requested].every(valid)
      || result.cards.length !== batch.cards.length || result.cards.length > result.requested) return null;
    let remaining = result.deckBefore;
    for (const [index, drawn] of result.cards.entries()) {
      const card = batch.cards[index]!;
      if (!valid(drawn.recycledBefore) || !valid(drawn.deckRemaining)
        || (drawn.recycledBefore > 0 && remaining !== 0)
        || remaining + drawn.recycledBefore - 1 !== drawn.deckRemaining
        || card.playerId !== result.playerId || card.cardId !== drawn.cardId
        || card.handIndexAtReceipt !== drawn.handIndexAtReceipt || ids.has(card.id)) return null;
      ids.add(card.id);
      steps.push({ card: { ...card }, reason: result.reason, before: drawn.deckRemaining + 1,
        after: drawn.deckRemaining, refilled: drawn.recycledBefore });
      remaining = drawn.deckRemaining;
    }
    if (remaining !== result.deckAfter) return null;
  }
  return steps;
}

/** Temporary face-down opening intakes beside, never inside, the real hero.
 * Same authored plane and gameplay clearances as the rest of the battlefield. */
export function openingIntake(t: ViewportTransform, active: boolean): FlightTarget {
  const g = gameplayGeometry(t), group = active ? V2.activeHero : V2.opponentHero;
  const width = Math.min(62, g.heroHeight * .76 / DRAW_CARD_RATIO);
  return { center: { x: BATTLEFIELD.width/2 - g.heroHeight*group.width/group.height/2 - width/2 - 18,
    y: active ? g.activeHeroY : g.opponentHeroY }, width, angle: active ? 3 : -3 };
}
