import { test, expect, type Page } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
import type { CardId } from '../../src/model/cards.js';
const KEY = 'lushizhizao.basic-game.v1';
const MIXED: CardId[] = ['X001','C001','A001','X001','C004'];
async function start(page: Page, drawn: CardId[] = MIXED, old: CardId[] = ['C012']) {
  const s = fresh(); s.demoSpecialsAdded=true;
  s.state.sharedDeck=[...Array.from({length:10},()=> 'C001' as const),...drawn.slice().reverse()];
  s.state.players.P1.hand=['C004']; s.state.players.P2.hand=old;
  s.state.players.P1.discardPile=[];s.state.players.P2.discardPile=[];
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
const state = (page:Page):Promise<BasicGameSession> => page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY);
async function handoff(page:Page) {
  await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').click();
}
async function settled(page:Page) {
  await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('[data-draw-state],.deck-draw-stage')).toHaveCount(0);
  await expect(page.locator('#deck-source')).toHaveAttribute('data-pending-draws','0');
  await expect(page.locator('#active-hand-target')).not.toHaveAttribute('inert','');
}
async function freezeFront(page:Page) {
  await page.evaluate(()=>{
    const original=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const a=original.call(this,frames,options);
      if(this.matches('.hand-card')&&typeof options==='object'&&options?.duration===65)
        queueMicrotask(()=>{a.pause();a.currentTime=25;});
      return a;
    };
  });
}

