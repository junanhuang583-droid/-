import { describe, expect, it } from 'vitest';
import { summonOptions } from '../src/core/summon-options.js';
import { validateSummonFromHand, summonFromHand } from '../src/core/basic-game.js';
import { summonIntoSacrificedSlot } from '../src/core/sacrifice-placement.js';
import { fresh, catalog, cards, unit } from './baseline-fixtures.js';

describe('3C command-owned summon legality', () => {
  it('lists only empty logical slots and does not mutate the snapshot', () => {
    const s=fresh();s.state.players.P1.hand=['C001'];s.state.players.P1.board[1]=unit('C001','P1');
    s.state.players.P1.board[4]=unit('C004','P1');const before=structuredClone(s);
    expect(summonOptions(s,catalog,0,'C001')).toEqual({kind:'direct',slots:[0,2,3]});
    expect(s).toEqual(before);
  });
  it.each(['limit','handoff','winner','pending','unsupported','not-minion','missing'] as const)('never offers a misleading target for %s', condition => {
    const s=fresh();s.state.players.P1.hand=['C001'];
    if(condition==='limit')s.state.players.P1.normalSummonsUsedThisTurn=1;
    if(condition==='handoff')s.handoffRequired=true;
    if(condition==='winner')s.state.winner='P1';
    if(condition==='pending')s.pendingEffects=[{id:'pending',kind:'freeze',sourcePlayer:'P1',sourceCardId:'C001',sourceName:'fixture',targetPlayer:'P2',remainingTargets:1,durationOwnTurns:1,selectedTargetIds:[]}];
    if(condition==='unsupported')s.state.players.P1.hand=['C002'];
    if(condition==='not-minion')s.state.players.P1.hand=['X001'];
    if(condition==='missing')s.state.players.P1.hand=[];
    const id=s.state.players.P1.hand[0]??'C001', before=structuredClone(s);
    expect(summonOptions(s,catalog,0,id).kind).toBe('blocked');expect(s).toEqual(before);
  });
  it('full board is blocked for normal cards but not for valid sacrifice summons', () => {
    const s=fresh();s.state.players.P1.hand=['C001','C003'];
    s.state.players.P1.board=Array.from({length:5},()=>unit('C001','P1'));
    expect(summonOptions(s,catalog,0,'C001').kind).toBe('blocked');
    expect(summonOptions(s,catalog,1,'C003')).toEqual({kind:'sacrifice',count:1,candidates:s.state.players.P1.board.map(m=>m!.instanceId)});
  });
  it('keeps lethal health costs legal rather than inventing a resource gate', () => {
    const s=fresh();s.state.players.P1.hand=['C004'];s.state.players.P1.health=2;
    expect(summonOptions(s,catalog,0,'C004')).toEqual({kind:'direct',slots:[0,1,2,3,4]});
    expect(summonFromHand(s,catalog,0,3)).toBeNull();expect(s.state.players.P1.health).toBe(-1);expect(s.state.winner).toBe('P2');
  });
  it('only highlights sets satisfying the exact sacrifice count, retaining leftmost landing', () => {
    const s=fresh();s.state.players.P1.hand=['C046'];s.state.players.P1.board[3]=unit('C001','P1');
    expect(summonOptions(s,catalog,0,'C046').kind).toBe('blocked');
    s.state.players.P1.board[1]=unit('C001','P1');
    const ids=[s.state.players.P1.board[3]!.instanceId,s.state.players.P1.board[1]!.instanceId];
    expect(summonOptions(s,catalog,0,'C046')).toEqual({kind:'sacrifice',count:2,candidates:[ids[1],ids[0]]});
    expect(summonIntoSacrificedSlot(s,catalog,0,ids)).toBeNull();expect(s.state.players.P1.board[1]!.cardId).toBe('C046');
    expect(s.state.deathLog).toHaveLength(2);
  });
  it('offers no targets for stale hand identity', () => {
    const s=fresh();s.state.players.P1.hand=['C012'];
    expect(summonOptions(s,catalog,0,'C001').kind).toBe('blocked');
  });
  it('validator remains exactly consistent with execution for all known cards and five slots', () => {
    for(const card of cards) for(let slot=0;slot<5;slot++) {
      const s=fresh();s.state.players.P1.hand=[card.id];s.state.players.P1.board[2]=unit('C001','P1');
      const before=structuredClone(s), error=validateSummonFromHand(s,catalog,0,slot);
      expect(s).toEqual(before);
      expect(summonFromHand(structuredClone(s),catalog,0,slot)).toBe(error);
      const options=summonOptions(s,catalog,0,card.id);
      if(options.kind==='direct')expect(options.slots.includes(slot)).toBe(error===null);
    }
  });
});
