import { test, expect, type Page } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
const KEY='lushizhizao.basic-game.v1';

async function observe(page:Page) {
  await page.addInitScript(()=>{
    const seen=new Set<Node>();
    const flights:{id:string|null;kind:string;privateCard:boolean}[]=[];
    Reflect.set(window,'__receiptFlights',flights);
    const inspect=(node:Node)=>{
      if(!(node instanceof Element))return;
      const elements=[...(node.matches('.flying-card')?[node]:[]),...node.querySelectorAll('.flying-card')];
      for(const el of elements){
        if(seen.has(el))continue;seen.add(el);
        flights.push({id:el.getAttribute('data-acquisition-id'),kind:el.className,privateCard:el.hasAttribute('data-card-id')});
      }
    };
    new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)inspect(n);})
      .observe(document,{childList:true,subtree:true});
  });
}
async function flights(page:Page):Promise<{id:string|null;kind:string;privateCard:boolean}[]> {
  return page.evaluate(()=>Reflect.get(window,'__receiptFlights'));
}
async function state(page:Page):Promise<BasicGameSession>{return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY);}
async function seed(page:Page,count:number){
  const s=fresh();s.demoSpecialsAdded=true;s.state.players.P1.hand=['C012'];s.state.players.P2.hand=['C004'];
  s.state.sharedDeck=Array.from({length:count},()=> 'C001' as const);
  s.state.players.P1.discardPile=[];s.state.players.P2.discardPile=[];
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}

for(const count of [0,1,5]){
  test(`3B-1 committed turn receipts feed exactly ${count} flight occurrences`,async({page})=>{
    await seed(page,count);const before=await state(page);
    const plate=await page.locator('.v2-turn-plate').elementHandle();
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    expect(await flights(page)).toEqual([]); // Recording results is not playing them before handoff.
    const committed=await state(page);expect(committed.state.players.P2.hand).toHaveLength(1+count);
    await page.locator('#reveal-turn').evaluate(e=>{(e as HTMLButtonElement).click();(e as HTMLButtonElement).click();});
    await expect(page.locator('#end-turn')).toBeEnabled();
    const observed=await flights(page);
    expect(observed).toHaveLength(count);expect(new Set(observed.map(f=>f.id)).size).toBe(count);
    expect(observed.every(f=>Boolean(f.id)&&!f.privateCard)).toBe(true);
    expect((await state(page)).state).toEqual(committed.state);
    expect((await state(page)).revision).toBe((before.revision??0)+2);
    expect(await plate!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-turn-plate'))).toBe(true);
    // Restore has final cards but no old batch. It must not play another copy.
    await page.reload();await expect(page.locator('#end-turn')).toBeEnabled();
    expect(await flights(page)).toEqual([]);
    expect(JSON.stringify(await state(page))).not.toMatch(/acquisitions|handIndexAtReceipt|acquisitionQueue/);
  });
}

test('3B-1 new game records real opening batches once without replaying them on first reveal',async({page})=>{
  // 3B-2 deliberately serializes the single source. Batch staggering/shorter
  // opening choreography belongs to 3B-3; keep exact 8+8+4/count checks below.
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#reveal-turn')).toBeVisible({timeout:15_000});
  const observed=await flights(page);
  expect(observed.filter(f=>f.kind.includes('flying-card-active'))).toHaveLength(8);
  expect(observed.filter(f=>f.kind.includes('flying-card-opponent'))).toHaveLength(8);
  expect(observed.filter(f=>f.kind.includes('flying-card-draw'))).toHaveLength(4);
  expect(new Set(observed.map(f=>f.id)).size).toBe(20);
  const s=await state(page);
  const first=s.state.firstPlayer;
  if(first===null)throw new Error("New game must select a first player");
  expect(s.state.players[first].hand).toHaveLength(12);
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  expect(await flights(page)).toEqual(observed);
  page.once('dialog',d=>d.accept());await page.locator('[data-new-game="confirm"]').click();
  await expect(page.locator('#reveal-turn')).toBeVisible({timeout:15_000});
  const next=await flights(page);expect(next).toHaveLength(40);expect(new Set(next.map(f=>f.id)).size).toBe(40);
  expect((await state(page)).gameId).not.toBe(s.gameId);
});

test('3B-1 reload during opening discards cosmetic receipts without redealing',async({page})=>{
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect.poll(async()=> (await flights(page)).length).toBeGreaterThan(0);
  const before=await state(page);await page.reload();
  await expect(page.locator('#reveal-turn')).toBeVisible();
  expect((await state(page)).state.players).toEqual(before.state.players);
  expect(await flights(page)).toEqual([]);
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  expect(await flights(page)).toEqual([]);
});
