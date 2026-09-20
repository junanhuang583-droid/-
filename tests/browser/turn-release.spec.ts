import { test, expect, type Page } from '@playwright/test';
import { fresh, unit } from '../baseline-fixtures.js';
import type { BasicGameSession } from '../../src/core/basic-game.js';
const KEY = 'lushizhizao.basic-game.v1';

function fixture(longHand = false) {
  const s = fresh(); s.demoSpecialsAdded = true;
  s.state.sharedDeck = Array.from({ length: 100 }, () => 'C001' as const);
  s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  s.state.players.P1.hand = Array.from({ length: longHand ? 28 : 3 }, () => 'C004' as const);
  s.state.players.P2.hand = Array.from({ length: longHand ? 37 : 4 }, () => 'C012' as const);
  for (const owner of ['P1', 'P2'] as const)
    s.state.players[owner].board = Array.from({ length: 5 }, () => unit('C001', owner));
  return s;
}
async function start(page: Page, s = fixture()) {
  await page.addInitScript(({ key, s }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s));
  }, { key: KEY, s });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
async function state(page: Page): Promise<BasicGameSession> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
}
async function pause(page: Page, selector: string) {
  await page.locator(selector).evaluate(element => {
    (element as HTMLButtonElement).click();
    const tracks = document.querySelector('#end-turn')!.getAnimations({ subtree: true });
    if (!tracks.some(a => a.id === 'turn-plate-rotation')) throw new Error('Missing physical rotation');
    tracks.filter(a => a.id.startsWith('turn-plate-')).forEach(a => { a.pause(); a.currentTime = 100; });
  });
}

for (const [width, height] of [[1536, 691], [740, 360]] as const) {
  test(`R4 long-hand full-board normal handoff preserves all cards ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await start(page, fixture(true));
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const before = await state(page);
    await expect(page.locator('.minion')).toHaveCount(10);
    const plate = await page.locator('.v2-turn-plate').elementHandle();
    await page.locator('#end-turn').click();
    await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
    const handoff = await state(page);
    expect(handoff.state.players.P1.hand).toEqual(before.state.players.P1.hand);
    expect(handoff.state.players.P2.hand).toHaveLength(42);
    expect(handoff.state.sharedDeck).toHaveLength(95);
    await page.screenshot({ path: info.outputPath('full-board-clear-handoff.png') });
    await page.locator('#reveal-turn').click();
    await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(42);
    await expect(page.locator('#active-hand-target')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#public-battle-view')).not.toHaveAttribute('inert', '');
    expect(await plate!.evaluate(e => e.isConnected && e === document.querySelector('.v2-turn-plate'))).toBe(true);
    expect((await state(page)).state).toEqual(handoff.state);
    expect((await state(page)).revision).toBe((before.revision ?? 0) + 2);
    await page.locator('.stage04-hand-toggle').click();
    await expect(page.locator('body')).toHaveClass(/stage04-hand-expanded/);
    await page.screenshot({ path: info.outputPath('long-hand-ready.png') });
    expect(errors).toEqual([]);
  });
}

test.describe('R4 native touch path', () => {
  test.use({ hasTouch: true, viewport: { width: 740, height: 360 } });
  test('rapid touch taps end and reveal only once, including draw lock', async ({ page }) => {
    await start(page); const before = await state(page);
    const box = await page.locator('#end-turn').boundingBox();
    for (let i = 0; i < 3; i++) await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator('#reveal-turn')).toBeVisible();
    const handoff = await state(page);
    expect(handoff.revision).toBe((before.revision ?? 0) + 1);
    const reveal = await page.locator('#reveal-turn').boundingBox();
    for (let i = 0; i < 3; i++) await page.touchscreen.tap(reveal!.x + reveal!.width / 2, reveal!.y + reveal!.height / 2);
    await expect(page.locator('#end-turn')).toBeEnabled();
    const after = await state(page);
    expect(after.revision).toBe((before.revision ?? 0) + 2);
    expect(after.state).toEqual(handoff.state);
    expect(after.handoffRequired).toBe(false);
    await expect(page.locator('#handoff-dialog')).toHaveCount(0);
  });
});

for (const selector of ['#end-turn', '#reveal-turn'] as const) {
  test(`R4 visibility interruption during ${selector} settles without extra draws`, async ({ page }) => {
    await start(page);
    if (selector === '#reveal-turn') {
      await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
    }
    await pause(page, selector); const committed = await state(page);
    // Explicit lifecycle-event emulation, not a claim of physical phone suspension.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (selector === '#end-turn') await expect(page.locator('#reveal-turn')).toBeVisible();
    else await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('#public-battle-view')).toHaveCSS('opacity', '1');
    await expect(page.locator('.flying-card')).toHaveCount(0);
    expect((await state(page)).state).toEqual(committed.state);
    expect((await state(page)).revision).toBe(committed.revision);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden'); Reflect.deleteProperty(document, 'visibilityState');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(450);
    expect((await state(page)).revision).toBe(committed.revision);
    await expect(page.locator('#end-turn')).not.toHaveAttribute('data-turn-flipping', 'true');
  });
}

test('R4 save failure does not freeze the turn presenter or repeat the in-memory command', async ({ page }) => {
  await start(page); const before = await state(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, '__restoreWrites', () => { Storage.prototype.setItem = original; });
    Storage.prototype.setItem = function (this: Storage, name: string, value: string): void {
      if (name.startsWith(key)) throw new DOMException('Full storage test', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, KEY);
  await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
  await expect(page.locator('.status-toast')).toContainText('自动保存失败');
  await page.locator('#reveal-turn').click(); await expect(page.locator('#end-turn')).toBeEnabled();
  // Disk is deliberately stale; the DOM is rendered from the real in-memory store.
  expect(await state(page)).toEqual(before);
  await expect(page.locator('.game-shell')).toHaveAttribute('data-view-player', 'P2');
  await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(9);
  await page.evaluate(() => {
    const restore = Reflect.get(window, '__restoreWrites') as () => void;
    restore(); window.dispatchEvent(new Event('pagehide'));
  });
  const recovered = await state(page);
  expect(recovered.revision).toBe((before.revision ?? 0) + 2);
  expect(recovered.state.turn).toBe(before.state.turn + 1);
  expect(recovered.handoffRequired).toBe(false);
  expect(recovered.state.players.P2.hand).toHaveLength(9);
});

for (const failure of ['missing', 'corrupt'] as const) {
  test(`R4 normal-speed both-face fallback with ${failure} art and modal privacy`, async ({ page }) => {
    await page.route('**/*turn-core-*.webp', route => failure === 'missing' ? route.abort()
      : route.fulfill({ status: 200, contentType: 'image/webp', body: 'invalid-art' }));
    const s = fixture(); s.state.sharedDeck = [];
    await page.addInitScript(({key, s}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s)); }, { key: KEY, s });
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('./');
    await expect(page.locator('.end-turn-label')).toBeVisible();
    const before = await state(page);
    await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(page.locator('.end-turn-back-fallback')).toBeVisible();
    await expect(page.locator('#active-hand-target .hand-card')).toHaveCount(0);
    await page.locator('#reveal-turn').click(); await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('.end-turn-label')).toBeVisible();
    expect((await state(page)).revision).toBe((before.revision ?? 0) + 2);
    expect((await state(page)).state.turn).toBe(before.state.turn + 1);
  });
}
