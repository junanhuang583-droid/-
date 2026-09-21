import type { AcquisitionBatch } from '../application/card-acquisition-queue.js';
import { drawSequence, openingIntake, type DrawSourceStep } from '../application/draw-sequence.js';
import { battlefieldTransform } from '../application/battlefield-geometry.js';
import { DRAW_CARD_RATIO, type FlightTarget } from '../application/draw-flight.js';
import type { PlayerId } from '../model/state.js';
import { v2Asset } from '../application/battlefield-v2.js';
import type { DrawFlightRequest } from './deck-draw-motion.js';
import './opening-deal-view.css';

/** Opening-only face-down destinations. Counts come from actual committed
 * occurrences; they are not a new opponent hand model. No names/definitions
 * are exposed in these temporary stacks. They stay visible through handoff. */
export class OpeningDealView {
  private steps: DrawSourceStep[] = [];
  private player: PlayerId = 'P1';
  private root: HTMLElement | null = null;
  private generation = 0;
  private arrived = new Set<string>();
  private totals = { P1: 0, P2: 0 };
  private received = { P1: 0, P2: 0 };

  constructor() { window.addEventListener('resize', () => this.position()); }
  prepare(batches: AcquisitionBatch[], player: PlayerId): void {
    this.clear(); this.player = player;
    this.steps = drawSequence(batches) ?? [];
    for (const step of this.steps) ++this.totals[step.card.playerId];
  }
  mount(plane: HTMLElement): void {
    if (this.root || !this.steps.length) return;
    this.root = document.createElement('div');
    this.root.className = 'opening-deal-receivers'; this.root.setAttribute('aria-hidden','true');
    for (const owner of ['P1','P2'] as const) {
      const node = document.createElement('div');
      node.className = 'opening-receiver'; node.dataset.owner = owner;
      node.innerHTML = '<div class="opening-receiver-backs"></div><span class="opening-receiver-label"></span>';
      this.root.append(node);
    }
    plane.append(this.root); this.position(); this.paint();
  }
  requests(): DrawFlightRequest[] {
    const generation = this.generation;
    // Keep journal order (P1 opening, P2 opening, starter draw), so last-card and
    // refill source facts retain the same order as the actual rule transaction.
    return this.steps.map(step => {
      const owner = step.card.playerId;
      const target = this.root?.querySelector<HTMLElement>(`.opening-receiver[data-owner="${owner}"]`);
      if (!target) throw new Error('Missing private opening intake');
      return { target, kind: step.reason === 'turn-start' ? 'draw' : owner === this.player ? 'active' : 'opponent',
        occurrenceId: step.card.id, landing: { target: this.pose(owner), arrive: async (back, signal) => {
          if (signal.aborted || generation !== this.generation || !target.isConnected) throw new Error('Obsolete opening intake');
          if (!this.arrived.has(step.card.id)) {
            this.arrived.add(step.card.id); ++this.received[owner]; this.paint();
          }
          // Same image, world center, size and angle at both sides of this task.
          // Reveal only the static back and retire the flight without a blank frame.
          back.style.visibility = 'hidden';
        } } };
    });
  }
  settle(): void { this.received = { ...this.totals }; this.paint(); }
  clear(): void {
    ++this.generation; this.root?.remove(); this.root = null; this.steps = [];
    this.arrived.clear(); this.totals = {P1:0,P2:0}; this.received = {P1:0,P2:0};
  }
  private pose(owner: PlayerId): FlightTarget {
    const viewport = document.querySelector<HTMLElement>('.battlefield-viewport')!;
    return openingIntake(battlefieldTransform(viewport.clientWidth, viewport.clientHeight), owner === this.player);
  }
  private position(): void {
    if (!this.root?.isConnected) return;
    for (const owner of ['P1','P2'] as const) {
      const pose = this.pose(owner), node = this.root.querySelector<HTMLElement>(`[data-owner="${owner}"]`)!;
      node.style.cssText = `left:${pose.center.x}px;top:${pose.center.y}px;width:${pose.width}px;height:${pose.width*DRAW_CARD_RATIO}px;--intake-angle:${pose.angle}deg`;
    }
  }
  private paint(): void {
    if (!this.root) return;
    for (const owner of ['P1','P2'] as const) {
      const node = this.root.querySelector<HTMLElement>(`[data-owner="${owner}"]`)!;
      const count = this.received[owner];
      node.dataset.received = String(count); node.dataset.total = String(this.totals[owner]);
      node.querySelector('.opening-receiver-label')!.textContent = `玩家${owner==='P1'?1:2} · ${count}/${this.totals[owner]}`;
      const backs = node.querySelector<HTMLElement>('.opening-receiver-backs')!;
      const layers = Math.min(count,3);
      if (backs.childElementCount === layers) continue;
      backs.replaceChildren();
      for (let i=0;i<layers;i++) {
        const image = new Image(); image.alt=''; image.draggable=false;
        image.className='opening-received-back';
        image.style.setProperty('--intake-depth', `${layers-i-1}`);
        image.addEventListener('error', () => { image.style.visibility='hidden'; });
        image.src=v2Asset('card-back-final'); backs.append(image);
      }
    }
  }
}
