import { test, expect } from "@playwright/test";
import { fresh } from "../baseline-fixtures.js";

const KEY = "lushizhizao.basic-game.v1";

test("an old tab can fetch its exact previous-build asset after the server removes it", async ({ page }) => {
  const session = fresh(); session.demoSpecialsAdded = true;
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: KEY, value: session });
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const result = await page.evaluate(async () => {
    const path = new URL("./assets/previous-build-hash.js", location.href).href;
    const old = await caches.open("card-game-shell-previous-test");
    await old.put(path, new Response("/* exact retired bundle */", { headers: { "Content-Type": "text/javascript" } }));
    const response = await fetch(path);
    const absent = await fetch(new URL("./assets/never-cached.js", location.href));
    return { status: response.status, body: await response.text(), absentStatus: absent.status, absentBody: await absent.text() };
  });
  expect(result.status).toBe(200);
  expect(result.body).toBe("/* exact retired bundle */");
  expect(result.absentStatus).toBe(404);
  expect(result.absentBody).not.toContain("<html");
});

test("normal-motion dealing locks input, commits once, and survives a reload during draw", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const session = fresh(); session.demoSpecialsAdded = true;
  session.state.players.P2.hand = ["C001"];
  session.state.sharedDeck = Array.from({ length: 30 }, () => "C001" as const);
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: KEY, value: session });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#end-turn")).toBeEnabled();
  await page.locator("#end-turn").click();
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(before.state.players.P2.hand).toHaveLength(6);
  await page.locator("#reveal-turn").click();
  await expect(page.locator(".flying-card").first()).toBeVisible();
  await expect(page.locator("#end-turn")).toBeDisabled();
  const path = info.outputPath("normal-motion-draw.png"); await page.screenshot({ path });
  await info.attach("normal-motion-draw", { path, contentType: "image/png" });
  await page.reload();
  await expect(page.locator("#end-turn")).toBeEnabled();
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(after.state.players.P2.hand).toEqual(before.state.players.P2.hand);
  expect(after.state.sharedDeck).toEqual(before.state.sharedDeck);
  expect(after.state.turn).toBe(before.state.turn);
  expect(after.handoffRequired).toBe(false);
  expect(errors).toEqual([]);
});
