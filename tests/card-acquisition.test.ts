import { describe, expect, it, vi } from 'vitest';
import { AcquisitionJournal, type CardsDrawn } from '../src/core/card-acquisition.js';
import { createBasicGame, drawCards } from '../src/core/basic-game.js';
import { applyCommand } from '../src/core/commands.js';
import { GameStore, type SessionCommit } from '../src/application/game-store.js';
import { CardAcquisitionQueue } from '../src/application/card-acquisition-queue.js';
import { cards, catalog, fresh } from './baseline-fixtures.js';
import type { CardId } from '../src/model/cards.js';

function harness() {
  const s = fresh(); s.demoSpecialsAdded = true;
  s.state.sharedDeck = []; s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  const persist = vi.fn();
  const store = new GameStore(s, persist), queue = new CardAcquisitionQueue();
  queue.accept({ reason:'new-game', gameId:s.gameId, revision:s.revision ?? 0, acquisitions:[] });
  const commits: SessionCommit[] = [];
  store.subscribe((_reason, commit) => { commits.push(commit); queue.accept(commit); });
  return {store, queue, commits, persist};
}

describe('3B-1 rule results, not hand-length differences', () => {
  for (const random of [.1,.9]) {
    it(`captures opening recipients and first-turn draw with random ${random}`, () => {
      const journal = new AcquisitionJournal();
      const s = createBasicGame(cards, () => random, journal);
      const results = journal.read() as CardsDrawn[];
      expect(results.map(r => [r.reason,r.playerId,r.requested,r.cards.length]))
        .toEqual([['opening-hand','P1',8,8],['opening-hand','P2',8,8],['turn-start',s.state.firstPlayer,4,4]]);
      for (const r of results) for (const c of r.cards)
        expect(s.state.players[r.playerId].hand[c.handIndexAtReceipt]).toBe(c.cardId);
      expect(s.state).toEqual(createBasicGame(cards, () => random).state);
      expect(JSON.stringify(s)).not.toMatch(/acquisitions|handIndexAtReceipt|deckBefore/);
    });
  }
  it.each([0,1,4,5,8])('records exactly %i successful pops in their real order', count => {
    const {store,queue,commits} = harness();
    const ids: CardId[] = ['C001','C004','C012','C001','C003','C012','C004','C001'];
    const offset = store.read().state.players.P1.hand.length;
    expect(store.dispatch((draft,result) => {
      draft.state.sharedDeck = [...ids]; drawCards(draft,'P1',count,()=>.1,result); return null;
    })).toBeNull();
    const result = commits[0]!.acquisitions[0] as CardsDrawn;
    expect(result.cards.map(c=>c.cardId)).toEqual(ids.slice(ids.length-count).reverse().slice(0,count));
    expect(result.cards.map(c=>c.handIndexAtReceipt)).toEqual(Array.from({length:count},(_,i)=>offset+i));
    expect(result.cards.map(c=>c.deckRemaining)).toEqual(Array.from({length:count},(_,i)=>ids.length-i-1));
    expect(result.deckBefore).toBe(ids.length);expect(result.deckAfter).toBe(ids.length-count);
    expect(queue.takeDraws().flatMap(b=>b.cards)).toHaveLength(count);
    expect(queue.takeDraws()).toEqual([]);
  });
  it('emits only actual cards on shortfall and no phantom task on an empty deck', () => {
    const {store,queue,commits}=harness();
    store.dispatch((s,j)=>{s.state.sharedDeck=['C004'];drawCards(s,'P2',5,()=>.1,j,'turn-start');return null;});
    const r=commits[0]!.acquisitions[0] as CardsDrawn;
    expect(r.requested).toBe(5);expect(r.cards.map(c=>c.cardId)).toEqual(['C004']);
    expect(queue.takeDraws('P2','turn-start').flatMap(b=>b.cards)).toHaveLength(1);
    store.dispatch((s,j)=>{drawCards(s,'P2',4,()=>.1,j,'turn-start');return null;});
    expect(commits[1]!.acquisitions[0]!.cards).toEqual([]);expect(queue.peek()).toEqual([]);
  });
  it('observes existing discard recycling without reshuffling a second time', () => {
    const {store,commits}=harness();
    store.dispatch((s,j)=>{
      s.state.sharedDeck=['C001'];s.state.players.P1.discardPile=['C004'];s.state.players.P2.discardPile=['C012','C003'];
      drawCards(s,'P1',5,()=>.1,j);return null;
    });
    const r=commits[0]!.acquisitions[0] as CardsDrawn;
    expect(r.cards).toHaveLength(4);expect(r.cards.map(c=>c.recycledBefore)).toEqual([0,3,0,0]);
    expect(r.cards.map(c=>c.deckRemaining)).toEqual([0,2,1,0]);
    expect(r.cards.map(c=>c.cardId).sort()).toEqual(['C001','C003','C004','C012']);
    expect(store.read().state.players.P1.health).toBe(80);
    expect(store.read().log.some(l=>l.text.includes('临时规则'))).toBe(true);
  });
  it('captures a draw even when the same transaction discards one and net hand size is zero', () => {
    const {store,queue}=harness();const before=store.read().state.players.P1.hand.length;
    store.dispatch((s,j)=>{
      const removed=s.state.players.P1.hand.shift()!;s.state.players.P1.discardPile.push(removed);
      s.state.sharedDeck=['C012'];drawCards(s,'P1',1,()=>.1,j,'effect');return null;
    });
    expect(store.read().state.players.P1.hand).toHaveLength(before);
    expect(queue.takeDraws('P1','effect')[0]!.cards.map(c=>c.cardId)).toEqual(['C012']);
  });
  it('retains repeated card definitions as distinct occurrences and separate result batches', () => {
    const {store,queue}=harness();
    store.dispatch((s,j)=>{
      s.state.sharedDeck=['C001','C001','C001'];drawCards(s,'P1',2,()=>.1,j);drawCards(s,'P1',1,()=>.1,j);return null;
    });
    const batches=queue.takeDraws();expect(batches).toHaveLength(2);
    expect(batches.flatMap(b=>b.cards.map(c=>c.cardId))).toEqual(['C001','C001','C001']);
    expect(new Set(batches.flatMap(b=>b.cards.map(c=>c.id))).size).toBe(3);
    expect(batches.map(b=>b.eventIndex)).toEqual([0,1]);
  });
  it('keeps explicitly reported grant results separate without adding a production grant rule', () => {
    const {store,queue}=harness();
    store.dispatch((s,j)=>{
      const p=s.state.players.P2, handIndexAtReceipt=p.hand.length;
      // Fixture-only grant. There is deliberately no new GameCommand for it.
      p.hand.push('C004');j.record({kind:'grant',playerId:'P2',reason:'fixture-only',cards:[{cardId:'C004',handIndexAtReceipt}]});
      return null;
    });
    expect(queue.takeDraws()).toEqual([]);expect(queue.takeGrants('P2')[0]!.cards[0]!.cardId).toBe('C004');
    expect(store.read().state.sharedDeck).toEqual([]);
  });
  it('uses the actual command boundary for first second-player draw and subsequent normal turns', () => {
    const {store,queue}=harness();
    store.dispatch(s=>{s.state.sharedDeck=Array.from({length:30},()=> 'C001' as const);return null;});
    const command=(type:'end-turn'|'reveal-turn')=>store.dispatch((s,j)=>applyCommand(s,catalog,{type},j));
    expect(command('end-turn')).toBeNull();
    expect(queue.takeDraws('P2','turn-start')[0]!.cards).toHaveLength(5);
    expect(command('reveal-turn')).toBeNull();expect(queue.peek()).toEqual([]);
    command('end-turn');expect(queue.takeDraws('P1')[0]!.cards).toHaveLength(4);
    command('reveal-turn');command('end-turn');expect(queue.takeDraws('P2')[0]!.cards).toHaveLength(4);
  });
});

