import { describe, expect, it } from 'vitest';
import { drawCards } from '../src/core/basic-game.js';
import { CardAcquisitionQueue } from '../src/application/card-acquisition-queue.js';
import { GameStore } from '../src/application/game-store.js';
import { drawSequence, openingIntake } from '../src/application/draw-sequence.js';
import { battlefieldTransform, gameplayGeometry } from '../src/application/battlefield-geometry.js';
import { quadBounds, rectangleQuad } from '../src/application/draw-flight.js';
import { fresh } from './baseline-fixtures.js';

function receipts(available: number, requested = 5, recycled = 0) {
  const s=fresh(); s.state.sharedDeck=Array.from({length:available},()=> 'C001' as const);
  s.state.players.P1.discardPile=Array.from({length:recycled},()=> 'C004' as const); s.state.players.P2.discardPile=[];
  const store=new GameStore(s), queue=new CardAcquisitionQueue();
  queue.accept({reason:'new-game',gameId:s.gameId,revision:s.revision??0,acquisitions:[]});
  store.subscribe((_r,c)=>queue.accept(c));
  store.dispatch((draft,j)=>{drawCards(draft,'P2',requested,()=>.1,j,'turn-start');return null;});
  return {store,batches:queue.takeDraws()};
}

describe('3B-4 committed source trace and private intake',()=>{
  it.each([0,1,2,4,5])('keeps only actual %i final cards available for visual extraction',available=>{
    const {store,batches}=receipts(available), before=store.read();
    const steps=drawSequence(batches)!;
    expect(steps).toHaveLength(available);
    expect(steps.map(s=>s.before)).toEqual(Array.from({length:available},(_,i)=>available-i));
    expect(steps.map(s=>s.after)).toEqual(Array.from({length:available},(_,i)=>available-i-1));
    expect(store.read()).toEqual(before);expect(store.read().state.sharedDeck).toHaveLength(0);
  });
  it('uses the actual refill on the exact pop, without a new shuffle or false source counter',()=>{
    const {store,batches}=receipts(1,5,5), before=store.read(), steps=drawSequence(batches)!;
    expect(steps.map(s=>s.before)).toEqual([1,5,4,3,2]);
    expect(steps.map(s=>s.after)).toEqual([0,4,3,2,1]);
    expect(steps.map(s=>s.refilled)).toEqual([0,5,0,0,0]);
    expect(store.read()).toEqual(before);expect(before.state.sharedDeck).toHaveLength(1);
    expect(before.state.players.P1.discardPile).toHaveLength(0);
  });
  it('supports refill on the first card and partial success after both piles run out',()=>{
    const {batches}=receipts(0,5,2), steps=drawSequence(batches)!;
    expect(steps.map(s=>[s.before,s.after,s.refilled])).toEqual([[2,1,2],[1,0,0]]);
  });
  it('rejects mismatched, duplicate or corrupt results instead of fabricating source cards',()=>{
    const {batches}=receipts(5), corrupt=structuredClone(batches);
    const r=corrupt[0]!.acquisition;
    if(r.kind!=='draw')throw new Error('Expected draw');
    r.cards[0]!.deckRemaining=99;
    expect(drawSequence(corrupt)).toBeNull();
    expect(drawSequence([...batches,...batches])).toBeNull();
    const mismatch=structuredClone(batches); mismatch[0]!.cards[0]!.playerId='P1';
    expect(drawSequence(mismatch)).toBeNull();
  });
  it('filters grants and leaves repeated definitions as separately ordered occurrences',()=>{
    const {batches}=receipts(4), copy=structuredClone(batches[0]!);
    copy.acquisition={kind:'grant',playerId:'P1',reason:'fixture-only',cards:[{cardId:'C004',handIndexAtReceipt:0}]};
    const steps=drawSequence([copy,...batches])!;
    expect(steps).toHaveLength(4);expect(new Set(steps.map(s=>s.card.id)).size).toBe(4);
    expect(steps.every(s=>s.card.cardId==='C001')).toBe(true);
    steps[0]!.card.cardId='C012';expect(batches[0]!.cards[0]!.cardId).toBe('C001');
  });
  it('fits both private intakes inside the visible plane without covering their heroes',()=>{
    for(const [w,h] of [[1536,691],[740,360],[1400,500],[896,414]]){
      const t=battlefieldTransform(w!,h!),g=gameplayGeometry(t);
      for(const active of [false,true]){
        const pose=openingIntake(t,active),r=quadBounds(rectangleQuad(pose));
        expect(r.y).toBeGreaterThan(t.visible.y);
        expect(r.y+r.height).toBeLessThan(t.visible.y+t.visible.height);
        expect(r.x+r.width).toBeLessThan(576-g.heroHeight/2-10);
        expect(pose.center.y).toBe(active?g.activeHeroY:g.opponentHeroY);
      }
    }
  });
});
