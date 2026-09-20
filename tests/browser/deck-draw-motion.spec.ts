import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import { DECK_DRAW_QUAD, DRAW_FLIGHT, DRAW_FLIGHT_HEIGHT } from '../../src/application/draw-flight.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
import { V2 } from '../../src/application/battlefield-v2.js';
import { pngPixels } from './png-samples.js';
const KEY='lushizhizao.basic-game.v1';
async function start(page:Page,deck=10){
  const s=fresh();s.demoSpecialsAdded=true;s.state.sharedDeck=Array.from({length:deck},()=> 'C001' as const);
  s.state.players.P1.discardPile=[];s.state.players.P2.discardPile=[];
  s.state.players.P1.hand=['C004'];s.state.players.P2.hand=['C012'];
  s.state.players.P1.board[1]=unit('C001','P1');s.state.players.P2.board[3]=unit('C012','P2');
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
const state=(page:Page):Promise<BasicGameSession>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY);
async function pauseAtBirth(page:Page){
  await page.evaluate(()=>{
    const original=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const a=original.call(this,frames,options);
      if(this.matches('.deck-draw-card,.deck-draw-card>img'))queueMicrotask(()=>{a.pause();a.currentTime=0;});
      return a;
    };
  });
}
async function seek(page:Page,time:number){
  await page.locator('.deck-draw-stage').evaluate((e,t)=>e.getAnimations({subtree:true}).forEach(a=>{a.currentTime=t;}),time);
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>r())));
}
async function shot(page:Page,info:TestInfo,name:string){
  const path=info.outputPath(`${name}.png`);const bytes=await page.screenshot({path});
  await info.attach(name,{path,contentType:'image/png'});return pngPixels(bytes);
}
for(const [width,height] of [[1536,691],[740,360]] as const){
  test(`3B-2 projected birth and real rim occlusion ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await start(page);
    const fixed=await page.locator('.v2-deck-rim').boundingBox(),rimHandle=await page.locator('.v2-deck-rim').elementHandle();
    const turn=await page.locator('.v2-turn-plate').elementHandle();const before=await state(page);
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    const committed=await state(page);await pauseAtBirth(page);await page.locator('#reveal-turn').click();
    const card=page.locator('.deck-draw-card');await expect(card).toBeVisible();await seek(page,0);
    const projected=await card.evaluate((e,size)=>{
      const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);
      return [[0,0],[size.w,0],[size.w,size.h],[0,size.h]].map(([x,y])=>{
        const p=new DOMPoint(x,y).matrixTransform(m);return {x:p.x/p.w,y:p.y/p.w};
      });
    },{w:DRAW_FLIGHT.width,h:DRAW_FLIGHT_HEIGHT});
    // CSSOM serializes matrix coefficients with finite precision. Keep the
    // browser bound below 0.02 authored pixels; pure homography tests enforce 1e-8.
    for(let i=0;i<4;i++){
      expect(Math.abs(projected[i]!.x-DECK_DRAW_QUAD[i]!.x)).toBeLessThan(.02);
      expect(Math.abs(projected[i]!.y-DECK_DRAW_QUAD[i]!.y)).toBeLessThan(.02);
    }
    await expect(page.locator('.v2-deck-slice:last-child')).toHaveCSS('visibility','hidden');
    await expect(card).toHaveCSS('opacity','1');await expect(page.locator('.v2-deck-rim')).toHaveCount(1);
    await shot(page,info,'birth-full');
    // Real decoded alpha-mask points where the moving card crosses under the original rim.
    await seek(page,75);
    const samples=await page.locator('.v2-deck-rim').evaluate(async e=>{
      const image=e as HTMLImageElement;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const alpha=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const rim=image.getBoundingClientRect(),card=document.querySelector<HTMLElement>('.deck-draw-card')!;
      const plane=document.querySelector('.battlefield-coordinate-layer')!.getBoundingClientRect();const scale=plane.width/1152;
      const inv=new DOMMatrixReadOnly(getComputedStyle(card).transform).inverse();
      const points:{x:number;y:number}[]=[];
      for(let y=4;y<canvas.height-4;y+=3)for(let x=4;x<canvas.width-4;x+=3){
        if(alpha[(y*canvas.width+x)*4+3]!<254)continue;
        const sx=rim.x+x/canvas.width*rim.width,sy=rim.y+y/canvas.height*rim.height;
        const p=new DOMPoint((sx-plane.x)/scale,(sy-plane.y)/scale).matrixTransform(inv);
        const u=p.x/p.w,v=p.y/p.w;
        if(u>10&&v>10&&u<card.offsetWidth-10&&v<card.offsetHeight-10)points.push({x:sx,y:sy});
      }
      return points;
    });
    expect(samples.length).toBeGreaterThan(10);
    const covered=await shot(page,info,'exiting-under-rim-full');
    await card.evaluate(e=>(e as HTMLElement).style.visibility='hidden');
    const bare=pngPixels(await page.screenshot());await card.evaluate(e=>(e as HTMLElement).style.removeProperty('visibility'));
    await page.locator('.v2-deck-rim').evaluate(e=>(e as HTMLElement).style.visibility='hidden');
    const exposed=await shot(page,info,'diagnostic-rim-hidden-full');
    await page.locator('.v2-deck-rim').evaluate(e=>(e as HTMLElement).style.removeProperty('visibility'));
    const delta=(a:typeof covered,b:typeof covered)=>samples.reduce((n,p)=>n+a.rgb(p.x,p.y).reduce((v,c,i)=>v+Math.abs(c-b.rgb(p.x,p.y)[i]!),0),0)/(samples.length*3);
    const metrics={samples:samples.length,coveredVsBare:delta(covered,bare),coveredVsExposed:delta(covered,exposed)};
    await info.attach('opaque-rim-pixel-attribution',{body:JSON.stringify(metrics),contentType:'application/json'});
    expect(metrics.coveredVsBare).toBeLessThan(2);
    expect(metrics.coveredVsExposed).toBeGreaterThan(8);
    const sameCard=await card.elementHandle();await seek(page,DRAW_FLIGHT.exitMs);
    await expect(card).toHaveAttribute('data-draw-phase','flight');
    expect((await card.boundingBox())!.x).toBeGreaterThan(fixed!.x+fixed!.width);
    await expect(page.locator('.v2-deck-slice:last-child')).toHaveCSS('visibility','visible');
    await shot(page,info,'fully-clear-full');await seek(page,240);await shot(page,info,'flight-full');
    expect(await page.locator('.v2-deck-rim').boundingBox()).toEqual(fixed);
    expect(await rimHandle!.evaluate(e=>e===document.querySelector('.v2-deck-rim'))).toBe(true);
    expect(await sameCard!.evaluate(e=>e.isConnected&&e.parentElement?.parentElement===document.querySelector('.v2-deck'))).toBe(true);
    expect(await turn!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-turn-plate'))).toBe(true);
    expect((await state(page)).state).toEqual(committed.state);
    expect((await state(page)).revision).toBe((before.revision??0)+2);
    await page.locator('.deck-draw-stage').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.cancel()));
    await expect(page.locator('#end-turn')).toBeEnabled();await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
  });
}

test('3B-2 full-game normal speed keeps one source owner and unchanged rule results',async({page},info)=>{
  await start(page);const before=await state(page);
  await page.evaluate(()=>{
    const seen=new Set<Element>();const flights:{id:string;frames:number;exit:boolean;air:boolean}[]=[];let max=0;
    Reflect.set(window,'__drawObserved',{flights,get max(){return max;}});
    const scan=()=>{
      const cards=[...document.querySelectorAll<HTMLElement>('.deck-draw-card')];max=Math.max(max,cards.length);
      cards.forEach(card=>{if(!seen.has(card)){seen.add(card);flights.push({id:card.dataset.acquisitionId!,frames:0,exit:false,air:false});}
        const f=flights.find(f=>f.id===card.dataset.acquisitionId)!;f.frames++;if(card.dataset.drawPhase==='exit')f.exit=true;else f.air=true;});
      requestAnimationFrame(scan);
    };requestAnimationFrame(scan);
  });
  await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  const after=await state(page);await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  const observed=await page.evaluate(()=>Reflect.get(window,'__drawObserved') as {max:number;flights:{id:string;frames:number;exit:boolean;air:boolean}[]});
  expect(observed.max).toBe(1);expect(observed.flights).toHaveLength(5);
  expect(new Set(observed.flights.map(f=>f.id)).size).toBe(5);
  expect(observed.flights.every(f=>f.frames>=3&&f.exit&&f.air)).toBe(true);
  expect((await state(page)).state).toEqual(after.state);expect((await state(page)).revision).toBe((before.revision??0)+2);
  await info.attach('unmodified-frame-observation',{body:JSON.stringify(observed),contentType:'application/json'});
  await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
});

for(const interruption of ['resize','hidden','reduce'] as const){
  test(`3B-2 ${interruption} cancels extraction without redrawing or leaving a hidden stack`,async({page})=>{
    await start(page);await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await pauseAtBirth(page);await page.locator('#reveal-turn').click();await expect(page.locator('.deck-draw-card')).toBeVisible();
    const saved=await state(page);
    if(interruption==='resize')await page.setViewportSize({width:896,height:414});
    else if(interruption==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
    else await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.locator('#end-turn')).toBeEnabled();await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
    await expect(page.locator('.v2-deck-slice:last-child')).toHaveCSS('visibility','visible');
    expect((await state(page)).state).toEqual(saved.state);expect((await state(page)).revision).toBe(saved.revision);
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(6);
  });
}
for(const asset of ['card-back-final','deck-rim'] as const){
  test(`3B-2 unavailable ${asset} skips optional flight without a turn lock`,async({page})=>{
    await page.route(`**/${asset}.webp`,r=>r.fulfill({status:200,contentType:'image/webp',body:'corrupt'}));
    await start(page);await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    const committed=await state(page);await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('.deck-draw-card')).toHaveCount(0);expect((await state(page)).state).toEqual(committed.state);
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(6);
  });
}
