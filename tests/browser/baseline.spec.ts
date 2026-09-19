import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { fresh, unit } from "../baseline-fixtures.js";
import type { BasicGameSession } from "../../src/core/basic-game.js";
import { FIXED_SOCKETS } from "../../src/application/battlefield-geometry.js";
const KEY = "lushizhizao.basic-game.v1";
async function seed(page: Page, session = fresh()) {
  session.demoSpecialsAdded = true;
  await page.addInitScript(({ key, session }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session)); }, { key: KEY, session });
}
async function state(page: Page): Promise<BasicGameSession> { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY); }
async function ready(page: Page) {
  await page.goto("./");
  await expect(page.locator(".battlefield-coordinate-layer")).toHaveAttribute("data-viewport-scale", /.+/);
  await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/);
  await expect(page.locator("#battlefield-background img")).toBeVisible();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`); await page.screenshot({ path }); await info.attach(name, { path, contentType: "image/png" });
}
function close(a: number, b: number) { expect(Math.abs(a - b)).toBeLessThan(1.5); }

for (const [width, height] of [[1536, 691], [1400, 500], [1152, 648], [896, 414], [740, 360], [1920, 1080]]) {
  test(`world and objects share transform ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width: width!, height: height! }); const s = fresh();
    s.state.players.P1.board = Array.from({ length: 5 }, () => unit("C001", "P1"));
    s.state.players.P2.board = Array.from({ length: 5 }, () => unit("C001", "P2")); s.state.players.P1.hand = ["C001", "C002", "C003"];
    await seed(page, s); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await ready(page);
    const plane = await page.locator(".battlefield-coordinate-layer").boundingBox(); const image = await page.locator("#battlefield-background img").boundingBox();
    expect(plane && image).toBeTruthy(); close(plane!.x, image!.x); close(plane!.y, image!.y); close(plane!.width, image!.width); close(plane!.height, image!.height);
    expect(image!.x).toBeLessThanOrEqual(0); expect(image!.y).toBeLessThanOrEqual(0); expect(image!.width).toBeGreaterThanOrEqual(width! - 1); expect(image!.height).toBeGreaterThanOrEqual(height! - 1);
    const button = await page.locator("#end-turn").boundingBox(); expect(button).toBeTruthy();
    close(button!.x + button!.width / 2, plane!.x + FIXED_SOCKETS.endTurn.x * plane!.width / 1152);
    close(button!.y + button!.height / 2, plane!.y + FIXED_SOCKETS.endTurn.y * plane!.height / 648);
    expect(button!.x).toBeGreaterThan(0); expect(button!.x + button!.width).toBeLessThan(width!); expect(button!.height).toBeGreaterThan(35);
    expect(await page.locator(".battlefield-fusion-layer,.stage072b-end-turn-socket").count()).toBe(0);
    const scene = await page.locator(".scene-lane").boundingBox();
    for (const cls of ["opponent", "active"]) {
      const units = page.locator(`.${cls}-board .minion`); await expect(units).toHaveCount(5);
      const boxes = await units.evaluateAll(es => es.map(e => e.getBoundingClientRect().toJSON()));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThan(boxes[i - 1]!.right);
      if (cls === "opponent") expect(boxes[0]!.bottom).toBeLessThan(scene!.y);
      else expect(boxes[0]!.y).toBeGreaterThan(scene!.y + scene!.height);
    }
    expect(errors).toEqual([]); await screenshot(page, info, "full-battlefield");
  });
}

test("real pointer drag summons; turn handoff, bonus draw and reload remain coherent", async ({ page }, info) => {
  const s = fresh(); s.state.players.P1.hand = ["C001", "C002", "C003"];
  s.state.players.P2.hand = ["C001"]; s.state.sharedDeck = Array.from({ length: 30 }, () => "C001" as const);
  await seed(page, s); await ready(page); await page.locator(".stage04-hand-toggle").click();
  await expect(page.locator("body")).toHaveClass(/stage04-hand-expanded/);
  const card = await page.locator('[data-hand-index="0"]').boundingBox(); const board = await page.locator(".active-board").boundingBox();
  await page.mouse.move(card!.x + card!.width / 2, Math.min(670, card!.y + card!.height / 2)); await page.mouse.down();
  await page.mouse.move(board!.x + board!.width / 2, board!.y + board!.height / 2, { steps: 15 });
  await expect(page.locator('.active-board [data-empty-slot="2"]')).toBeVisible();
  const slot = await page.locator('.active-board [data-empty-slot="2"]').boundingBox(); await page.mouse.move(slot!.x + slot!.width / 2, slot!.y + slot!.height / 2, { steps: 4 }); await page.mouse.up();
  await expect(page.locator(".active-board .minion")).toHaveCount(1);
  expect((await state(page)).state.players.P1.board[2]?.cardId).toBe("C001");
  await page.locator("#end-turn").click(); await expect(page.locator("#reveal-turn")).toBeVisible();
  await expect(page.locator("#active-hand-target")).toBeHidden(); expect((await state(page)).state.players.P2.hand).toHaveLength(6);
  await page.locator("#reveal-turn").click(); await expect(page.locator("#end-turn")).toBeEnabled();
  const before = await state(page); await page.reload(); await expect(page.locator("#end-turn")).toBeEnabled();
  expect((await state(page)).state).toEqual(before.state); await screenshot(page, info, "after-drag-and-handoff");
});

