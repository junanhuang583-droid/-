import { BATTLEFIELD, battlefieldTransform, screenToWorld } from '../application/battlefield-geometry.js';
import { DRAW_FLIGHT, DRAW_FLIGHT_HEIGHT, drawFlightFrames, planDrawFlight, quadTransform, type FlightTarget } from '../application/draw-flight.js';
import { HAND_DRAW } from '../application/hand-draw.js';
import { V2, v2Asset } from '../application/battlefield-v2.js';
import './deck-draw-motion.css';
import type { DeckSourceView } from './deck-source-view.js';

export type DrawFlightResult = 'completed' | 'skipped' | 'interrupted';
export type DrawFlightKind = 'opponent' | 'active' | 'draw';
export interface DrawFlightRequest {
  target: HTMLElement; kind: DrawFlightKind; occurrenceId?: string;
  landing?: { target: FlightTarget; arrive: (back: HTMLElement, signal: AbortSignal) => Promise<void> };
}
/** One exclusive extraction lease, up to three travelling/landing cards.
 * A queued batch owns no rule state and cannot submit or replay a draw command. */
export class DeckDrawMotion {
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  private cleanups = new Set<() => void>();

  constructor(private readonly source: DeckSourceView) {
    window.addEventListener('resize', () => this.cancel());
    document.addEventListener('fullscreenchange', () => this.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    window.addEventListener('pagehide', () => this.cancel());
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => this.cancel());
  }
  cancel(): void {
    ++this.generation;
    this.abort.abort(); this.abort = new AbortController();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
  }
  play(request: DrawFlightRequest): Promise<DrawFlightResult> { return this.playBatch([request]); }
  playBatch(requests: DrawFlightRequest[]): Promise<DrawFlightResult> {
    const epoch = this.generation, signal = this.abort.signal;
    const next = this.tail.then(async (): Promise<DrawFlightResult> => {
      if (epoch !== this.generation) return 'interrupted';
      try { return await this.batch(requests, signal); }
      catch { this.cancel(); return 'interrupted'; }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
  private async batch(requests: DrawFlightRequest[], signal: AbortSignal): Promise<DrawFlightResult> {
    if (!requests.length) return 'completed';
    if (signal.aborted || document.hidden) return 'interrupted';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'skipped';
    const socket = document.querySelector<HTMLElement>('.v2-deck');
    const rim = socket?.querySelector<HTMLImageElement>('.v2-deck-rim');
    const viewport = document.querySelector<HTMLElement>('.battlefield-viewport');
    if (!socket || !rim || !viewport) return 'skipped';
    const probe = new Image(); probe.src = v2Asset('card-back-final');
    if (!await this.ready([probe, rim], signal)) return signal.aborted ? 'interrupted' : 'skipped';
    const all: Promise<DrawFlightResult>[] = [], active = new Set<Promise<DrawFlightResult>>();
    for (let index = 0; index < requests.length; index++) {
      if (signal.aborted || !socket.isConnected) break;
      while (active.size >= HAND_DRAW.maxFlying && !signal.aborted) await Promise.race(active);
      if (signal.aborted) break;
      let released = () => {};
      const sourceFree = new Promise<void>(resolve => { released = resolve; });
      const task = this.run(requests[index]!, socket, viewport, signal, released)
        .catch((): DrawFlightResult => { this.cancel(); return 'interrupted'; });
      active.add(task); all.push(task);
      void task.finally(() => { active.delete(task); released(); });
      if (index < requests.length - 1) {
        // Wall time alone cannot release a paused/busy extraction. The actual
        // outgoing card must have cleared the original rim before the next starts.
        await Promise.all([sourceFree, this.wait(HAND_DRAW.staggerMs, signal)]);
      }
    }
    const results = await Promise.all(all);
    return signal.aborted || all.length !== requests.length || results.includes('interrupted') ? 'interrupted'
      : results.includes('skipped') ? 'skipped' : 'completed';
  }
  private async run(request: DrawFlightRequest, socket: HTMLElement, viewport: HTMLElement,
    signal: AbortSignal, sourceFree: () => void): Promise<DrawFlightResult> {
    if (signal.aborted || !request.target.isConnected) { sourceFree(); return 'interrupted'; }
    const target = request.landing?.target ?? this.inlet(request, viewport);
    const plan = planDrawFlight(target);
    const stage = document.createElement('div');
    stage.className = 'deck-draw-stage'; stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = `left:${-V2.deck.x}px;top:${-V2.deck.y}px;width:${BATTLEFIELD.width}px;height:${BATTLEFIELD.height}px`;
    const card = document.createElement('div');
    card.className = `flying-card flying-card-${request.kind} deck-draw-card`;
    card.dataset.drawPhase = 'exit';
    if (request.occurrenceId) card.dataset.acquisitionId = request.occurrenceId;
    card.style.cssText = `width:${DRAW_FLIGHT.width}px;height:${DRAW_FLIGHT_HEIGHT}px;transform:${quadTransform(plan.source)}`;
    const art = new Image(); art.src = v2Asset('card-back-final'); art.alt = ''; art.draggable = false;
    card.append(art); stage.append(card);
    const lease = this.source.borrow(request.occurrenceId);
    if (!lease) { sourceFree(); return 'skipped'; }
    let frame = 0, motion: Animation | null = null, shade: Animation | null = null;
    const releaseTop = () => { lease.release(); sourceFree(); };
    const cleanup = () => {
      cancelAnimationFrame(frame); motion?.cancel(); shade?.cancel(); releaseTop(); stage.remove();
    };
    this.cleanups.add(cleanup);
    try {
      socket.append(stage);
      motion = card.animate(drawFlightFrames(plan), { duration: plan.duration, fill: 'both', easing: 'linear' });
      motion.id = 'deck-card-exit-flight';
      shade = art.animate([{ filter: 'drop-shadow(0px 0px 0px rgba(0,0,0,0))' },
        { filter: 'drop-shadow(0px 3px 3px rgba(0,0,0,.28))', offset: DRAW_FLIGHT.exitMs/plan.duration },
        { filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,.12))' }], { duration: plan.duration, fill: 'both', easing: 'linear' });
      shade.id = 'deck-card-shadow';
      void motion.finished.catch(() => undefined); void shade.finished.catch(() => undefined);
      const clock = document.timeline.currentTime;
      if (typeof clock === 'number') { motion.startTime = clock; shade.startTime = clock; }
      const observe = () => {
        if (signal.aborted || !socket.isConnected || !request.target.isConnected) { this.cancel(); return; }
        if (Number(motion?.currentTime ?? 0) >= DRAW_FLIGHT.exitMs && card.dataset.drawPhase === 'exit') {
          card.dataset.drawPhase = 'flight'; releaseTop();
        }
        frame = requestAnimationFrame(observe);
      };
      frame = requestAnimationFrame(observe);
      await Promise.all([motion.finished, shade.finished]);
      releaseTop();
      if (signal.aborted) return 'interrupted';
      if (request.landing) await request.landing.arrive(card, signal);
      return signal.aborted ? 'interrupted' : 'completed';
    } catch { if (!signal.aborted) this.cancel(); return 'interrupted'; }
    finally { cleanup(); this.cleanups.delete(cleanup); }
  }
  /** Opening/private recipients still use their private intake. Exact active
   * hand batches supply measured final slot poses through request.landing. */
  private inlet(request: DrawFlightRequest, viewport: HTMLElement): FlightTarget {
    const vp = viewport.getBoundingClientRect(), t = battlefieldTransform(vp.width, vp.height);
    const hero = document.querySelector<HTMLElement>(request.kind === 'opponent' ? '.opponent-hero' : '.active-hero');
    const rect = (hero ?? request.target).getBoundingClientRect();
    const left = screenToWorld(t, rect.left-vp.left, rect.top-vp.top);
    const width = DRAW_FLIGHT.width;
    const x = Math.max(V2.deckRim.x+V2.deckRim.width+width, left.x-width*.65-12);
    const y = request.kind === 'opponent'
      ? Math.max(t.visible.y+DRAW_FLIGHT_HEIGHT/2+8, left.y+rect.height/t.scale*.45)
      : t.visible.y+t.visible.height-38;
    return { center: { x, y }, width, angle: request.kind === 'opponent' ? -3 : 3 };
  }
  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = window.setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    });
  }
  private ready(images: HTMLImageElement[], signal: AbortSignal): Promise<boolean> {
    return new Promise(resolve => {
      let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', aborted); resolve(ok); };
      const aborted = () => finish(false), timer = window.setTimeout(() => finish(false), 1500);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) { finish(false); return; }
      Promise.all(images.map(image => image.decode())).then(() => finish(images.every(im => im.naturalWidth > 0)), () => finish(false));
    });
  }
}