describe('3B-1 commit-only delivery and queue lifetime',()=>{
  it('drops rejected and thrown draft results without persistence or notification',()=>{
    const {store,queue,commits,persist}=harness();const before=store.read();
    const reduce=(s:typeof before,j:AcquisitionJournal)=>{s.state.sharedDeck=['C001'];drawCards(s,'P1',1,()=>.1,j);};
    expect(store.dispatch((s,j)=>{reduce(s,j);return 'rejected';})).toBe('rejected');
    expect(()=>store.dispatch((s,j)=>{reduce(s,j);throw new Error('fixture throw');})).toThrow('fixture throw');
    expect(store.read()).toEqual(before);expect(queue.peek()).toEqual([]);expect(commits).toEqual([]);expect(persist).not.toHaveBeenCalled();
    store.dispatch(()=>null);expect(commits[0]!.acquisitions).toEqual([]);
  });
  it('delivers after the authoritative commit despite disk failure; flush never replays',()=>{
    const {store,queue,persist}=harness();persist.mockImplementationOnce(()=>{throw new Error('disk full');});
    const observed:number[]=[];store.subscribe((_r,c)=>observed.push(store.read().revision! - c.revision));
    expect(store.dispatch((s,j)=>{s.state.sharedDeck=['C004'];drawCards(s,'P1',1,()=>.1,j);return null;})).toBeNull();
    const pending=queue.peek();expect(pending).toHaveLength(1);expect(observed).toEqual([0]);
    store.flush();expect(queue.peek()).toEqual(pending);expect(persist).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(persist.mock.calls.at(-1)![0])).not.toMatch(/acquisitions|handIndexAtReceipt/);
  });
  it('isolates result observers and rejects reentrant commands',()=>{
    const s=fresh(),store=new GameStore(s);const received:SessionCommit[]=[];
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{
      store.subscribe((_r,c)=>{c.acquisitions.splice(0);expect(store.dispatch(()=>null)).not.toBeNull();throw new Error('observer');});
      store.subscribe((_r,c)=>received.push(c));
      store.dispatch((draft,j)=>{draft.state.sharedDeck=['C004'];drawCards(draft,'P1',1,()=>.1,j);return null;});
      expect(received[0]!.acquisitions[0]!.cards[0]!.cardId).toBe('C004');
    }finally{log.mockRestore();}
  });
  it('does not lose waiting draws on a no-draw reveal, nor enqueue on read or duplicate commit',()=>{
    const {store,queue,commits}=harness();
    store.dispatch((s,j)=>{s.state.sharedDeck=['C001'];drawCards(s,'P1',1,()=>.1,j);return null;});
    const original=queue.peek();store.read();store.dispatch(()=>null);
    expect(queue.peek()).toEqual(original);queue.accept(commits[0]!);expect(queue.peek()).toEqual(original);
    const copy=queue.peek();copy[0]!.cards[0]!.cardId='C012';expect(queue.peek()).toEqual(original);
    queue.takeDraws();queue.accept(commits[0]!);expect(queue.peek()).toEqual([]);
  });
  it('clear discards visual work but retains the committed watermark and real cards',()=>{
    const {store,queue,commits}=harness();
    store.dispatch((s,j)=>{s.state.sharedDeck=['C004'];drawCards(s,'P1',1,()=>.1,j);return null;});
    const s=store.read();queue.clear();queue.accept(commits[0]!);
    expect(queue.peek()).toEqual([]);expect(store.read()).toEqual(s);
  });
  it('invalidates external saves without replay and replaces with new opening results only',()=>{
    const {store,queue,commits}=harness();
    store.dispatch((s,j)=>{s.state.sharedDeck=['C004'];drawCards(s,'P1',1,()=>.1,j);return null;});
    const old=commits[0]!;const incoming=store.read();incoming.updatedAt=new Date(Date.parse(incoming.updatedAt)+1000).toISOString();
    expect(store.acceptExternal(incoming)).toBe(true);expect(queue.peek()).toEqual([]);
    const j=new AcquisitionJournal(),next=createBasicGame(cards,()=>.9,j);store.replace(next,j.read());
    const opening=queue.peek();expect(opening.flatMap(b=>b.cards)).toHaveLength(20);
    queue.accept(old);expect(queue.peek()).toEqual(opening);
    queue.accept(commits.at(-1)!);expect(queue.peek()).toEqual(opening);
  });
  it('cold restore never synthesizes an opening or a previous turn from logs or hand sizes',()=>{
    const {store}=harness();
    store.dispatch((s,j)=>{s.state.sharedDeck=['C004'];drawCards(s,'P1',1,()=>.1,j);return null;});
    const saved=JSON.parse(JSON.stringify(store.read()));const restored=new GameStore(saved),q=new CardAcquisitionQueue();
    q.accept({reason:'new-game',gameId:saved.gameId,revision:saved.revision,acquisitions:[]});
    restored.subscribe((_r,c)=>q.accept(c));restored.dispatch(()=>null);
    expect(q.peek()).toEqual([]);expect(restored.read().state).toEqual(saved.state);
  });
});
