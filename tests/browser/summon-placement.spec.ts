import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
import type { CardId } from '../../src/model/cards.js';
const KEY='lushizhizao.basic-game.v1';
const marks='.summon-placement-mark', legal='.active-board [data-summon-legal="true"]';
async function setup(page:Page, s=fresh()) {
  s.demoSpecialsAdded=true;s.state.sharedDeck=[];s.state.players.P1.discardPile=[];s.state.players.P2.discardPile=[];
  await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
const saved=(p:Page):Promise<BasicGameSession>=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)!),KEY);
async function begin(page:Page,index=0) {
  if(await page.locator('.stage04-hand-toggle').getAttribute('aria-expanded')!=='true')await page.locator('.stage04-hand-toggle').click();
  await page.waitForTimeout(210);
  const r=(await page.locator(`[data-hand-index="${index}"]`).boundingBox())!,h=page.viewportSize()!.height;
  const x=r.x+r.width/2,y=Math.min(h-10,r.y+r.height/2);
  await page.mouse.move(x,y);await page.mouse.down();
  return {x,y};
}
async function toBoard(page:Page) {
  const r=(await page.locator('.active-board').boundingBox())!;
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:8});
  await expect(page.locator('.ab-lift-card')).toBeVisible();
}
async function clean(page:Page) {
  await expect(page.locator(marks)).toHaveCount(0);
  await expect(page.locator('.active-board .empty-slot:visible')).toHaveCount(0);
  await expect(page.locator('.ab-lift-card')).toHaveCount(0);
}
async function shot(page:Page,info:TestInfo,name:string) {
  const path=info.outputPath(`${name}.png`);await page.screenshot({path});await info.attach(name,{path,contentType:'image/png'});
}
for(const [width,height] of [[1536,691],[740,360]] as const) {
  test(`3C temporary legal guides, hover and actual drop ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});const s=fresh();s.state.players.P1.hand=['C004'];
    s.state.players.P1.board[1]=unit('C001','P1');s.state.players.P1.board[4]=unit('C001','P1');
    await setup(page,s);const before=await saved(page),mechanism=await page.locator('.v2-turn-plate').elementHandle();
    await clean(page);await shot(page,info,'idle-no-sockets');
    await begin(page);await toBoard(page);
    await expect(page.locator(legal)).toHaveCount(3);await expect(page.locator('.opponent-board '+marks)).toHaveCount(0);
    expect(await page.locator(legal).evaluateAll(es=>es.map(e=>e.getAttribute('data-empty-slot')))).toEqual(['0','2','3']);
    await shot(page,info,'only-legal-temporary-guides');
    const target=page.locator('.active-board [data-empty-slot="3"]'),r=(await target.boundingBox())!;
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:4});
    await expect(target).toHaveAttribute('data-summon-target','true');
    await expect(target.locator('.summon-placement-caption')).toHaveText('松手召唤');
    await shot(page,info,'hover-one-target');await page.mouse.up();await clean(page);
    const after=await saved(page);expect(after.state.players.P1.board[3]?.cardId).toBe('C004');
    expect(after.state.players.P1.health).toBe(77);expect(after.revision).toBe((before.revision??0)+1);
    await page.waitForTimeout(180);const units=await page.locator('.active-board .minion').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
    const board=(await page.locator('.active-board').boundingBox())!;
    for(const u of units)expect(Math.abs(u.y+u.height/2-board.y-board.height/2)).toBeLessThan(1.5);
    expect(Math.abs((units[0]!.x+units.at(-1)!.right)/2-board.x-board.width/2)).toBeLessThan(1.5);
    expect(await mechanism!.evaluate(e=>e===document.querySelector('.v2-turn-plate'))).toBe(true);
    await shot(page,info,'drop-clean-compact');
  });
}

test('3C viewing a card and dragging back never shows persistent slots or consumes a summon',async({page})=>{
  const s=fresh();s.state.players.P1.hand=['C001'];await setup(page,s);const before=await saved(page);
  const p=await begin(page);await page.mouse.move(p.x,p.y-15,{steps:3});
  await expect(page.locator('.ab-lift-card')).toBeVisible();await expect(page.locator(marks)).toHaveCount(0);
  await toBoard(page);await expect(page.locator(legal)).toHaveCount(5);
  await page.mouse.move(p.x,p.y,{steps:4});await expect(page.locator(marks)).toHaveCount(0);
  await page.mouse.up();await clean(page);expect((await saved(page)).state).toEqual(before.state);
});
for(const blocked of ['limit','unsupported','full','sacrifice-short','special'] as const) {
  test(`3C ${blocked} never advertises a legal ordinary slot`,async({page})=>{
    const s=fresh();s.state.players.P1.hand=[({unsupported:'C002','sacrifice-short':'C046',special:'X001'} as Partial<Record<typeof blocked,CardId>>)[blocked]??'C001'];
    if(blocked==='limit')s.state.players.P1.normalSummonsUsedThisTurn=1;
    if(blocked==='full')s.state.players.P1.board=Array.from({length:5},()=>unit('C001','P1'));
    await setup(page,s);const before=await saved(page);await begin(page);await toBoard(page);
    await expect(page.locator(marks)).toHaveCount(0);await expect(page.locator('.active-board .empty-slot:visible')).toHaveCount(0);
    await page.mouse.up();await clean(page);expect((await saved(page)).state).toEqual(before.state);
  });
}
for(const reason of ['Escape','pointercancel','lostcapture','blur','hidden','resize'] as const) {
  test(`3C ${reason} removes guides, ghost and placement intent`,async({page})=>{
    const s=fresh();s.state.players.P1.hand=['C001'];await setup(page,s);await begin(page);await toBoard(page);
    await expect(page.locator(legal)).toHaveCount(5);const before=await saved(page);
    if(reason==='Escape')await page.keyboard.press('Escape');
    if(reason==='resize')await page.setViewportSize({width:740,height:360});
    if(reason==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(reason==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    if(reason==='pointercancel'||reason==='lostcapture')await page.locator('[data-hand-index="0"]').evaluate((e,r)=>e.dispatchEvent(new PointerEvent(r==='pointercancel'?'pointercancel':'lostpointercapture',{bubbles:true,pointerId:1})),reason);
    await clean(page);await page.mouse.up();expect((await saved(page)).state).toEqual(before.state);
  });
}

test('3C final release coordinates override the last rendered target',async({page})=>{
  const s=fresh();s.state.players.P1.hand=['C001'];await setup(page,s);await begin(page);await toBoard(page);
  await expect(page.locator(legal)).toHaveCount(5);
  // Explicit event-order test: release outside after a valid target without a
  // new move event/rendered target. This is not a native touch test.
  const r=(await page.locator('.active-board [data-empty-slot="2"]').boundingBox())!;
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await expect(page.locator('[data-summon-target]')).toHaveCount(1);
  const before=await saved(page);
  await page.locator('[data-hand-index="0"]').evaluate(e=>e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:2,clientY:2})));
  await clean(page);expect((await saved(page)).state).toEqual(before.state);await page.mouse.up();
});

test('3C keyboard selection, arrow navigation, Escape and a lethal-cost summon',async({page})=>{
  const s=fresh();s.state.players.P1.hand=['C004'];s.state.players.P1.health=2;await setup(page,s);
  await page.locator('.stage04-hand-toggle').click();const card=page.locator('[data-hand-index="0"]');
  await card.focus();await page.keyboard.press('Enter');await expect(page.locator(legal)).toHaveCount(5);
  await expect(page.locator('.active-board [data-empty-slot="0"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(page.locator('.active-board [data-empty-slot="1"]')).toBeFocused();
  await page.keyboard.press('Escape');await clean(page);await expect(card).toBeFocused();
  await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await clean(page);expect((await saved(page)).state.players.P1.board[1]?.cardId).toBe('C004');expect((await saved(page)).state.winner).toBe('P2');
});

test('3C full-board sacrifice offers only friendly candidates and preserves the actual sacrifice slot',async({page},info)=>{
  const s=fresh();s.state.players.P1.hand=['C003'];s.state.players.P1.board=Array.from({length:5},()=>unit('C001','P1'));
  s.state.players.P2.board[2]=unit('C001','P2');await setup(page,s);await begin(page);await toBoard(page);
  await expect(page.locator('.active-board[data-summon-mode="sacrifice"]')).toHaveCount(1);
  await expect(page.locator(legal)).toHaveCount(5);await expect(page.locator('.active-board .empty-slot:visible')).toHaveCount(0);
  await shot(page,info,'sacrifice-candidates-not-empty-slots');await page.mouse.up();
  await expect(page.locator('#sacrifice-placement-overlay')).toBeVisible();await expect(page.locator(marks)).toHaveCount(0);
  await page.locator(`[data-sacrifice-placement-id="${s.state.players.P1.board[3]!.instanceId}"]`).click();
  await page.locator('#sacrifice-placement-confirm').click();await clean(page);
  expect((await saved(page)).state.players.P1.board[3]?.cardId).toBe('C003');expect((await saved(page)).state.players.P1.health).toBe(76);
});

test('3C real cross-tab change invalidates pending targets before pointer release',async({page,context})=>{
  const s=fresh();s.state.players.P1.hand=['C001'];await setup(page,s);
  const other=await context.newPage();await other.goto('./');await expect(other.locator('#end-turn')).toBeEnabled();
  await begin(page);await toBoard(page);await expect(page.locator(legal)).toHaveCount(5);
  await other.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
  await clean(page);await page.mouse.up();expect((await saved(page)).state.players.P1.board.every(x=>!x)).toBe(true);
  await other.close();
});


test('3C held keyboard activation cannot confirm a newly focused target',async({page})=>{
  const s=fresh();s.state.players.P1.hand=['C001'];await setup(page,s);
  await page.locator('.stage04-hand-toggle').click();await page.locator('[data-hand-index="0"]').focus();
  const before=await saved(page);
  await page.keyboard.down('Enter');await expect(page.locator(legal)).toHaveCount(5);
  await page.keyboard.down('Enter');await page.keyboard.down('Enter');
  await expect(page.locator(legal)).toHaveCount(5);expect((await saved(page)).state).toEqual(before.state);
  await page.keyboard.up('Enter');await page.keyboard.press('Enter');await clean(page);
  expect((await saved(page)).revision).toBe((before.revision??0)+1);
  expect((await saved(page)).state.players.P1.board[0]?.cardId).toBe('C001');
});


test('3C sacrifice modal cancel preserves cards, costs and summon allowance',async({page},info)=>{
  const s=fresh();s.state.players.P1.hand=['C003'];s.state.players.P1.board[2]=unit('C001','P1');
  await setup(page,s);const before=await saved(page);await begin(page);await toBoard(page);await page.mouse.up();
  const dialog=page.locator('#sacrifice-placement-overlay');await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(e=>(e as HTMLDialogElement).matches(':modal'))).toBe(true);
  await shot(page,info,'usable-sacrifice-confirmation');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await clean(page);
  expect((await saved(page)).state).toEqual(before.state);expect((await saved(page)).revision).toBe(before.revision);
});
