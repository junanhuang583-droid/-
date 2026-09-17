import { test, expect, type Page } from "@playwright/test";
import { fresh, unit } from "../baseline-fixtures.js";
import type { BasicGameSession } from "../../src/core/basic-game.js";

const KEY = "lushizhizao.basic-game.v1";
const sizes = [[1536, 691], [1400, 500], [1152, 648], [896, 414], [740, 360], [1920, 1080]] as const;

async function seed(page: Page, session: BasicGameSession) {
  session.demoSpecialsAdded = true;
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: KEY, value: session });
}
async function ready(page: Page) {
  await page.goto("./");
  await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/);
  await expect(page.locator("body")).toHaveClass(/foundation-cd-enabled/);
}
async function checkLine(page: Page, side: "active" | "opponent", count: number) {
  const row = page.locator(`.${side}-board .board-row`);
  const units = row.locator(".minion");
  await expect(units).toHaveCount(count);
  const board = (await row.boundingBox())!;
  const boxes = await units.evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
      position: getComputedStyle(element).position };
  }));
  const scene = (await page.locator(".scene-lane").boundingBox())!;
  const hero = (await page.locator(`.${side}-hero`).boundingBox())!;
  // Every unit must lie on the row. Testing only the first unit missed the
  // injected position:relative regression that produced a diagonal staircase.
  for (const r of boxes) {
    expect(r.position).toBe("absolute");
    expect(Math.abs(r.y + r.height / 2 - (board.y + board.height / 2))).toBeLessThan(1.5);
    expect(r.x).toBeGreaterThanOrEqual(board.x - 1);
    expect(r.right).toBeLessThanOrEqual(board.x + board.width + 1);
    if (side === "opponent") {
      expect(r.bottom).toBeLessThan(scene.y);
      expect(r.y).toBeGreaterThan(hero.y + hero.height);
    } else {
      expect(r.y).toBeGreaterThan(scene.y + scene.height);
      expect(r.bottom).toBeLessThan(hero.y);
    }
  }
  for (let i = 1; i < boxes.length; i += 1) expect(boxes[i]!.x).toBeGreaterThan(boxes[i - 1]!.right);
  const first = boxes[0]!, last = boxes.at(-1)!;
  expect(Math.abs((first.x + last.right) / 2 - (board.x + board.width / 2))).toBeLessThan(1.5);
  const clickable = await units.evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".minion") === element;
  }));
  expect(clickable.every(Boolean)).toBe(true);
}

for (const [width, height] of sizes) {
  test(`all ten minions stay on their own lines ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const session = fresh();
    for (const side of ["P1", "P2"] as const) session.state.players[side].board = Array.from({ length: 5 }, () => unit("C003", side));
    session.state.players.P1.hand = ["C001", "C002", "C003"];
    await seed(page, session);
    await ready(page);
    await checkLine(page, "active", 5);
    await checkLine(page, "opponent", 5);
    await expect(page.locator("#effects-ui-style")).toHaveCount(0);
    const path = info.outputPath("ten-minions.png");
    await page.screenshot({ path });
    await info.attach("ten-minions", { path, contentType: "image/png" });
  });
}

test("sparse logical slots produce centered compact rows for one to five units", async ({ page }) => {
  await page.setViewportSize({ width: 896, height: 414 });
  await seed(page, fresh());
  await ready(page);
  const orders = [[4], [0, 4], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4]];
  for (const slots of orders) {
    const session = fresh(); session.demoSpecialsAdded = true;
    for (const owner of ["P1", "P2"] as const) {
      for (const slot of slots) session.state.players[owner].board[slot] = unit("C003", owner);
    }
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: session });
    await page.reload();
    await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/);
    await checkLine(page, "active", slots.length);
    await checkLine(page, "opponent", slots.length);
  }
});

for (const [width, height] of [[896, 414], [740, 360]] as const) {
  test(`touch drag to the rightmost logical slot ${width}x${height}`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const session = fresh(); session.state.players.P1.hand = ["C001", "C002", "C003"];
      session.state.players.P1.board[2] = unit("C003", "P1");
      await seed(page, session);
      await page.goto("http://127.0.0.1:4174/-/");
      await expect(page.locator("#end-turn")).toHaveClass(/end-turn-art-ready/);
      await page.locator(".stage04-hand-toggle").tap();
      const card = (await page.locator('[data-hand-index="0"]').boundingBox())!;
      const board = (await page.locator(".active-board").boundingBox())!;
      const client = await context.newCDPSession(page);
      const start = { x: card.x + card.width / 2, y: Math.min(height - 12, card.y + card.height / 2) };
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (board.x + board.width / 2 - start.x) * t, y: start.y + (board.y + board.height / 2 - start.y) * t }] });
      }
      const target = page.locator('.active-board [data-empty-slot="4"]');
      await expect(target).toBeVisible();
      const slot = (await target.boundingBox())!;
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 }] });
      await page.waitForTimeout(80);
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.locator(".active-board .minion")).toHaveCount(2);
      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
      expect(stored.state.players.P1.board[4]?.cardId).toBe("C001");
      await checkLine(page, "active", 2);
      const path = info.outputPath("touch-summon.png"); await page.screenshot({ path });
      await info.attach("touch-summon", { path, contentType: "image/png" });
    } finally { await context.close(); }
  });
}
