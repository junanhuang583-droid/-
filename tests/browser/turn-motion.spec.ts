import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import { TURN_MOTION } from '../../src/application/turn-motion.js';
const KEY = 'lushizhizao.basic-game.v1';
async function setup(page: Page, deck = 0) {
  const s = fresh(); s.demoSpecialsAdded = true;
  s.state.sharedDeck = Array.from({length:deck},()=> 'C001' as const);
  s.state.players.P1.discardPile=[]; s.state.players.P2.discardPile=[];
  s.state.players.P1.board[1]=unit('C001','P1'); s.state.players.P2.board[2]=unit('C012','P2');
  await page.addInitScript(({key,s})=>{ if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s)); },{key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
async function current(page: Page) {
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as {revision:number,handoffRequired:boolean,state:{turn:number}},KEY);
}
async function pauseClick(page: Page, selector: string) {
  return page.locator(selector).evaluate(e=>{
    (e as HTMLButtonElement).click();
    const button=document.querySelector('#end-turn')!;
    const tracks=button.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-'));
    const rotation=tracks.find(a=>a.id==='turn-plate-rotation');
    if(!rotation)throw new Error('Missing continuous plate rotation');
    tracks.forEach(a=>{a.pause();a.currentTime=0;});
    return Number(rotation.effect!.getTiming().duration);
  });
}
async function pose(page: Page, time?: number) {
  return page.locator('#end-turn').evaluate((button,t)=>{
    if(t!==undefined)button.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).forEach(a=>{a.currentTime=t;});
    const plate=button.querySelector<HTMLElement>('.v2-turn-plate')!, core=button.querySelector<HTMLElement>('.v2-turn-core')!;
    const m=new DOMMatrixReadOnly(getComputedStyle(plate).transform);
    const angle=Math.atan2(m.m23,m.m22)*180/Math.PI;
    return {angle:angle<-.01?angle+360:Math.max(0,angle),press:-new DOMMatrixReadOnly(getComputedStyle(core).transform).m43,
      glow:Number(getComputedStyle(button.querySelector('.v2-turn-light')!).opacity),
      faceCount:plate.querySelectorAll('.v2-turn-face').length,
      ownerFilters:[getComputedStyle(core).filter,getComputedStyle(plate).filter],
      ownerOpacity:[getComputedStyle(core).opacity,getComputedStyle(plate).opacity],
      ownerOverflow:[getComputedStyle(core).overflow,getComputedStyle(plate).overflow],
      hiddenHand:getComputedStyle(document.querySelector('#active-hand-target')!).visibility,
      labelColor:getComputedStyle(button.querySelector('.end-turn-label')!).color,
      rotations:button.getAnimations({subtree:true}).filter(a=>a.id==='turn-plate-rotation').length,
    };
  },time);
}
async function resume(page: Page) {
  await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).forEach(a=>a.play()));
}
async function shot(page:Page, info:TestInfo, name:string) {
  const path=info.outputPath(`${name}.png`);await page.screenshot({path});await info.attach(name,{path,contentType:'image/png'});
}