for(const [width,height] of [[1536,691],[740,360]] as const) {
  test(`3B-5 mixed real card types are rendered before unfolding ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await start(page);
    await page.evaluate(()=>{
      const observed:{id:string;title:string;locked:boolean;node:Element;child:Element|null}[]=[];
      Reflect.set(window,'__mixedFronts',observed);
      const original=Element.prototype.animate;
      Element.prototype.animate=function(frames,options){
        if(this instanceof HTMLElement&&this.matches('.hand-card')&&typeof options==='object'&&options?.duration===65)
          observed.push({id:this.dataset.cardId!,title:this.querySelector('strong')?.textContent??'',locked:(document.querySelector('#end-turn') as HTMLButtonElement).disabled,node:this,child:this.querySelector('strong')});
        return original.call(this,frames,options);
      };
    });
    const before=await state(page);await handoff(page);await settled(page);
    const observed=await page.evaluate(()=>{
      const records=Reflect.get(window,'__mixedFronts') as {id:string;title:string;locked:boolean;node:Element;child:Element|null}[];
      return records.map(r=>({id:r.id,title:r.title,locked:r.locked,stable:r.node.isConnected&&r.child===r.node.querySelector('strong')}));
    });
    expect(observed.map(r=>r.id)).toEqual(MIXED);
    expect(observed.map(r=>r.title)).toEqual(['普通进化石','鱼人','普通攻击','普通进化石','心箭']);
    expect(observed.every(r=>r.locked&&r.stable)).toBe(true);
    expect((await state(page)).revision).toBe((before.revision??0)+2);
    await page.locator('.stage04-hand-toggle').click();await page.waitForTimeout(220);
    await page.screenshot({path:info.outputPath('mixed-real-fronts.png')});
    // They remain display-only prototype effects, not newly implemented rules.
    const prior=await state(page);
    await page.locator('.prototype-stone-card').first().click();
    expect((await state(page)).state).toEqual(prior.state);
    await expect(page.locator('.ab-lift-card')).toHaveCount(0);
  });
}

test.describe('3B-5 completed incoming hand accepts actual touch play',()=>{
  test.use({hasTouch:true,viewport:{width:740,height:360}});
  test('touch drag immediately after the batch uses the retained landed card',async({page,context},info)=>{
    await start(page,['C004','C001','C001','C001','C001'],[]);
    await handoff(page);await settled(page);const before=await state(page);
    await page.locator('.stage04-hand-toggle').tap();await page.waitForTimeout(220);
    const card=(await page.locator('[data-hand-index="0"]').boundingBox())!;
    const board=(await page.locator('.active-board').boundingBox())!;
    const client=await context.newCDPSession(page), from={x:card.x+card.width/2,y:Math.min(348,card.y+card.height/2)};
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    for(let i=1;i<=10;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
      x:from.x+(board.x+board.width/2-from.x)*i/10,y:from.y+(board.y+board.height/2-from.y)*i/10}]});
    const target=page.locator('.active-board [data-empty-slot="4"]');await expect(target).toBeVisible();
    const slot=(await target.boundingBox())!;
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:slot.x+slot.width/2,y:slot.y+slot.height/2}]});
    await page.waitForTimeout(80);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('.active-board .minion')).toHaveCount(1);
    const after=await state(page);
    expect(after.state.players.P2.board[4]?.cardId).toBe('C004');
    expect(after.state.players.P2.health).toBe(before.state.players.P2.health-3);
    expect(after.state.players.P2.hand).toEqual(before.state.players.P2.hand.slice(1));
    expect(after.revision).toBe((before.revision??0)+1);
    await page.screenshot({path:info.outputPath('landed-card-touch-summoned.png')});
  });
});

test('3B-5 pagehide before the first draw frame settles even if frame callbacks stop',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const original=requestAnimationFrame, held:FrameRequestCallback[]=[];
    let enabled=true, sent=false;
    Reflect.set(window,'__resumeFrames',()=>{enabled=false;window.requestAnimationFrame=original;held.forEach(cb=>original(cb));});
    window.requestAnimationFrame=callback=>{
      const shell=document.querySelector<HTMLElement>('.game-shell');
      if(enabled&&shell?.dataset.handPrivate==='false'&&shell.classList.contains('draw-animating')&&!document.querySelector('.deck-draw-card')){
        held.push(callback);
        if(!sent){sent=true;setTimeout(()=>window.dispatchEvent(new Event('pagehide')),0);}
        return 1_000_000+held.length;
      }
      return original(callback);
    };
  });
  await handoff(page);
  // Test explicitly emulates lifecycle + a suspended rAF queue. No physical
  // phone suspension is claimed and no resumed frame may rescue this assertion.
  await expect.poll(()=>page.locator('#end-turn').isEnabled()).toBe(true);
  await expect(page.locator('[data-draw-state],.deck-draw-stage')).toHaveCount(0);
  expect((await state(page)).state.players.P2.hand).toHaveLength(6);
  await page.evaluate(()=>{(Reflect.get(window,'__resumeFrames') as ()=>void)();});
  await settled(page);
});

for(const interruption of ['reload','pagehide','portrait'] as const) {
  test(`3B-5 ${interruption} during front handoff preserves the exact committed hand`,async({page})=>{
    await start(page);await freezeFront(page);await handoff(page);
    await expect(page.locator('[data-draw-state="revealing"]').first()).toBeVisible();
    const committed=await state(page);
    if(interruption==='reload')await page.reload();
    else if(interruption==='pagehide')await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    else {await page.setViewportSize({width:390,height:844});await page.setViewportSize({width:740,height:360});}
    await settled(page);
    expect((await state(page)).state).toEqual(committed.state);
    await expect(page.locator('.hand-card')).toHaveCount(6);
    expect(JSON.stringify(await state(page))).not.toMatch(/drawState|drawReceipt|pendingDraws|visualRemaining/);
  });
}

test('3B-5 persistence failure during mixed draw recovers without replaying a batch',async({page})=>{
  await start(page);const before=await state(page);
  await page.evaluate(key=>{
    const original=Storage.prototype.setItem;
    Reflect.set(window,'__restoreWrites',()=>{Storage.prototype.setItem=original;});
    Storage.prototype.setItem=function(name,value){if(name.startsWith(key))throw new DOMException('Full test','QuotaExceededError');original.call(this,name,value);};
  },KEY);
  await handoff(page);await settled(page);await expect(page.locator('.status-toast')).toContainText('自动保存失败');
  expect(await state(page)).toEqual(before);await expect(page.locator('.hand-card')).toHaveCount(6);
  await page.evaluate(()=>{(Reflect.get(window,'__restoreWrites') as ()=>void)();window.dispatchEvent(new Event('pagehide'));});
  const after=await state(page);expect(after.revision).toBe((before.revision??0)+2);
  expect(after.state.players.P2.hand).toEqual(['C012',...MIXED]);
  await page.reload();await settled(page);expect((await state(page)).state).toEqual(after.state);
});

test('3B-5 complete offline shell runs the actual mixed-type draw and keeps the final save',async({page,context})=>{
  await start(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);await page.reload();await expect(page.locator('#end-turn')).toBeEnabled();
  const before=await state(page);await handoff(page);await settled(page);
  const after=await state(page);expect(after.revision).toBe((before.revision??0)+2);
  expect(after.state.players.P2.hand).toEqual(['C012',...MIXED]);
  await expect(page.locator('.prototype-special-card')).toHaveCount(3);
  await page.reload();await settled(page);expect((await state(page)).state).toEqual(after.state);
  await context.setOffline(false);
});
