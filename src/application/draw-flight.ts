import assets from '../../assets-source/battlefield-v2/manifest.json' with { type: 'json' };
import { MASTER_TO_WORLD, V2, type Rect } from './battlefield-v2.js';

export interface Point { x: number; y: number }
export type Quad = [Point, Point, Point, Point];
export interface FlightTarget { center: Point; width: number; angle: number }
/** Presentation geometry only. Time, pose and card size never change a rule. */
export const DRAW_FLIGHT = { width: 82, exitMs: 135, travelMs: 235, exitAngle: -8 } as const;
const full = assets.assets.find(a => a.id === 'card-back-final')!;
const projected = assets.assets.find(a => a.id === 'card-back-deck')!;
export const DRAW_CARD_RATIO = full.height / full.width;
export const DRAW_FLIGHT_HEIGHT = DRAW_FLIGHT.width * DRAW_CARD_RATIO;
const corners = projected.quadSourcePx;
if (!corners || corners.length !== 4) throw new Error('Missing approved deck projection');
/** Exactly the same source quad used to bake the static projected deck texture. */
export const DECK_DRAW_QUAD = corners.map(([x, y]) => ({
  x: x! * MASTER_TO_WORLD, y: (y! - .25) * MASTER_TO_WORLD,
})) as Quad;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const center = (q: Quad): Point => ({ x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 });
export function rectangleQuad(target: FlightTarget): Quad {
  if (!Number.isFinite(target.width) || target.width <= 0) throw new Error('Invalid flight width');
  const a = target.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const w = target.width / 2, h = target.width * DRAW_CARD_RATIO / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({
    x: target.center.x + x! * c - y! * s, y: target.center.y + x! * s + y! * c,
  })) as Quad;
}
export function quadBounds(q: Quad): Rect {
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
/** A single projective surface. No picture switch from baked to flat at exit. */
export function quadMatrix(q: Quad, width = DRAW_FLIGHT.width, height = DRAW_FLIGHT_HEIGHT): number[] {
  if (!(width > 0 && height > 0) || q.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new Error('Invalid projected card');
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x-p2.x, dx2 = p3.x-p2.x, dx3 = p0.x-p1.x+p2.x-p3.x;
  const dy1 = p1.y-p2.y, dy2 = p3.y-p2.y, dy3 = p0.y-p1.y+p2.y-p3.y;
  const det = dx1*dy2-dx2*dy1;
  if (Math.abs(det) < 1e-7) throw new Error('Degenerate projected card');
  const g = (dx3*dy2-dx2*dy3)/det, h = (dx1*dy3-dx3*dy1)/det;
  return [(p1.x-p0.x+g*p1.x)/width, (p1.y-p0.y+g*p1.y)/width, 0, g/width,
    (p3.x-p0.x+h*p3.x)/height, (p3.y-p0.y+h*p3.y)/height, 0, h/height,
    0,0,1,0, p0.x,p0.y,0,1];
}
export const quadTransform = (q: Quad): string => `matrix3d(${quadMatrix(q).join(',')})`;
function bezier(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const v = 1-t;
  return { x: v*v*v*a.x+3*v*v*t*b.x+3*v*t*t*c.x+t*t*t*d.x,
    y: v*v*v*a.y+3*v*v*t*b.y+3*v*t*t*c.y+t*t*t*d.y };
}
export interface DrawFlightPlan { source: Quad; target: FlightTarget; exit: FlightTarget; duration: number }
export function planDrawFlight(target: FlightTarget): DrawFlightPlan {
  const origin = center(DECK_DRAW_QUAD);
  const edge = quadBounds(rectangleQuad({ center: {x:0,y:0}, width:DRAW_FLIGHT.width, angle:DRAW_FLIGHT.exitAngle }));
  const exit = { center: { x: V2.deckRim.x+V2.deckRim.width+edge.width/2+10, y: origin.y-20 },
    width: DRAW_FLIGHT.width, angle: DRAW_FLIGHT.exitAngle };
  return { source: DECK_DRAW_QUAD.map(p=>({...p})) as Quad, target, exit,
    duration: DRAW_FLIGHT.exitMs+DRAW_FLIGHT.travelMs };
}
export function sampleDrawFlight(plan: DrawFlightPlan, ms: number): Quad {
  if (ms <= 0) return plan.source.map(p=>({...p})) as Quad;
  if (ms >= plan.duration) return rectangleQuad(plan.target);
  const start = center(plan.source), exit = plan.exit.center;
  // Shared world-pixels/ms velocity at the phase boundary; no stop/restart there.
  const tangent = { x: .8, y: (plan.target.center.y-exit.y) / DRAW_FLIGHT.travelMs * .4 };
  if (ms < DRAW_FLIGHT.exitMs) {
    const t = clamp(ms / DRAW_FLIGHT.exitMs), shape = smooth(t);
    const c = bezier(start, plus(start,{x:15,y:-12}),
      plus(exit,{x:-tangent.x*DRAW_FLIGHT.exitMs/3,y:-tangent.y*DRAW_FLIGHT.exitMs/3}),exit,t);
    const rect = rectangleQuad(plan.exit);
    return plan.source.map((p,i) => ({ x: c.x+mix(p.x-start.x,rect[i]!.x-exit.x,shape),
      y: c.y+mix(p.y-start.y,rect[i]!.y-exit.y,shape) })) as Quad;
  }
  const t = clamp((ms-DRAW_FLIGHT.exitMs)/DRAW_FLIGHT.travelMs);
  const c = bezier(exit, plus(exit,{x:tangent.x*DRAW_FLIGHT.travelMs/3,y:tangent.y*DRAW_FLIGHT.travelMs/3}),
    plus(plan.target.center,{x:-35,y:0}),plan.target.center,t);
  return rectangleQuad({ center:c, width:mix(plan.exit.width,plan.target.width,smooth(t)),
    angle:mix(plan.exit.angle,plan.target.angle,smooth(t)) });
}
export function drawFlightFrames(plan: DrawFlightPlan) {
  const times = new Set([0,DRAW_FLIGHT.exitMs,plan.duration]);
  for (let i=1;i<90;i++) times.add(plan.duration*i/90);
  return [...times].sort((a,b)=>a-b).map(ms=>({ offset:ms/plan.duration, transform:quadTransform(sampleDrawFlight(plan,ms)) }));
}