for (const [width,height] of [[1536,691],[740,360]] as const) {
  test(`R2 one physical plate, continuous light and fixed housing ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await setup(page);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const baseline=await current(page), front=await pose(page);
    const box=await page.locator('#end-turn').boundingBox(),rim=await page.locator('.v2-turn-rim').boundingBox();
    await shot(page,info,'front-ready');
    for(const selector of ['#end-turn','#reveal-turn']){
      const duration=await pauseClick(page,selector);
      const lead=duration-TURN_MOTION.rotateMs-TURN_MOTION.settleMs;
      expect((await current(page)).state.turn).toBe(baseline.state.turn+1);
      const start=await pose(page,0);
      if(selector==='#end-turn'){
        expect(start.glow).toBeCloseTo(front.glow,3);
        expect(start.labelColor).toBe(front.labelColor);
        expect(start.hiddenHand).toBe('hidden');
      }
      const samples=[];
      for(const q of [.25,.49,.5,.51,.75,1]){
        const sample=await pose(page,lead+TURN_MOTION.rotateMs*q);samples.push(sample);
        expect(sample.rotations).toBe(1);expect(sample.faceCount).toBe(2);
        expect(sample.ownerFilters).toEqual(['none','none']);expect(sample.ownerOpacity).toEqual(['1','1']);
        expect(sample.ownerOverflow).toEqual(['visible','visible']);
        const now=await page.locator('#end-turn').boundingBox(), rimNow=await page.locator('.v2-turn-rim').boundingBox();
        for(const k of ['x','y','width','height'] as const){
          expect(Math.abs(now![k]-box![k])).toBeLessThan(.5);expect(Math.abs(rimNow![k]-rim![k])).toBeLessThan(.5);
        }
        if(q===.25||q===.5||q===.75)await shot(page,info,`${selector==='#end-turn'?'out':'return'}-${q}`);
      }
      const sign=selector==='#end-turn'?1:-1;
      expect(samples[2]!.angle).toBeCloseTo(90,0);
      expect(sign*(samples[2]!.angle-samples[1]!.angle)).toBeGreaterThan(2);
      expect(sign*(samples[3]!.angle-samples[2]!.angle)).toBeGreaterThan(2);
      if(selector==='#end-turn')expect(samples[2]!.glow).toBeCloseTo(front.glow,3);
      else expect(samples.at(-1)!.glow).toBeCloseTo(1,3);
      await resume(page);
      if(selector==='#end-turn')await expect(page.locator('#reveal-turn')).toBeVisible();
      else await expect(page.locator('#end-turn')).toBeEnabled();
    }
    expect((await pose(page)).glow).toBeCloseTo(1,3);
    expect((await current(page)).revision).toBe(baseline.revision+2);
    expect(errors).toEqual([]);
  });
}

test('R2 native held press continues without reset; outside release does not commit',async({page})=>{
  await setup(page); const before=await current(page),box=await page.locator('#end-turn').boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.waitForTimeout(90);
  expect((await pose(page)).press).toBeGreaterThan(1.6);
  await page.mouse.move(10,10);await page.mouse.up();await page.waitForTimeout(90);
  expect((await pose(page)).press).toBeCloseTo(0,4);expect(await current(page)).toEqual(before);
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.waitForTimeout(90);
  // Freeze immediately after the native click handler, not after a tool round trip.
  await page.evaluate(()=>document.addEventListener('click',()=>queueMicrotask(()=>{
    document.querySelector('#end-turn')!.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).forEach(a=>{a.pause();a.currentTime=0;});
  }),{once:true}));
  await page.mouse.up();
  expect((await pose(page)).press).toBeGreaterThan(1.5);
  expect((await current(page)).state.turn).toBe(before.state.turn+1);
  await resume(page);await expect(page.locator('#reveal-turn')).toBeVisible();
});

test('R2 animation cancellation converges without stale callbacks or saved motion state',async({page})=>{
  await setup(page); const before=await current(page);
  for(const selector of ['#end-turn','#reveal-turn']){
    await pauseClick(page,selector);
    await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.cancel()));
    if(selector==='#end-turn')await expect(page.locator('#reveal-turn')).toBeVisible();
    else await expect(page.locator('#end-turn')).toBeEnabled();
  }
  const after=await current(page);expect(after.revision).toBe(before.revision+2);expect(after.state.turn).toBe(before.state.turn+1);
  expect(JSON.stringify(after)).not.toMatch(/turnFlip|turnPose|turnMotion|plateAngle/);
  expect(await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).length)).toBe(0);
});

test('R2 preference change during spin cancels the rotation and releases the control',async({page})=>{
  await setup(page);await pauseClick(page,'#end-turn');await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  expect((await pose(page)).angle).toBeCloseTo(0,4);
});

test('R2 return remains visibly locked for the real pending draw, then lights smoothly',async({page})=>{
  await setup(page,30);await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  const duration=await pauseClick(page,'#reveal-turn');
  const nearEnd=await pose(page,duration-1);
  expect(nearEnd.glow).toBeCloseTo(TURN_MOTION.blockedGlow,2);
  await expect(page.locator('#end-turn')).toBeDisabled();
  await resume(page);await expect(page.locator('.flying-card').first()).toBeVisible();
  await expect(page.locator('#end-turn')).toBeDisabled();
  await expect(page.locator('#end-turn')).toBeEnabled();
  await expect.poll(async()=> (await pose(page)).glow).toBeCloseTo(1,3);
});

test('R2 normal-speed repeated turns leave no motion locks or animation accumulation',async({page},info)=>{
  await setup(page);const before=await current(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // No seeking, pausing or speed changes: the real unmodified playback path.
  await page.screenshot({path:info.outputPath('uninterrupted-start.png')});
  for(let i=0;i<10;i++){
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  }
  const after=await current(page);expect(after.state.turn).toBe(before.state.turn+10);
  expect(after.revision).toBe(before.revision+20);expect(errors).toEqual([]);
  expect(await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.id==='turn-plate-rotation').length)).toBe(0);
  await shot(page,info,'uninterrupted-ten-turns');
});
