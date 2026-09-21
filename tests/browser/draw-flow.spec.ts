import { test,expect,type Page,type TestInfo } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
const KEY='lushizhizao.basic-game.v1';
test.use({video:'on'});
type Source = {id:string;before:number;pending:number;plaque:number;kind:string};
interface Report { sources:Source[]; privateLeak:boolean; received:Record<string,number[]>; max:number }
async function observe(page:Page){
  await page.addInitScript(()=>{
    const report:Report={sources:[],privateLeak:false,received:{P1:[],P2:[]},max:0};
    Reflect.set(window,'__drawFlow',report);
    const original=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      if(this instanceof HTMLElement&&this.matches('.deck-draw-card')&&Array.isArray(frames)&&frames.length>10){
        const source=document.querySelector<HTMLElement>('#deck-source')!;
        report.sources.push({id:this.dataset.acquisitionId!,before:Number(source.dataset.visualRemaining),
          pending:Number(source.dataset.pendingDraws),plaque:Number(document.querySelector('.v2-deck-count')!.textContent),kind:this.className});
      }
      return original.call(this,frames,options);
    };
    const scan=()=>{
      if(document.querySelector('.opening-deal')){
        report.privateLeak ||= document.querySelectorAll('#active-hand-target .hand-card').length>0;
        document.querySelectorAll<HTMLElement>('.opening-receiver').forEach(e=>{
          const owner=e.dataset.owner!,count=Number(e.dataset.received),values=report.received[owner]!;
          if(values.at(-1)!==count)values.push(count);
        });
      }
      report.max=Math.max(report.max,document.querySelectorAll('.deck-draw-card').length);
      requestAnimationFrame(scan);
    };requestAnimationFrame(scan);
  });
}
const saved=(page:Page):Promise<BasicGameSession>=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),KEY);
const report=(page:Page):Promise<Report>=>page.evaluate(()=>Reflect.get(window,'__drawFlow'));
async function seeded(page:Page,available:number,discard=0){
  const s=fresh();s.demoSpecialsAdded=true;s.state.sharedDeck=Array.from({length:available},()=> 'C001' as const);
  s.state.players.P1.discardPile=Array.from({length:discard},()=> 'C004' as const);s.state.players.P2.discardPile=[];
  s.state.players.P1.hand=['C012'];s.state.players.P2.hand=['C012'];
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
async function shot(page:Page,info:TestInfo,name:string){
  const path=info.outputPath(`${name}.png`);await page.screenshot({path});await info.attach(name,{path,contentType:'image/png'});
}

for(const [width,height,random,first] of [[1536,691,.1,'P1'],[740,360,.9,'P2']] as const){
  test(`3B-4 private opening receives real ordered batches ${width}x${height} ${first}`,async({page},info)=>{
    await page.setViewportSize({width,height});await observe(page);
    await page.addInitScript(r=>{Math.random=()=>r;},random);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
    await expect(page.locator('.deck-draw-card').first()).toBeVisible();
    const initial=await saved(page);expect(initial.state.firstPlayer).toBe(first);
    await expect(page.locator('.opening-deal-shield')).toHaveCSS('backdrop-filter','none');
    await expect(page.locator('#cd-private-hand')).toHaveCount(0);
    await shot(page,info,'opening-private-intakes');
    await expect(page.locator('#reveal-turn')).toBeVisible();
    for(const owner of ['P1','P2'] as const){
      const count=owner===first?12:8;
      await expect(page.locator(`.opening-receiver[data-owner="${owner}"]`)).toHaveAttribute('data-received',String(count));
    }
    const data=await report(page);
    expect(data.sources).toHaveLength(20);expect(new Set(data.sources.map(s=>s.id)).size).toBe(20);
    expect(data.sources.map(s=>s.before)).toEqual(Array.from({length:20},(_,i)=>initial.state.sharedDeck.length+20-i));
    expect(data.sources.every(s=>s.plaque===initial.state.sharedDeck.length)).toBe(true);
    expect(data.sources.slice(0,8).every(s=>s.kind.includes(first==='P1'?'flying-card-active':'flying-card-opponent'))).toBe(true);
    expect(data.sources.slice(8,16).every(s=>s.kind.includes(first==='P2'?'flying-card-active':'flying-card-opponent'))).toBe(true);
    expect(data.sources.slice(16).every(s=>s.kind.includes('flying-card-draw'))).toBe(true);
    expect(data.privateLeak).toBe(false);expect(data.max).toBeLessThanOrEqual(3);
    for(const owner of ['P1','P2'])expect(data.received[owner]!.filter(n=>n>0).length).toBeGreaterThanOrEqual(7);
    await shot(page,info,'opening-complete-private-waiting');
    const committed=await saved(page);
    expect(committed.state.players).toEqual(initial.state.players);
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('.opening-deal-receivers')).toHaveCount(0);
    await expect(page.locator('.hand-card')).toHaveCount(12);
    expect((await report(page)).sources).toEqual(data.sources);
    await info.attach('ordered-private-opening',{body:JSON.stringify(data),contentType:'application/json'});
  });
}

