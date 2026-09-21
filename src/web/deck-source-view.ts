import type { AcquisitionBatch } from '../application/card-acquisition-queue.js';
import { drawSequence, type DrawSourceStep } from '../application/draw-sequence.js';
import { deckSlices, v2Asset } from '../application/battlefield-v2.js';
import { deckView } from './battlefield-view.js';

/** Temporary source inventory from already-committed receipts. The plaque
 * always shows the real store count; only the abstract slices await extraction.
 * No game state, shuffle, draw command, or persisted animation cursor lives here. */
export class DeckSourceView {
  private steps: DrawSourceStep[] = [];
  private cursor = 0;
  private generation = 0;
  private leased = false;
  private actual = 0;
  private socket: HTMLElement | null = null;
  private stamp = '';

  prepare(batches: AcquisitionBatch[]): void {
    ++this.generation; this.cursor = 0; this.leased = false;
    this.steps = drawSequence(batches) ?? [];
    this.paint();
  }
  sync(mount: HTMLElement, actual: number): void {
    this.actual = actual;
    if (!this.socket?.isConnected || this.socket.parentElement !== mount) {
      mount.innerHTML = deckView(actual);
      this.socket = mount.querySelector<HTMLElement>('.v2-deck')!;
      this.stamp = '';
    }
    const socket = this.socket;
    socket.dataset.remaining = String(actual);
    socket.setAttribute('aria-label', `共享牌库，剩余${actual}张`);
    const label = socket.querySelector<HTMLElement>('.v2-deck-count')!;
    label.textContent = String(actual); label.dataset.deckCount = String(actual);
    label.style.fontSize = `${actual >= 10000 ? Math.max(12,92/String(actual).length) : 22}px`;
    this.paint();
  }
  borrow(id: string | undefined): { release: () => void } | null {
    if (!id || this.leased || this.steps[this.cursor]?.card.id !== id || !this.socket?.isConnected) return null;
    const generation = this.generation;
    this.leased = true; this.paint();
    let released = false;
    return { release: () => {
      if (released || generation !== this.generation) return;
      released = true; this.leased = false; ++this.cursor; this.paint();
    } };
  }
  clear(): void {
    ++this.generation; this.steps = []; this.cursor = 0; this.leased = false; this.paint();
  }
  private paint(): void {
    const source = this.socket?.querySelector<HTMLElement>('#deck-source');
    if (!source) return;
    const current = this.steps[this.cursor];
    const count = current?.before ?? this.actual;
    // A true refill is reflected before its next extraction, with no fake shuffle
    // or cards invented to satisfy a requested count larger than actual receipts.
    const stamp = `${count}:${this.leased}`;
    if (stamp !== this.stamp) {
      const slices = deckSlices(count);
      source.innerHTML = slices.map(s => `<img class="v2-deck-slice" src="${v2Asset('card-back-deck')}" alt="" aria-hidden="true" draggable="false" style="transform:translate(${s.dx}px,${s.dy}px);z-index:${s.index+1};${this.leased && s.index===slices.length-1 ? 'visibility:hidden' : ''}" />`).join('');
      source.dataset.visualLayers = String(slices.length);
      this.stamp = stamp;
    }
    source.dataset.visualRemaining = String(count);
    source.dataset.pendingDraws = String(this.steps.length-this.cursor);
    source.dataset.extracting = String(this.leased);
  }
}
