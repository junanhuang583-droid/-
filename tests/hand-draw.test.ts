import { describe, expect, it } from 'vitest';
import { handFan } from '../src/application/hand-fan.js';
import { bindDrawSlots, HAND_DRAW } from '../src/application/hand-draw.js';
import { DRAW_FLIGHT, DRAW_CARD_RATIO, planDrawFlight, sampleDrawFlight, quadBounds } from '../src/application/draw-flight.js';
import type { QueuedCard } from '../src/application/card-acquisition-queue.js';

const receipt = (index: number, id = `commit:1:${index}`): QueuedCard => ({ id, cardId: 'C001', playerId: 'P2', handIndexAtReceipt: index, ordinal: index });
describe('3B-3 shared hand fan, verified slots and stagger', () => {
  for (const count of [1,5,13,42]) {
    it(`preserves the existing static fan at ${count} cards`, () => {
      const slots = handFan({ count, rowWidth: 1040, viewportWidth: 1536, viewportHeight: 691 });
      expect(slots).toHaveLength(count);
      const overlap = count > 1 ? Math.min(Math.max((count*104-1028)/(count-1),0),104*(count>=20?.90:count>=14?.84:.78)) : 0;
      const total = count*104-(count-1)*overlap;
      expect(slots[0]!.left).toBeCloseTo((1040-total)/2, 10);
      for (const [i,slot] of slots.entries()) {
        const delta = i-(count-1)/2, step = count<=8?2.05:count<=13?1.35:count<=20?.82:.58;
        expect(slot.width).toBe(104);
        expect(slot.left).toBeCloseTo(slots[0]!.left+i*(104-overlap),10);
        expect(slot.angle).toBe(Math.min(9,Math.max(-9,delta*step)));
        expect(slot.z).toBe(100-Math.round(Math.abs(delta)));
      }
    });
  }
  it('retains mobile widths, empty hands and finite long-hand spacing without a rule cap', () => {
    expect(handFan({ count:0,rowWidth:1040,viewportWidth:740,viewportHeight:360 })).toEqual([]);
    const slots=handFan({count:200,rowWidth:1040,viewportWidth:740,viewportHeight:360});
    expect(slots).toHaveLength(200);expect(slots.every(s=>s.width===82&&Number.isFinite(s.left))).toBe(true);
    for(let i=1;i<slots.length;i++)expect(slots[i]!.left).toBeGreaterThan(slots[i-1]!.left);
    expect(()=>handFan({count:-1,rowWidth:1,viewportWidth:740,viewportHeight:360})).toThrow();
  });
  it('binds duplicate definitions by distinct receipt/index, not a search for matching names', () => {
    const cards=[receipt(1),receipt(2)];
    expect(bindDrawSlots(cards,['C004','C001','C001'],'P2')).toEqual(cards);
    const bound=bindDrawSlots(cards,['C004','C001','C001'],'P2')!;
    bound[0]!.cardId='C004';expect(cards[0]!.cardId).toBe('C001');
  });
  it('refuses stale index, mismatched recipient, duplicate occurrence and duplicate slot', () => {
    expect(bindDrawSlots([receipt(1)],['C004','C012'],'P2')).toBeNull();
    expect(bindDrawSlots([receipt(1)],['C004','C001'],'P1')).toBeNull();
    expect(bindDrawSlots([receipt(1)],['C001'],'P2')).toBeNull();
    expect(bindDrawSlots([receipt(1),receipt(1,'other')],['C004','C001'],'P2')).toBeNull();
    expect(bindDrawSlots([receipt(0,'same'),receipt(1,'same')],['C001','C001'],'P2')).toBeNull();
    expect(bindDrawSlots([],[],'P2')).toEqual([]);
  });
  it('reserves enough stagger for one extraction and at most three full flight/landings', () => {
    expect(HAND_DRAW.staggerMs).toBeGreaterThanOrEqual(DRAW_FLIGHT.exitMs);
    const life=DRAW_FLIGHT.exitMs+DRAW_FLIGHT.travelMs+HAND_DRAW.backOutMs+HAND_DRAW.frontInMs;
    expect(Math.ceil(life/HAND_DRAW.staggerMs)).toBe(HAND_DRAW.maxFlying);
    expect(life+4*HAND_DRAW.staggerMs).toBeLessThan(1300);
  });
  it('routes hand-bound cards beside then below the hero without changing the source quad', () => {
    for(const x of [520,700,950]){
      const p=planDrawFlight({center:{x,y:608},width:108/DRAW_CARD_RATIO,angle:3,via:{x:450,y:608}});
      const normal=planDrawFlight({center:{x,y:608},width:108/DRAW_CARD_RATIO,angle:3});
      expect(sampleDrawFlight(p,0)).toEqual(sampleDrawFlight(normal,0));
      expect(sampleDrawFlight(p,p.duration)).toEqual(sampleDrawFlight(normal,normal.duration));
      for(let t=DRAW_FLIGHT.exitMs;t<=p.duration;t++){
        const r=quadBounds(sampleDrawFlight(p,t));
        const overlapX=Math.max(0,Math.min(r.x+r.width,635)-Math.max(r.x,518));
        const overlapY=Math.max(0,Math.min(r.y+r.height,514)-Math.max(r.y,404));
        expect(overlapX*overlapY).toBe(0);
      }
    }
  });
  it('keeps a continuous tangent at the below-hero bend', () => {
    const p=planDrawFlight({center:{x:930,y:608},width:108/DRAW_CARD_RATIO,angle:7,via:{x:450,y:608}});
    const v=p.target.via!,first=Math.hypot(v.x-p.exit.center.x,v.y-p.exit.center.y),last=Math.hypot(p.target.center.x-v.x,p.target.center.y-v.y);
    const split=Math.max(.45,Math.min(.82,first/(first+last)));
    const t=DRAW_FLIGHT.exitMs+DRAW_FLIGHT.travelMs*split,e=.001;
    const a=sampleDrawFlight(p,t-e),b=sampleDrawFlight(p,t),c=sampleDrawFlight(p,t+e);
    for(let i=0;i<4;i++)for(const axis of ['x','y'] as const)
      expect(Math.abs((b[i]![axis]-a[i]![axis])/e-(c[i]![axis]-b[i]![axis])/e)).toBeLessThan(.005);
  });
});