for(const available of [0,1,2,4,5]){
  test(`3B-4 last ${available} real cards stay in the source until extracted`,async({page},info)=>{
    await seeded(page,available);const before=await saved(page), rim=await page.locator('.v2-deck-rim').elementHandle();
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    const committed=await saved(page);
    await expect(page.locator('.v2-deck-count')).toHaveText('0');
    await expect(page.locator('#deck-source')).toHaveAttribute('data-visual-remaining',String(available));
    await expect(page.locator('.v2-deck-slice')).toHaveCount(Math.min(4,available));
    if(available===1)await shot(page,info,'committed-last-card-still-at-source');
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    const data=await report(page);
    expect(data.sources.map(s=>s.before)).toEqual(Array.from({length:available},(_,i)=>available-i));
    expect(data.sources.every(s=>s.plaque===0)).toBe(true);
    await expect(page.locator('.v2-deck-slice,.deck-draw-stage')).toHaveCount(0);
    await expect(page.locator('#deck-source')).toHaveAttribute('data-pending-draws','0');
    await expect(page.locator('.hand-card')).toHaveCount(available+1);
    expect((await saved(page)).state).toEqual(committed.state);
    expect((await saved(page)).revision).toBe((before.revision??0)+2);
    expect(await rim!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-deck-rim'))).toBe(true);
    if(available===1)await shot(page,info,'last-card-landed-empty-source');
  });
}

test('3B-4 actual refill changes the source at the receipt boundary, never the plaque twice',async({page},info)=>{
  await seeded(page,1,5);await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  const committed=await saved(page);expect(committed.state.sharedDeck).toHaveLength(1);
  await expect(page.locator('.v2-deck-count')).toHaveText('1');
  await expect(page.locator('#deck-source')).toHaveAttribute('data-visual-remaining','1');
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  const data=await report(page);
  expect(data.sources.map(s=>s.before)).toEqual([1,5,4,3,2]);expect(data.sources.every(s=>s.plaque===1)).toBe(true);
  await expect(page.locator('.v2-deck-slice')).toHaveCount(1);
  expect((await saved(page)).state).toEqual(committed.state);
  expect(committed.state.players.P1.health).toBe(80);expect(committed.state.players.P2.hand).toHaveLength(6);
  await info.attach('actual-refill-source',{body:JSON.stringify(data),contentType:'application/json'});
});

test('3B-4 reload while last cards wait discards receipts and does not resurrect the source',async({page})=>{
  await seeded(page,2);await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('.v2-deck-slice')).toHaveCount(2);const committed=await saved(page);
  await page.reload();await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('.v2-deck-slice')).toHaveCount(0);
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  expect((await report(page)).sources).toEqual([]);expect((await saved(page)).state).toEqual(committed.state);
  await expect(page.locator('.hand-card')).toHaveCount(3);
});

test('3B-4 interrupted opening settles only committed private receipts and unlocks first reveal',async({page})=>{
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('.deck-draw-card').first()).toBeVisible();const before=await saved(page);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('.deck-draw-stage')).toHaveCount(0);
  await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
  expect((await saved(page)).state.players).toEqual(before.state.players);
  for(const owner of ['P1','P2'] as const)
    await expect(page.locator(`.opening-receiver[data-owner="${owner}"]`)).toHaveAttribute('data-received',String(before.state.players[owner].hand.length));
  await expect(page.locator('#deck-source')).toHaveAttribute('data-pending-draws','0');
  const flown=(await report(page)).sources.length;
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  expect((await report(page)).sources).toHaveLength(flown);
});

test('3B-4 unavailable card back during opening leaves private counts and playable committed cards',async({page})=>{
  await page.route('**/card-back-final.webp',r=>r.abort());
  await observe(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#reveal-turn')).toBeVisible();
  expect((await report(page)).sources).toHaveLength(0);
  await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
  await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('.hand-card')).toHaveCount(12);
  await expect(page.locator('.opening-deal-receivers')).toHaveCount(0);
});

test('3B-4 real pending effect appears after the handoff, not behind the motion lock',async({page})=>{
  const s=fresh();s.handoffRequired=true;s.demoSpecialsAdded=true;
  s.pendingEffects=[{id:'3b4-choice',kind:'unit',sourcePlayer:'P1',sourceCardId:'C034',sourceName:'火山之灵',
    action:'damage',amount:1,scope:'all_units',remainingTargets:1,selectedKeys:[],text:'选择目标'}];
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').evaluate(e=>{
    (e as HTMLButtonElement).click();
    document.querySelector('#end-turn')!.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=100;});
  });
  await page.waitForTimeout(200);await expect(page.locator('#unit-effect-overlay')).toHaveCount(0);
  await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.play()));
  await expect(page.locator('#unit-effect-overlay')).toBeVisible();
  await page.locator('[data-unit-target="hero:P2"]').click();
  await expect(page.locator('#end-turn')).toBeEnabled();expect((await saved(page)).state.players.P2.health).toBe(79);
});
