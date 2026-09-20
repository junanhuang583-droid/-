import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
const KEY = 'lushizhizao.basic-game.v1';
function fixture() {
  const s = fresh(); s.demoSpecialsAdded = true;
  s.state.sharedDeck = []; s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  s.state.players.P1.hand = ['C001','C003']; s.state.players.P2.hand = ['C004','C012'];
  s.state.players.P1.board[1] = unit('C001','P1'); s.state.players.P2.board[3] = unit('C012','P2');
  return s;
}
async function seed(page: Page, s = fixture()) {
  await page.addInitScript(({key,s}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, {key:KEY,s});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
async function state(page: Page): Promise<BasicGameSession> { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY); }
async function freezeClick(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => {
    (element as HTMLButtonElement).click();
    const end = document.querySelector('#end-turn')!;
    const tracks = end.getAnimations({subtree:true}).filter(a => a.id.startsWith('turn-plate-'));
    const rotation = tracks.find(a => a.id === 'turn-plate-rotation');
    if (!rotation) throw new Error('Missing live rotation');
    tracks.forEach(a => { a.pause(); a.currentTime = 100; });
    return { handCount: document.querySelectorAll('#active-hand-target .hand-card').length,
      view: document.querySelector<HTMLElement>('.game-shell')!.dataset.viewPlayer };
  });
}
async function resume(page: Page) {
  await page.locator('#end-turn').evaluate(e => e.getAnimations({subtree:true}).filter(a => a.id.startsWith('turn-plate-')).forEach(a => a.play()));
}
async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`); await page.screenshot({path}); await info.attach(name,{path,contentType:'image/png'});
}

for (const [width,height] of [[1536,691],[740,360]] as const) {
  test(`R3 stable mechanism, clear waiting face and private orientation switch ${width}x${height}`, async ({page},info) => {
    await page.setViewportSize({width,height}); await seed(page);
    const errors: string[] = []; page.on('pageerror',e => errors.push(e.message));
    const selectors = ['.game-shell','.battlefield-coordinate-layer','#battlefield-background img','.v2-turn','#end-turn','.v2-turn-core','.v2-turn-plate','.v2-turn-rim','#public-battle-view'];
    const handles = await Promise.all(selectors.map(s => page.locator(s).elementHandle()));
    const before = await state(page);
    const outgoing = await freezeClick(page,'#end-turn');
    expect(outgoing).toEqual({handCount:0,view:'P1'});
    expect((await state(page)).state.activePlayer).toBe('P2');
    expect((await state(page)).state.turn).toBe(before.state.turn+1);
    await expect(page.locator('.active-hero')).toHaveAttribute('data-owner','P1');
    await expect(page.locator('#public-battle-view')).toHaveAttribute('inert','');
    await resume(page); await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(page.locator('#handoff-dialog')).toHaveAttribute('data-phase','waiting');
    await expect(page.locator('.v2-turn-core')).toHaveAttribute('data-turn-face','back');
    await expect(page.locator('#handoff-title')).toHaveText('轮到玩家2');
    const clear = await page.locator('#handoff-dialog').evaluate(e => ({
      backdrop:getComputedStyle(e,'::backdrop').backgroundColor,
      blur:getComputedStyle(e,'::backdrop').backdropFilter,
      bodyBlur:getComputedStyle(document.querySelector('.game-shell')!).filter,
    }));
    expect(clear).toEqual({backdrop:'rgba(0, 0, 0, 0)',blur:'none',bodyBlur:'none'});
    const prompt=await page.locator('#handoff-dialog').boundingBox(), end=await page.locator('#end-turn').boundingBox();
    expect(prompt!.x+prompt!.width).toBeLessThan(end!.x);
    await shot(page,info,'r3-clear-waiting');
    await freezeClick(page,'#reveal-turn');
    // Let only the public-view transition run while the physical rotation stays paused.
    await expect(page.locator('#public-battle-view')).toHaveAttribute('data-view-player','P2');
    await expect(page.locator('.active-hero')).toHaveAttribute('data-owner','P2');
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
    await expect(page.locator('#handoff-dialog')).toHaveAttribute('data-phase','revealing');
    for (let i=0;i<selectors.length;i++) {
      expect(await handles[i]!.evaluate((e,selector) => e.isConnected && e === document.querySelector(selector),selectors[i]!)).toBe(true);
    }
    await expect(page.locator('#end-turn')).toHaveAttribute('data-turn-flipping','true');
    await resume(page); await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('#handoff-dialog')).toHaveCount(0);
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(2);
    expect(await page.locator('#active-hand-target .hand-card').evaluateAll(es => es.map(e => (e as HTMLElement).dataset.cardId))).toEqual(['C004','C012']);
    const after = await state(page);
    expect(after.revision).toBe((before.revision ?? 0)+2);
    expect(after.state.turn).toBe(before.state.turn+1);
    expect(JSON.stringify(after)).not.toMatch(/presentedPlayer|handoffPhase|presentationLocked|turnFlipAnimating/);
    await shot(page,info,'r3-new-player-ready'); expect(errors).toEqual([]);
  });
}

test('R3 native modal traps focus, rejects Escape and held-key repetition',async({page}) => {
  await seed(page); const before=await state(page);
  await page.locator('#end-turn').focus(); await page.keyboard.down('Enter');
  await expect(page.locator('#reveal-turn')).toBeVisible();
  // Holding the old key cannot activate the next player automatically.
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter');
  expect((await state(page)).handoffRequired).toBe(true);
  await page.keyboard.up('Enter');
  await page.keyboard.press('Tab'); await expect(page.locator('#reveal-turn')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#reveal-turn')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#reveal-turn')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#install-app').evaluate(e => (e as HTMLElement).focus());
  expect(await page.evaluate(() => document.activeElement?.closest('#handoff-dialog') !== null)).toBe(true);
  await page.keyboard.press('Space'); await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('#public-battle-view')).toBeFocused();
  expect((await state(page)).revision).toBe((before.revision ?? 0)+2);
});

test('R3 private previews and captured hand gestures are cleared in the click task',async({page}) => {
  await seed(page);
  await page.locator('.active-board .minion').click();
  await expect(page.locator('#ab-minion-inspector')).toBeVisible();
  const instant=await page.locator('#end-turn').evaluate(e => {
    (e as HTMLButtonElement).click();
    return {inspector:!!document.querySelector('#ab-minion-inspector'), cards:document.querySelectorAll('#active-hand-target .hand-card').length};
  });
  expect(instant).toEqual({inspector:false,cards:0});
  await expect(page.locator('#reveal-turn')).toBeVisible(); await page.locator('#reveal-turn').click(); await expect(page.locator('#end-turn')).toBeEnabled();
  await page.locator('.stage04-hand-toggle').click();
  const hand=await page.locator('[data-hand-index="0"]').boundingBox();
  await page.mouse.move(hand!.x+hand!.width/2,Math.min(680,hand!.y+hand!.height/2)); await page.mouse.down();
  await page.mouse.move(hand!.x+hand!.width/2,hand!.y-28,{steps:5});
  await expect(page.locator('.ab-lift-card')).toBeVisible();
  const before=await state(page);
  const hidden=await page.locator('#end-turn').evaluate(e => {
    (e as HTMLButtonElement).click();
    return {ghost:!!document.querySelector('.ab-lift-card'), cards:document.querySelectorAll('.hand-card').length};
  });
  expect(hidden).toEqual({ghost:false,cards:0}); await page.mouse.up();
  await expect(page.locator('#reveal-turn')).toBeVisible();
  expect((await state(page)).revision).toBe((before.revision??0)+1);
});

test('R3 background synthetic clicks cannot bypass the transparent shield',async({page}) => {
  await seed(page); await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
  const before=await state(page);
  await page.locator('.active-board .minion').evaluate(e => {
    e.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,pointerType:'mouse',button:0,isPrimary:true}));
  });
  await page.locator('.stage04-hand-toggle').evaluate(e=>(e as HTMLButtonElement).click());
  await expect(page.locator('#ab-minion-inspector,.attack-drag-ghost,.ab-lift-card')).toHaveCount(0);
  await expect(page.locator('#active-hand-target')).toBeHidden();
  expect(await state(page)).toEqual(before);
});

test('R3 external update interrupts old rotation and public fade without stale writes',async({page,context}) => {
  await seed(page); await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
  const second=await context.newPage(); await second.emulateMedia({reducedMotion:'reduce'}); await second.goto('./');
  await expect(second.locator('#reveal-turn')).toBeVisible();
  await page.bringToFront();
  await freezeClick(page,'#reveal-turn');
  // Second tab sees the already-committed reveal via real storage event.
  await expect(second.locator('#end-turn')).toBeEnabled();
  second.once('dialog',d=>d.accept()); await second.locator('[data-new-game="confirm"]').click();
  await expect(second.locator('#reveal-turn')).toBeVisible();
  await expect.poll(async()=> (await state(page)).gameId).toBe((await state(second)).gameId);
  await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('#end-turn')).not.toHaveAttribute('data-turn-flipping','true');
  await expect(page.locator('#public-battle-view')).toHaveCSS('opacity','1');
  const shared=await state(page); await page.waitForTimeout(500);
  expect((await state(page)).revision).toBe(shared.revision);
  expect((await state(page)).handoffRequired).toBe(true);
  await second.close();
});

test('R3 reload during public switch restores the authoritative ready perspective',async({page}) => {
  await seed(page); await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
  await freezeClick(page,'#reveal-turn'); const committed=await state(page);
  await page.reload(); await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-view-player',committed.state.activePlayer);
  await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(2);
  await expect(page.locator('#handoff-dialog')).toHaveCount(0);
  expect((await state(page)).state).toEqual(committed.state);
});

test('R3 changed motion preference during reveal cannot leave an invisible public view',async({page}) => {
  await seed(page); await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
  await freezeClick(page,'#reveal-turn'); await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#end-turn')).toBeEnabled();
  await expect(page.locator('#public-battle-view')).toHaveCSS('opacity','1');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-view-player','P2');
  await expect(page.locator('#handoff-dialog')).toHaveCount(0);
});

test('R3 pending effect remains usable after revealing through the native modal',async({page}) => {
  const s=fixture(); s.handoffRequired=true;
  s.pendingEffects=[{id:'r3-pending',kind:'petrify',sourcePlayer:'P1',sourceCardId:'C001',sourceName:'控制测试',targetPlayer:'P2',remainingTargets:1,durationOwnTurns:2,selectedTargetIds:[]}];
  await seed(page,s); await expect(page.locator('#reveal-turn')).toBeVisible();
  await page.locator('#reveal-turn').click(); await expect(page.locator('#handoff-dialog')).toHaveCount(0);
  await expect(page.locator('#end-turn')).toBeDisabled();
  await page.locator('[data-effect-target]').click();
  await expect(page.locator('#end-turn')).toBeEnabled();
  expect((await state(page)).pendingEffects).toHaveLength(0);
});
