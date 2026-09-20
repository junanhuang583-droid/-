import type { CardId } from '../model/cards.js';
import type { PlayerId } from '../model/state.js';
import type { QueuedCard } from '../application/card-acquisition-queue.js';
import { bindDrawSlots, HAND_DRAW } from '../application/hand-draw.js';
import { DRAW_CARD_RATIO, DRAW_FLIGHT, DRAW_FLIGHT_HEIGHT, type FlightTarget } from '../application/draw-flight.js';
import { applyHandFan, measureHandFan } from './hand-fan-view.js';
import type { DrawFlightRequest } from './deck-draw-motion.js';

/** Optical slots only. The actual hand and its data always belong to the store.
 * Existing hand buttons become the revealed fronts; no duplicated card component. */
export class HandDrawView {
  private generation = 0;
  private incoming: QueuedCard[] = [];
  private pending = new Set<number>();
  private row: HTMLElement | null = null;
  private tracks = new Set<Animation>();
  private nodes = new Set<HTMLElement>();

  prepare(cards: QueuedCard[], hand: CardId[], player: PlayerId): boolean {
    this.clear();
    const bound = bindDrawSlots(cards, hand, player);
    if (!bound) return false;
    this.incoming = bound;
    this.pending = new Set(bound.map(c => c.handIndexAtReceipt));
    return true;
  }
  syncCard(card: HTMLElement, index: number): void {
    const receipt = this.incoming.find(c => c.handIndexAtReceipt === index);
    if (!receipt) return;
    this.nodes.add(card);
    card.dataset.drawReceipt = receipt.id;
    if (!card.dataset.drawState) card.dataset.drawState = this.pending.has(index) ? 'pending' : 'ready';
    card.setAttribute('aria-hidden', String(this.pending.has(index)));
  }
  /** Called in the same render task that first shows the new player's old hand.
   * Old cards start in their previous smaller fan and make room ONCE per batch. */
  mount(row: HTMLElement): void {
    if (!this.incoming.length || this.row === row) return;
    this.row = row;
    row.dataset.drawBatch = 'true';
    applyHandFan(row);
    const previous = [...row.querySelectorAll<HTMLElement>('.hand-card')]
      .filter(card => !card.dataset.drawReceipt);
    const slots = measureHandFan(row, previous.length);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    previous.forEach((card, i) => {
      const old = slots[i]!;
      const from = `translateX(${old.left - card.offsetLeft}px) translateY(${old.drop}px) rotate(${old.angle}deg)`;
      const to = getComputedStyle(card).transform;
      this.animate(card, [{ transform: from }, { transform: to }], HAND_DRAW.reflowMs, 'draw-hand-make-room');
    });
  }
  requests(row: HTMLElement): DrawFlightRequest[] {
    const generation = this.generation;
    return this.incoming.map(receipt => {
      const front = row.querySelector<HTMLElement>(`[data-hand-index="${receipt.handIndexAtReceipt}"]`);
      if (!front || front.dataset.cardId !== receipt.cardId || front.dataset.drawReceipt !== receipt.id)
        throw new Error('Draw landing no longer matches the committed hand');
      const target = this.target(front);
      return { target: front, kind: 'draw', occurrenceId: receipt.id,
        landing: { target, arrive: async (back, signal) => {
          const valid = () => generation === this.generation && !signal.aborted && front.isConnected
            && front.dataset.drawReceipt === receipt.id;
          if (!valid()) throw new Error('Obsolete hand landing');
          const owned: Animation[] = [];
          const aborted = () => owned.forEach(a => a.cancel());
          signal.addEventListener('abort', aborted, { once: true });
          try {
            back.dataset.drawPhase = 'landing';
            const backBase = getComputedStyle(back).transform;
            const w = parseFloat(getComputedStyle(back).width), h = parseFloat(getComputedStyle(back).height);
            const fold = `${backBase} translate(${w/2}px,${h/2}px) perspective(600px) rotateY(90deg) translate(${-w/2}px,${-h/2}px)`;
            const out = this.animate(back, [{ transform: backBase }, { transform: fold }], HAND_DRAW.backOutMs, 'draw-back-fold');
            owned.push(out); await out.finished;
            if (!valid()) throw new Error('Obsolete hand landing');
            // Both faces meet edge-on in the same task. The original back keeps
            // its native ratio; the existing prototype front keeps its own shape.
            // Their heights/center/angle agree, so no texture is stretched to fit.
            const style = getComputedStyle(front), base = style.transform;
            const [ox, oy] = style.transformOrigin.split(' ').map(Number.parseFloat);
            const cx = parseFloat(style.width)/2 - (ox ?? 0), cy = parseFloat(style.height)/2 - (oy ?? 0);
            const folded = `${base === 'none' ? '' : base} translate(${cx}px,${cy}px) perspective(600px) rotateY(-90deg) translate(${-cx}px,${-cy}px)`;
            const reveal = this.animate(front, [{ transform: folded }, { transform: base }], HAND_DRAW.frontInMs, 'draw-front-unfold');
            owned.push(reveal);
            back.style.visibility = 'hidden';
            front.dataset.drawState = 'revealing';
            await reveal.finished;
            if (!valid()) throw new Error('Obsolete hand landing');
            this.pending.delete(receipt.handIndexAtReceipt);
            front.dataset.drawState = 'ready';
            front.setAttribute('aria-hidden', 'false');
          } finally {
            signal.removeEventListener('abort', aborted);
            owned.forEach(a => { a.cancel(); this.tracks.delete(a); });
          }
        } } };
    });
  }
  clear(): void {
    ++this.generation;
    this.tracks.forEach(a => a.cancel()); this.tracks.clear();
    for (const card of this.nodes) {
      delete card.dataset.drawState; delete card.dataset.drawReceipt; card.removeAttribute('aria-hidden');
    }
    this.nodes.clear();
    if (this.row) delete this.row.dataset.drawBatch;
    this.row = null; this.incoming = []; this.pending.clear();
  }
  private target(card: HTMLElement): FlightTarget {
    const plane = document.querySelector<HTMLElement>('.battlefield-coordinate-layer');
    if (!plane) throw new Error('Missing authored world plane');
    const p = plane.getBoundingClientRect(), box = card.getBoundingClientRect(), style = getComputedStyle(card);
    const scale = p.width / plane.offsetWidth;
    const m = new DOMMatrixReadOnly(style.transform);
    // A rotated rectangle's bounding-box center is its transformed physical
    // center, even with the fan's off-center transform origin (50% 128%).
    const target: FlightTarget = { center: { x: (box.x+box.width/2-p.x)/scale, y: (box.y+box.height/2-p.y)/scale },
      width: parseFloat(style.height)/DRAW_CARD_RATIO, angle: Math.atan2(m.m12, m.m11)*180/Math.PI };
    const hero = document.querySelector<HTMLElement>('.active-hero')?.getBoundingClientRect();
    if (hero) {
      const gutter = (hero.left-p.x)/scale - DRAW_FLIGHT.width/2 - 24;
      if (target.center.x > gutter) target.via = { x: gutter,
        y: Math.max(target.center.y, (hero.bottom-p.y)/scale+DRAW_FLIGHT_HEIGHT/2+12) };
    }
    return target;
  }
  private animate(element: HTMLElement, frames: Keyframe[], duration: number, id: string): Animation {
    const a = element.animate(frames, { duration, easing: 'ease-in-out', fill: 'both' });
    a.id = id; this.tracks.add(a);
    void a.finished.catch(() => undefined);
    // Reflow ends at the static fan pose and needs no held fill effect.
    if (id === 'draw-hand-make-room') void a.finished.catch(() => undefined)
      .finally(() => { a.cancel(); this.tracks.delete(a); });
    return a;
  }
}
