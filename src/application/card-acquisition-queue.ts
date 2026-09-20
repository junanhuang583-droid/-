import type { CardId } from '../model/cards.js';
import type { PlayerId } from '../model/state.js';
import type { CardAcquisition, DrawReason } from '../core/card-acquisition.js';
import type { SessionCommit } from './game-store.js';

export interface QueuedCard {
  /** Transaction + event + occurrence; duplicate card definitions stay distinct. */
  id: string; cardId: CardId; playerId: PlayerId; handIndexAtReceipt: number;
  ordinal: number;
}
export interface AcquisitionBatch {
  id: string; gameId: string; revision: number; eventIndex: number;
  acquisition: CardAcquisition; cards: QueuedCard[];
}

/** In-memory, single-consumer queue. No replay log, save fields or hidden timers.
 * Watermark survives clear()/take() so a rerender cannot resurrect consumed work. */
export class CardAcquisitionQueue {
  private gameId: string | null = null;
  private revision = -1;
  private pending: AcquisitionBatch[] = [];

  accept(commit: SessionCommit): void {
    if (commit.reason === 'external') {
      this.gameId = commit.gameId; this.revision = commit.revision; this.clear();
      return; // Incoming saves are state, never a request to replay another tab.
    }
    if (commit.gameId !== this.gameId) {
      if (commit.reason !== 'new-game') return;
      this.gameId = commit.gameId; this.revision = -1; this.clear();
    }
    if (commit.revision <= this.revision) return;
    this.revision = commit.revision;
    if (commit.reason === 'new-game') this.clear();
    commit.acquisitions.forEach((acquisition, eventIndex) => {
      // A real zero-card draw is observable in the result, but causes no flying task.
      if (acquisition.cards.length === 0) return;
      const id = `${commit.gameId}:${commit.revision}:${eventIndex}`;
      this.pending.push({ id, gameId: commit.gameId, revision: commit.revision, eventIndex,
        acquisition: structuredClone(acquisition), cards: acquisition.cards.map((card, ordinal) => ({
          id: `${id}:${ordinal}`, cardId: card.cardId, playerId: acquisition.playerId,
          handIndexAtReceipt: card.handIndexAtReceipt, ordinal,
        })) });
    });
  }

  peek(): AcquisitionBatch[] { return structuredClone(this.pending); }
  clear(): void { this.pending = []; }

  takeDraws(playerId?: PlayerId, reason?: DrawReason): AcquisitionBatch[] {
    return this.take(batch => batch.acquisition.kind === 'draw'
      && (playerId === undefined || batch.acquisition.playerId === playerId)
      && (reason === undefined || batch.acquisition.reason === reason));
  }
  takeGrants(playerId?: PlayerId): AcquisitionBatch[] {
    return this.take(batch => batch.acquisition.kind === 'grant'
      && (playerId === undefined || batch.acquisition.playerId === playerId));
  }
  private take(matches: (batch: AcquisitionBatch) => boolean): AcquisitionBatch[] {
    const selected: AcquisitionBatch[] = [], remaining: AcquisitionBatch[] = [];
    for (const batch of this.pending) (matches(batch) ? selected : remaining).push(batch);
    this.pending = remaining;
    return structuredClone(selected);
  }
}
