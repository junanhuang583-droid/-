import { describe, expect, it } from 'vitest';
import { V2, V2_ANCHORS, MASTER_TO_WORLD, deckSlices, relativeRect, sourceRect, v2Asset } from '../src/application/battlefield-v2.js';
import { deckView, heroView, turnView } from '../src/web/battlefield-view.js';

describe('V2 presentation registration, not another rule engine', () => {
  it('normalizes the approved master by one uniform scale', () => {
    expect(sourceRect(0,.25,1672,940.5)).toEqual({x:0,y:0,width:1152,height:648});
    expect(MASTER_TO_WORLD).toBe(144/209);
  });
  it('keeps the new core and stable input on the same pivot', () => {
    for (const r of [V2.core,V2.turnInput]) {
      expect(r.x+r.width/2).toBeCloseTo(V2_ANCHORS.endTurn.x,9);
      expect(r.y+r.height/2).toBeCloseTo(V2_ANCHORS.endTurn.y,9);
    }
    expect(V2.turnInput.width).toBeGreaterThan(V2.core.width);
    expect(V2.turnInput.height).toBeGreaterThan(V2.core.height);
  });
  it('uses at most four slices without count-dependent unbounded thickness', () => {
    expect(deckSlices(0)).toEqual([]);
    for (const count of [1,2,3,4,5,12,13,200,1000,1000000]) expect(deckSlices(count)).toHaveLength(Math.min(4,count));
    expect(deckSlices(200)).toEqual(deckSlices(1000000));
    expect(deckSlices(13).at(-1)).toMatchObject({dx:0,dy:0});
  });
  it('rejects invalid counts rather than silently drawing misleading piles', () => {
    for (const count of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) expect(()=>deckSlices(count)).toThrow();
  });
  it('keeps the source anchor present in the empty deck and draws no phantom card', () => {
    const html=deckView(0);
    expect(html).toContain('id="deck-source"');
    expect(html).toContain('data-visual-layers="0"');
    expect(html).not.toContain('class="v2-deck-slice"');
    expect(html).toContain('data-deck-count="0"');
  });
  it('draws exact numeric counts independently of bounded slices', () => {
    const html=deckView(1234);
    expect((html.match(/class="v2-deck-slice"/g)||[])).toHaveLength(4);
    expect(html).toContain('data-deck-count="1234"');
    expect(html).not.toContain('CG</');
  });
  it('binds hero number and health to owner and state, never baked preview values', () => {
    const active=heroView('P2',true,71,9,false);
    const opponent=heroView('P1',false,0,3,true);
    expect(active).toContain('<span>2</span>');
    expect(active).toContain('data-health="71"');
    expect(active).toContain('hero-active-frame');
    expect(opponent).toContain('data-hero-target="P1"');
    expect(opponent).toContain('data-health="0"');
    expect(opponent).toContain('hero-opponent-frame');
    expect(active+opponent).not.toContain('hero-skill');
  });
  it('retains a real disabled button and visible text fallback with a fixed sibling rim', () => {
    const html=turnView(true);
    expect(html).toContain('id="end-turn" type="button" aria-label="结束回合" disabled');
    expect(html).toContain('class="end-turn-label">结束回合</span>');
    expect(html).toContain('data-turn-face-panel="front"');
    expect(html).toContain('data-turn-face-panel="back"');
    expect(html).toContain('turn-core-back');
    expect(html.indexOf('class="v2-turn-rim"')).toBeGreaterThan(html.indexOf('</button>'));
    expect(html).not.toContain('end-turn-device');
  });
  it('provides versioned transport URLs and stable relative registrations', () => {
    expect(v2Asset('card-back-final')).toMatch(/^\.\/assets\/battlefield-v2\/v2-3a1-[a-f0-9]{12}\/card-back-final\.webp$/);
    expect(v2Asset('turn-core-back')).toMatch(/^\.\/assets\/battlefield-v2\/v2-3a1-[a-f0-9]{12}\/turn-core-back\.webp$/);
    expect(relativeRect(V2.card,V2.card)).toBe('left:0%;top:0%;width:100%;height:100%');
  });
});