test("selection attack uses the same command boundary", async ({ page }) => {
  const s = fresh(); const attacker = unit("C001", "P1"); attacker.attackModifier = 20;
  const victim = unit("C001", "P2", 2); s.state.players.P1.board[0] = attacker; s.state.players.P2.board[0] = victim;
  await seed(page, s); await ready(page); await page.locator(`[data-minion-id="${attacker.instanceId}"]`).click();
  await page.locator(".ab-inspector-attack").click(); await page.locator(`[data-minion-id="${victim.instanceId}"]`).click();
  await expect(page.locator(".opponent-board .minion")).toHaveCount(0);
  expect((await state(page)).state.deathLog.some(d => d.instanceId === victim.instanceId)).toBe(true);
});

test("real target picker: fire damage killing fish produces its deathrattle token", async ({ page }, info) => {
  const s = fresh(); const fish = unit("C002", "P2", 4); s.state.players.P2.board[1] = fish;
  s.pendingEffects = [{ id: "fire-choice", kind: "unit", sourcePlayer: "P1", sourceCardId: "C034", sourceName: "火山之灵", action: "damage", amount: 4, scope: "all_units", remainingTargets: 1, selectedKeys: [], text: "死后对选中单位造成4点伤害" }];
  await seed(page, s); await ready(page); await expect(page.locator("#end-turn")).toBeDisabled();
  await page.locator(`[data-unit-target="minion:${fish.instanceId}"]`).click();
  await expect(page.locator("#unit-effect-overlay")).toHaveCount(0); await expect(page.locator("#end-turn")).toBeEnabled();
  expect((await state(page)).state.players.P2.board[1]?.cardId).toBe("T001"); await screenshot(page, info, "targeted-death-chain");
});

test("control queue survives reload between two different target choices", async ({ page }) => {
  const s = fresh(); const first = unit("C001", "P2"), second = unit("C001", "P2"); s.state.players.P2.board = [first, second, null, null, null];
  s.pendingEffects = [{ id: "two-targets", kind: "petrify", sourcePlayer: "P1", sourceCardId: "C001", sourceName: "控制测试", targetPlayer: "P2", remainingTargets: 2, durationOwnTurns: 2, selectedTargetIds: [] }];
  await seed(page, s); await ready(page); await page.locator(`[data-effect-target="${first.instanceId}"]`).click();
  expect((await state(page)).pendingEffects?.[0]?.remainingTargets).toBe(1);
  await page.reload(); await expect(page.locator(`[data-effect-target="${first.instanceId}"]`)).toHaveCount(0);
  await page.locator(`[data-effect-target="${second.instanceId}"]`).click(); await expect(page.locator("#rule-choice-overlay")).toHaveCount(0);
  expect((await state(page)).pendingEffects).toHaveLength(0);
});

for (const failure of ["missing", "corrupt"]) {
  test(`art ${failure}: visible text fallback remains usable`, async ({ page }, info) => {
    await seed(page); await page.route("**/*turn-core-*.webp", r => failure === "missing" ? r.abort() : r.fulfill({ status: 200, contentType: "image/webp", body: "broken bytes" }));
    await page.goto("./"); await expect(page.locator(".battlefield-coordinate-layer")).toHaveAttribute("data-viewport-scale", /.+/);
    await expect(page.locator("#end-turn")).not.toHaveClass(/end-turn-art-ready/);
    await expect(page.locator(".end-turn-label")).toHaveCSS("opacity", "1"); await screenshot(page, info, "fallback");
    await page.locator("#end-turn").click(); await expect(page.locator("#reveal-turn")).toBeVisible();
  });
}

