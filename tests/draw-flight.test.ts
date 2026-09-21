import { describe, expect, it } from 'vitest';
import { DRAW_FLIGHT, DRAW_FLIGHT_HEIGHT, DRAW_CARD_RATIO, DECK_DRAW_QUAD, planDrawFlight,
  quadBounds, quadMatrix, rectangleQuad, sampleDrawFlight, drawFlightFrames } from '../src/application/draw-flight.js';
import { V2, MASTER_TO_WORLD } from '../src/application/battlefield-v2.js';
import { battlefieldTransform, worldToScreen, screenToWorld } from '../src/application/battlefield-geometry.js';

const target={center:{x:440,y:535},width:82,angle:3};
const projection=(m:number[],x:number,y:number)=>{
  const w=m[3]!*x+m[7]!*y+m[15]!;
  return {x:(m[0]!*x+m[4]!*y+m[12]!)/w,y:(m[1]!*x+m[5]!*y+m[13]!)/w};
};
describe('3B-2 one projective card leaving the authored deck',()=>{
  it('uses the original baked quad and full-back ratio, not the source image bounding box',()=>{
    expect(DECK_DRAW_QUAD).toEqual([[88,302],[187,306],[170,474],[49,467]].map(([x,y])=>({x:x!*MASTER_TO_WORLD,y:(y!-.25)*MASTER_TO_WORLD})));
    expect(DRAW_CARD_RATIO).toBe(1400/926);
    expect(DRAW_FLIGHT_HEIGHT).toBe(DRAW_FLIGHT.width*DRAW_CARD_RATIO);
  });
  it('maps all four physical corners exactly with homogeneous division',()=>{
    const plan=planDrawFlight(target);
    for(const ms of [0,25,75,135,220,plan.duration]){
      const q=sampleDrawFlight(plan,ms),m=quadMatrix(q);
      for(const [i,[x,y]] of [[0,0],[DRAW_FLIGHT.width,0],[DRAW_FLIGHT.width,DRAW_FLIGHT_HEIGHT],[0,DRAW_FLIGHT_HEIGHT]].entries()){
        const p=projection(m,x!,y!);
        expect(p.x).toBeCloseTo(q[i]!.x,8);expect(p.y).toBeCloseTo(q[i]!.y,8);
      }
    }
  });
  it('has exact start/end and clears the real rim without a layer swap',()=>{
    const p=planDrawFlight(target);
    expect(sampleDrawFlight(p,0)).toEqual(DECK_DRAW_QUAD);
    expect(sampleDrawFlight(p,p.duration)).toEqual(rectangleQuad(target));
    expect(quadBounds(sampleDrawFlight(p,DRAW_FLIGHT.exitMs)).x).toBeGreaterThan(V2.deckRim.x+V2.deckRim.width+9);
  });
  it('has continuous corner position and velocity through extraction and flight',()=>{
    const p=planDrawFlight(target),t=DRAW_FLIGHT.exitMs,e=.001;
    const a=sampleDrawFlight(p,t-e),b=sampleDrawFlight(p,t),c=sampleDrawFlight(p,t+e);
    for(let i=0;i<4;i++)for(const axis of ['x','y'] as const){
      const left=(b[i]![axis]-a[i]![axis])/e,right=(c[i]![axis]-b[i]![axis])/e;
      expect(Math.abs(left-right)).toBeLessThan(.002);
    }
  });
  it('is a proportionate rigid card after exit, not an independently stretched rectangle',()=>{
    const p=planDrawFlight(target);
    for(const t of [135,160,250,p.duration]){
      const q=sampleDrawFlight(p,t),length=(a:number,b:number)=>Math.hypot(q[a]!.x-q[b]!.x,q[a]!.y-q[b]!.y);
      expect(length(1,2)/length(0,1)).toBeCloseTo(DRAW_CARD_RATIO,9);
      expect(length(0,1)).toBeCloseTo(length(2,3),9);
    }
  });
  it('keeps every interpolated quad convex with finite projective matrices',()=>{
    for(const y of [170,420,580]){
      const p=planDrawFlight({...target,center:{x:440,y}});
      for(let t=0;t<=p.duration;t+=2){
        const q=sampleDrawFlight(p,t);expect(quadMatrix(q).every(Number.isFinite)).toBe(true);
        for(let i=0;i<4;i++){
          const a=q[i]!,b=q[(i+1)%4]!,c=q[(i+2)%4]!;
          expect((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)).toBeGreaterThan(0);
        }
      }
    }
  });
  it('retains the one source/world/screen conversion across authored viewports',()=>{
    for(const [w,h] of [[1536,691],[740,360],[1400,500]]){
      const t=battlefieldTransform(w!,h!);
      for(const p of DECK_DRAW_QUAD){
        const s=worldToScreen(t,p.x,p.y),r=screenToWorld(t,s.x,s.y);
        expect(r.x).toBeCloseTo(p.x,10);expect(r.y).toBeCloseTo(p.y,10);
      }
    }
  });
  it('rejects degenerate input and produces uniquely ordered sampled keyframes',()=>{
    expect(()=>quadMatrix([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}])).toThrow();
    const frames=drawFlightFrames(planDrawFlight(target));
    expect(frames[0]!.offset).toBe(0);expect(frames.at(-1)!.offset).toBe(1);
    for(let i=1;i<frames.length;i++)expect(frames[i]!.offset).toBeGreaterThan(frames[i-1]!.offset);
    expect(frames.every(f=>f.transform.startsWith('matrix3d(')&&!f.transform.match(/NaN|Infinity/))).toBe(true);
  });
});
