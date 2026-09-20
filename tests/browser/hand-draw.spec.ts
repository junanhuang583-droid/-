import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
import { HAND_DRAW } from '../../src/application/hand-draw.js';
const KEY = 'lushizhizao.basic-game.v1';
// Video is a worker-scoped option in Playwright; configure it at file scope.
test.use({video:'on'});

async function start(page: Page, oldCount = 3) {
  const s = fresh(); s.demoSpecialsAdded = true;
  s.state.sharedDeck = Array.from({ length: 40 }, () => 'C001' as const);
  s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  s.state.players.P1.hand = ['C004', 'C012'];
  s.state.players.P2.hand = Array.from({ length: oldCount }, () => 'C004' as const);
  for (const owner of ['P1','P2'] as const)
    s.state.players[owner].board = Array.from({ length: 5 }, () => unit('C001', owner));
  await page.addInitScript(({key,s}) => { if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(s)); }, {key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
const state = (page: Page): Promise<BasicGameSession> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`); await page.screenshot({path});
  await info.attach(name,{path,contentType:'image/png'});
}
interface Observation {
  arrivals: { id: string; index: number; centerError: number; heightError: number; angleError: number; pending: boolean }[];
  reveals: { id: string; connected: boolean; visible: boolean }[];
  reflows: number; frames: { flying: number; extracting: number; ready: number; locked: boolean; heroOverlap: number }[];
}
async function observe(page: Page) {
  await page.evaluate(timing => {
    const report: Observation = { arrivals:[],reveals:[],reflows:0,frames:[] };
    Reflect.set(window,'__handDrawReport',report);
    const original = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const duration = typeof options === 'number' ? options : options?.duration;
      if (this instanceof HTMLElement && this.matches('.deck-draw-card') && duration === timing.backOutMs) {
        const id = this.dataset.acquisitionId!;
        const front = [...document.querySelectorAll<HTMLElement>('[data-draw-receipt]')].find(e=>e.dataset.drawReceipt===id)!;
        const b=this.getBoundingClientRect(), f=front.getBoundingClientRect();
        const plane=document.querySelector('.battlefield-coordinate-layer')!.getBoundingClientRect(), scale=plane.width/1152;
        const bm=new DOMMatrixReadOnly(getComputedStyle(this).transform),fm=new DOMMatrixReadOnly(getComputedStyle(front).transform);
        report.arrivals.push({id,index:Number(front.dataset.handIndex),
          centerError:Math.hypot(b.x+b.width/2-f.x-f.width/2,b.y+b.height/2-f.y-f.height/2),
          heightError:Math.abs(parseFloat(getComputedStyle(this).height)*Math.hypot(bm.m21,bm.m22)-parseFloat(getComputedStyle(front).height))*scale,
          angleError:Math.abs(Math.atan2(bm.m12,bm.m11)-Math.atan2(fm.m12,fm.m11)),
          pending:front.dataset.drawState==='pending' && getComputedStyle(front).visibility==='hidden',
        });
      }
      if (this instanceof HTMLElement && this.matches('.hand-card') && duration===timing.reflowMs) report.reflows++;
      const animation=original.call(this,frames,options);
      if (this instanceof HTMLElement && this.matches('.hand-card') && duration===timing.frontInMs) {
        const front=this,id=front.dataset.drawReceipt!,index=front.dataset.handIndex;
        void animation.finished.then(()=>queueMicrotask(()=>{
          report.reveals.push({id,connected:front.isConnected&&front===document.querySelector(`[data-hand-index="${index}"]`),
            visible:getComputedStyle(front).visibility==='visible'&&Number(getComputedStyle(front).opacity)>.99});
        })).catch(()=>undefined);
      }
      return animation;
    };
    const scan=()=>{
      const flights=[...document.querySelectorAll<HTMLElement>('.deck-draw-card')];
      if(flights.length){
        const h=document.querySelector('.active-hero')!.getBoundingClientRect();
        const heroOverlap=flights.filter(e=>e.dataset.drawPhase==='flight').reduce((max,e)=>{
          const r=e.getBoundingClientRect();
          return Math.max(max,Math.max(0,Math.min(r.right,h.right)-Math.max(r.x,h.x))*Math.max(0,Math.min(r.bottom,h.bottom)-Math.max(r.y,h.y)));
        },0);
        report.frames.push({flying:flights.length,extracting:flights.filter(e=>e.dataset.drawPhase==='exit').length,
          ready:document.querySelectorAll('[data-draw-state="ready"]').length,
          locked:(document.querySelector('#end-turn') as HTMLButtonElement).disabled,heroOverlap});
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  },HAND_DRAW);
}

test.describe('3B-3 unmodified normal-speed batches',()=>{
  for(const [width,height] of [[1536,691],[740,360]] as const){
    test(`each card lands in its real fan slot and reveals once ${width}x${height}`,async({page},info)=>{
      await page.setViewportSize({width,height});await start(page);await observe(page);
      const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      const plate=await page.locator('.v2-turn-plate').elementHandle();
      const before=await state(page);
      await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
      await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
      const committed=await state(page);
      await page.locator('#reveal-turn').click();
      await expect.poll(()=>page.locator('.deck-draw-card').count()).toBeGreaterThan(1);
      await shot(page,info,'overlapping-source-to-hand');
      await expect(page.locator('#end-turn')).toBeEnabled();
      const report=await page.evaluate(()=>Reflect.get(window,'__handDrawReport') as Observation);
      expect(report.arrivals.map(a=>a.index)).toEqual([3,4,5,6,7]);
      expect(new Set(report.arrivals.map(a=>a.id)).size).toBe(5);
      expect(report.arrivals.every(a=>a.pending&&a.centerError<.5&&a.heightError<.05&&a.angleError<.001)).toBe(true);
      expect(report.reveals.map(r=>r.id)).toEqual(report.arrivals.map(a=>a.id));
      expect(report.reveals.every(r=>r.connected&&r.visible)).toBe(true);
      expect(report.reflows).toBe(3);
      expect(Math.max(...report.frames.map(f=>f.flying))).toBeGreaterThan(1);
      expect(report.frames.every(f=>f.flying<=3&&f.extracting<=1&&f.locked&&f.heroOverlap<1)).toBe(true);
      expect(new Set(report.frames.map(f=>f.ready))).toEqual(new Set([0,1,2,3,4]));
      expect((await state(page)).state).toEqual(committed.state);
      expect((await state(page)).revision).toBe((before.revision??0)+2);
      expect(await plate!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-turn-plate'))).toBe(true);
      await expect(page.locator('[data-draw-state],.deck-draw-stage')).toHaveCount(0);
      await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(8);
      await shot(page,info,'settled-collapsed-hand');
      await page.locator('.stage04-hand-toggle').click();await expect(page.locator('body')).toHaveClass(/stage04-hand-expanded/);
      await shot(page,info,'settled-expanded-hand');
      await info.attach('normal-speed-slot-observation',{body:JSON.stringify(report),contentType:'application/json'});
      expect(errors).toEqual([]);
    });
  }
});

for(const oldCount of [0,37]){
  test(`3B-3 ${oldCount} old cards reserve final slots without a group reveal`,async({page},info)=>{
    await page.setViewportSize({width:740,height:360});await start(page,oldCount);await observe(page);
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    const committed=await state(page);await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    const report=await page.evaluate(()=>Reflect.get(window,'__handDrawReport') as Observation);
    expect(report.arrivals.map(a=>a.index)).toEqual(Array.from({length:5},(_,i)=>oldCount+i));
    expect(report.arrivals.every(a=>a.pending&&a.centerError<.5)).toBe(true);
    expect(report.reveals).toHaveLength(5);expect(report.reflows).toBe(oldCount);
    await expect(page.locator('.hand-card')).toHaveCount(oldCount+5);
    expect((await state(page)).state).toEqual(committed.state);
    await shot(page,info,`settled-${oldCount+5}-cards`);
  });
}

test('3B-3 paused extraction cannot be bypassed by the wall-clock stagger',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const original=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const a=original.call(this,frames,options);
      if(this.matches('.deck-draw-card')&&Array.isArray(frames)&&frames.length>10)queueMicrotask(()=>{a.pause();a.currentTime=50;});
      return a;
    };
  });
  await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').click();await expect(page.locator('.deck-draw-card')).toHaveCount(1);
  await page.waitForTimeout(500);await expect(page.locator('.deck-draw-card')).toHaveCount(1);
  await page.locator('.deck-draw-card').evaluate(e=>e.getAnimations().find(a=>a.id==='deck-card-exit-flight')!.currentTime=140);
  await expect(page.locator('.deck-draw-card')).toHaveCount(2);
  await page.waitForTimeout(300);await expect(page.locator('.deck-draw-card')).toHaveCount(2);
  const committed=await state(page);
  await page.setViewportSize({width:896,height:414});
  await expect(page.locator('#end-turn')).toBeEnabled();await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
  expect((await state(page)).state).toEqual(committed.state);
});

for(const interruption of ['resize','reduce'] as const){
  test(`3B-3 ${interruption} during the actual front handoff clears every pending slot`,async({page})=>{
    await start(page);
    await page.evaluate(()=>{
      const original=Element.prototype.animate;
      Element.prototype.animate=function(frames,options){
        const a=original.call(this,frames,options);
        if(this.matches('.hand-card')&&typeof options==='object'&&options.duration===65)queueMicrotask(()=>{a.pause();a.currentTime=20;});
        return a;
      };
    });
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await page.locator('#reveal-turn').click();await expect(page.locator('[data-draw-state="revealing"]').first()).toBeVisible();
    const committed=await state(page);
    if(interruption==='resize')await page.setViewportSize({width:896,height:414});
    else await page.emulateMedia({reducedMotion:'reduce'});
    await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('[data-draw-state],.deck-draw-stage')).toHaveCount(0);
    await expect(page.locator('.hand-card')).toHaveCount(8);
    expect((await state(page)).state).toEqual(committed.state);expect((await state(page)).revision).toBe(committed.revision);
    expect(await page.locator('#active-hand-target').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.id.startsWith('draw-')).length)).toBe(0);
  });
}

test('3B-3 real external turn interrupts a staggered batch without stale front callbacks',async({page,context})=>{
  await start(page);
  const other=await context.newPage();await other.emulateMedia({reducedMotion:'reduce'});await other.goto('./');
  await expect(other.locator('#end-turn')).toBeEnabled();
  await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').click();await expect(page.locator('.deck-draw-card').first()).toBeVisible();
  await expect(other.locator('#end-turn')).toBeEnabled();await other.locator('#end-turn').click();
  await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('.deck-draw-stage,[data-draw-state]')).toHaveCount(0);
  await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
  const latest=await state(page);await page.waitForTimeout(600);expect((await state(page)).revision).toBe(latest.revision);
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
  await other.close();
});

test('3B-3 consecutive batches keep live buttons and do not accumulate reveal state',async({page})=>{
  await start(page);const before=await state(page), errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(let i=0;i<4;i++){
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('[data-draw-state],.deck-draw-stage')).toHaveCount(0);
    await expect(page.locator('#active-hand-target')).not.toHaveAttribute('inert','');
  }
  const after=await state(page);expect(after.state.turn).toBe(before.state.turn+4);expect(after.revision).toBe((before.revision??0)+8);
  expect(errors).toEqual([]);
});