test("real storage event synchronizes another tab without periodic rewrite loops", async ({ page, context }) => {
  await seed(page); await ready(page); const second = await context.newPage(); await second.goto("./"); await expect(second.locator("#end-turn")).toBeEnabled();
  await page.locator("#end-turn").click(); await expect(second.locator("#reveal-turn")).toBeVisible();
  const current = await state(second); await page.waitForTimeout(5500); expect((await state(second)).revision).toBe(current.revision);
  await second.close();
});

test("complete offline shell restarts under the Pages subpath and preserves save", async ({ page, context }, info) => {
  await seed(page); await ready(page); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const before = await state(page); await context.setOffline(true); await page.reload();
  await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/); expect((await state(page)).state).toEqual(before.state);
  await page.locator("#end-turn").click(); expect((await state(page)).state.turn).toBe(before.state.turn + 1); await screenshot(page, info, "offline-after-turn");
  await context.setOffline(false);
});

test("failed worker install preserves existing shell and unrelated origin caches", async ({ page, context }) => {
  await seed(page); await ready(page); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.evaluate(async () => { await caches.open("unrelated-app-cache"); });
  const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("./test-broken-sw.js", { scope: "./" });
    const worker = registration.installing; if (worker) await new Promise<void>(resolve => { if (worker.state === "redundant") resolve(); else worker.addEventListener("statechange", () => { if (worker.state === "redundant") resolve(); }); });
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(before);
  const keys = await page.evaluate(() => caches.keys()); expect(keys).toContain("unrelated-app-cache"); expect(keys).not.toContain("card-game-shell-test-broken");
  await context.setOffline(true); await page.reload(); await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/); await context.setOffline(false);
});

test("new game confirmation, install help, and fullscreen controls remain available", async ({ page }) => {
  await seed(page); await ready(page); const old = await state(page); page.once("dialog", d => d.dismiss());
  await page.locator('[data-new-game="confirm"]').click(); expect((await state(page)).gameId).toBe(old.gameId);
  await page.locator("#install-app").click(); await expect(page.locator("#pwa-install-help")).toBeVisible(); await page.locator(".pwa-install-done").click();
  await page.locator("#fullscreen-toggle").click();
  if (await page.evaluate(() => document.fullscreenEnabled)) await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('[data-new-game="confirm"]')).toBeVisible();
  page.once("dialog", d => d.accept()); await page.locator('[data-new-game="confirm"]').click();
  await expect(page.locator("#reveal-turn")).toBeVisible(); expect((await state(page)).gameId).not.toBe(old.gameId);
});


test("end-turn face follows authoritative hot-seat handoff state", async ({ page }, info) => {
  const s = fresh();
  s.state.sharedDeck = [];
  s.state.players.P1.discardPile = [];
  s.state.players.P2.discardPile = [];
  await seed(page, s);
  await ready(page);

  const button = page.locator("#end-turn");
  const core = page.locator(".v2-turn-core");
  await expect(button).toHaveAttribute("data-turn-state", "front-ready");
  await expect(core).toHaveAttribute("data-turn-face", "front");
  await expect(page.locator('[data-turn-face-panel="front"]')).toHaveCSS("visibility", "visible");
  await expect(page.locator('[data-turn-face-panel="back"]')).toHaveCSS("visibility", "hidden");
  await screenshot(page, info, "turn-front-ready");

  await button.click();
  await expect(page.locator("#reveal-turn")).toBeVisible();
  await expect(button).toHaveAttribute("data-turn-state", "back-waiting");
  await expect(button).toBeDisabled();
  await expect(core).toHaveAttribute("data-turn-face", "back");
  await expect(page.locator('[data-turn-face-panel="front"]')).toHaveCSS("visibility", "hidden");
  await expect(page.locator('[data-turn-face-panel="back"]')).toHaveCSS("visibility", "visible");
  await screenshot(page, info, "turn-back-waiting");

  await page.locator("#reveal-turn").click();
  await expect(button).toHaveAttribute("data-turn-state", "front-ready");
  await expect(button).toBeEnabled();
  await expect(core).toHaveAttribute("data-turn-face", "front");
  await expect(page.locator('[data-turn-face-panel="front"]')).toHaveCSS("visibility", "visible");
  await expect(page.locator('[data-turn-face-panel="back"]')).toHaveCSS("visibility", "hidden");
  await screenshot(page, info, "turn-front-restored");
});
