import { BATTLEFIELD, battlefieldTransform, screenToWorld } from '../application/battlefield-geometry.js';
import { DRAW_FLIGHT, DRAW_FLIGHT_HEIGHT, drawFlightFrames, planDrawFlight, quadTransform, type FlightTarget } from '../application/draw-flight.js';
import { V2, v2Asset } from '../application/battlefield-v2.js';
import './deck-draw-motion.css';

export type DrawFlightResult = 'completed' | 'skipped' | 'interrupted';
export type DrawFlightKind = 'opponent' | 'active' | 'draw';
export interface DrawFlightRequest { target: HTMLElement; kind: DrawFlightKind; occurrenceId?: string }
/** One source owner. Existing opening callers may request two cards together;
 * serialize those requests until 3B-3 supplies the authored staggered batch. */
export class DeckDrawMotion {
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  private cleanupActive: (()=>void) | null = null;

  constructor() {
    window.addEventListener('resize',()=>this.cancel());
    document.addEventListener('fullscreenchange',()=>this.cancel());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
    window.addEventListener('pagehide',()=>this.cancel());
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>this.cancel());
  }
  cancel(): void {
    ++this.generation;
    this.abort.abort(); this.abort = new AbortController();
    this.cleanupActive?.(); this.cleanupActive = null;
  }
  play(request: DrawFlightRequest): Promise<DrawFlightResult> {
    const epoch = this.generation, signal = this.abort.signal;
    const next = this.tail.then(async (): Promise<DrawFlightResult> => {
      if(epoch !== this.generation)return 'interrupted';
      try { return await this.run(request,signal); }
      catch { this.cancel(); return 'interrupted'; }
    });
    this.tail = next.catch(()=>undefined);
    return next;
  }
  private async run(request: DrawFlightRequest, signal: AbortSignal): Promise<DrawFlightResult> {
    if (signal.aborted || document.hidden) return 'interrupted';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'skipped';
    const socket = document.querySelector<HTMLElement>('.v2-deck');
    const rim = socket?.querySelector<HTMLImageElement>('.v2-deck-rim');
    const viewport = document.querySelector<HTMLElement>('.battlefield-viewport');
    if (!socket || !rim || !viewport || !request.target.isConnected) return 'skipped';
    const art = new Image(); art.src = v2Asset('card-back-final');
    // Bounded optional decode: broken/slow art must not hide the static stack or lock a turn.
    if (!await this.ready([art,rim],signal)) return signal.aborted ? 'interrupted' : 'skipped';
    if (signal.aborted || !socket.isConnected || !request.target.isConnected) return 'interrupted';
    const target = this.inlet(request,viewport);
    const plan = planDrawFlight(target);
    const stage = document.createElement('div');
    stage.className = 'deck-draw-stage'; stage.setAttribute('aria-hidden','true');
    // Staying inside the real socket's stacking context keeps the SAME rim
    // above the card. No duplicate foreground, z-index switch or reparenting.
    stage.style.cssText = `left:${-V2.deck.x}px;top:${-V2.deck.y}px;width:${BATTLEFIELD.width}px;height:${BATTLEFIELD.height}px`;
    const card = document.createElement('div');
    card.className = `flying-card flying-card-${request.kind} deck-draw-card`;
    card.dataset.drawPhase = 'exit';
    if(request.occurrenceId)card.dataset.acquisitionId=request.occurrenceId;
    card.style.cssText = `width:${DRAW_FLIGHT.width}px;height:${DRAW_FLIGHT_HEIGHT}px;transform:${quadTransform(plan.source)}`;
    art.alt=''; art.draggable=false;card.append(art);stage.append(card);
    const top = socket.querySelector<HTMLElement>('.v2-deck-slice:last-child');
    const previousVisibility = top?.style.visibility ?? '';
    let borrowed = false, frame = 0, motion: Animation | null = null, shade: Animation | null = null;
    const releaseTop = () => {
      if (borrowed && top) { top.style.visibility=previousVisibility; borrowed=false; }
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);motion?.cancel();shade?.cancel();
      releaseTop();stage.remove();
    };
    try {
      // Static top and animated source never coexist. Underlying slices are the
      // remaining abstract stack; a last drawn card may have no remaining slice.
      if(top){top.style.visibility='hidden';borrowed=true;}
      socket.append(stage);this.cleanupActive=cleanup;
      motion=card.animate(drawFlightFrames(plan),{duration:plan.duration,fill:'both',easing:'linear'});
      motion.id='deck-card-exit-flight';
      shade=art.animate([{filter:'drop-shadow(0px 0px 0px rgba(0,0,0,0))'},
        {filter:'drop-shadow(0px 3px 3px rgba(0,0,0,.28))',offset:DRAW_FLIGHT.exitMs/plan.duration},
        {filter:'drop-shadow(0px 1px 1px rgba(0,0,0,.12))'}],{duration:plan.duration,fill:'both',easing:'linear'});
      shade.id='deck-card-shadow';
      void motion.finished.catch(()=>undefined);void shade.finished.catch(()=>undefined);
      const clock=document.timeline.currentTime;
      if(typeof clock==='number'){motion.startTime=clock;shade.startTime=clock;}
      const observe = () => {
        if(signal.aborted || !socket.isConnected){cleanup();return;}
        const t=Number(motion?.currentTime ?? 0);
        if(t>=DRAW_FLIGHT.exitMs){card.dataset.drawPhase='flight';releaseTop();}
        frame=requestAnimationFrame(observe);
      };
      frame=requestAnimationFrame(observe);
      await Promise.all([motion.finished,shade.finished]);
      return 'completed';
    } catch { if(!signal.aborted)this.cancel(); return 'interrupted'; }
    finally { cleanup();if(this.cleanupActive===cleanup)this.cleanupActive=null; }
  }
  /** A measured PRIVATE intake beside the hero, not a pretend precise fan slot.
   * 3B-3 will supply the actual hand-card quad and final handoff at this boundary. */
  private inlet(request: DrawFlightRequest, viewport: HTMLElement): FlightTarget {
    const vp=viewport.getBoundingClientRect(), t=battlefieldTransform(vp.width,vp.height);
    const hero=document.querySelector<HTMLElement>(request.kind==='opponent'?'.opponent-hero':'.active-hero');
    const rect=(hero ?? request.target).getBoundingClientRect();
    const left=screenToWorld(t,rect.left-vp.left,rect.top-vp.top);
    const width=DRAW_FLIGHT.width;
    const x=Math.max(V2.deckRim.x+V2.deckRim.width+width,left.x-width*.65-12);
    const y=request.kind==='opponent'
      ? Math.max(t.visible.y+DRAW_FLIGHT_HEIGHT/2+8,left.y+rect.height/t.scale*.45)
      : t.visible.y+t.visible.height-38;
    return {center:{x,y},width,angle:request.kind==='opponent'?-3:3};
  }
  private ready(images: HTMLImageElement[], signal: AbortSignal): Promise<boolean> {
    return new Promise(resolve=>{
      let done=false;
      const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',aborted);resolve(ok);};
      const aborted=()=>finish(false);
      const timer=window.setTimeout(()=>finish(false),1500);
      signal.addEventListener('abort',aborted,{once:true});
      if(signal.aborted){finish(false);return;}
      Promise.all(images.map(image=>image.decode())).then(()=>finish(images.every(im=>im.naturalWidth>0)),()=>finish(false));
    });
  }
}
