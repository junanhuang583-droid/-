import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { checkTurnRelease } from "./check-turn-release.mjs";

const [url, expected] = process.argv.slice(2);
assert(url && expected, "Provide the Pages URL and expected source SHA");
const origin = new URL(url);
assert(["http:", "https:"].includes(origin.protocol), "Expected an HTTP site");
const KEY = "lushizhizao.basic-game.v1";
const output = "published-check";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [width, height] of [[1536, 691], [1400, 500], [896, 414], [740, 360]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const result = { width, height, status: "running", errors };
    results.push(result);
    try {
      let info;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await context.request.get(new URL(`build-info.json?verify=${Date.now()}`, origin).href);
        if (response.ok()) {
          info = await response.json();
          if (info.sourceCommit === expected) break;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      assert.equal(info?.sourceCommit, expected, "Published version differs from accepted source");
      result.info = info;
      await page.goto(origin.href, { waitUntil: "networkidle" });
      await page.waitForSelector("#reveal-turn");
      await page.click("#reveal-turn");
      await page.waitForSelector("#end-turn.end-turn-art-ready:not(:disabled)");
      await page.screenshot({ path: `${output}/${width}x${height}-opening.png` });
      const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
      await page.click("#end-turn");
      await page.waitForSelector("#reveal-turn");
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
      assert.equal(after.state.turn, before.state.turn + 1);
      await page.click("#reveal-turn");
      await page.waitForSelector("#end-turn:not(:disabled)");
      result.turn = { before: before.state.turn, after: after.state.turn };

      // This is an isolated acceptance browser, not the user's saved game.
      // Stress both complete rows on the actual published application.
      await page.evaluate(key => {
        const session = JSON.parse(localStorage.getItem(key));
        session.handoffRequired = false;
        session.pendingEffects = [];
        session.demoSpecialsAdded = true;
        for (const owner of ["P1", "P2"]) {
          session.state.players[owner].board = Array.from({ length: 5 }, (_, index) => ({
            instanceId: `published-${owner}-${index}`, cardId: "C003", owner, controller: owner,
            currentHealth: 8, attackModifier: 0, attacksUsedThisTurn: 0, summonedOnTurn: 0, statuses: []
          }));
        }
        localStorage.setItem(key, JSON.stringify(session));
      }, KEY);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector("#end-turn.end-turn-art-ready:not(:disabled)");
      const geometry = await page.evaluate(async () => {
        const plane = document.querySelector(".battlefield-coordinate-layer");
        const background = document.querySelector("#battlefield-background img");
        await background.decode();
        const button = document.querySelector("#end-turn");
        const turnArt = [...button.querySelectorAll(".v2-turn-core img")];
        await Promise.all(turnArt.map(image => image.decode()));
        const rect = element => element.getBoundingClientRect().toJSON();
        const hit = element => {
          const r = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        };
        return {
          plane: rect(plane), image: rect(background), authored: { width: plane.offsetWidth, height: plane.offsetHeight },
          imageDecoded: background.naturalWidth > 0, artworkDecoded: turnArt.length >= 2 && turnArt.every(image => image.naturalWidth > 0),
          button: rect(button), buttonHit: hit(button),
          fakeSocket: Boolean(document.querySelector(".battlefield-fusion-layer,.stage072b-end-turn-socket")),
          scene: rect(document.querySelector(".scene-lane")),
          rows: ["active", "opponent"].map(side => ({
            side, hero: rect(document.querySelector(`.${side}-hero`)), row: rect(document.querySelector(`.${side}-board .board-row`)),
            units: [...document.querySelectorAll(`.${side}-board .minion`)].map(element => ({
              rect: rect(element), hit: hit(element), position: getComputedStyle(element).position
            }))
          }))
        };
      });
      result.geometry = geometry;
      assert(geometry.imageDecoded && geometry.artworkDecoded && geometry.buttonHit);
      assert(!geometry.fakeSocket);
      assert.deepEqual(geometry.authored, { width: 1152, height: 648 });
      assert(Math.abs(geometry.plane.x - geometry.image.x) < 1);
      assert(Math.abs(geometry.plane.width - geometry.image.width) < 1);
      assert(geometry.image.x <= 0 && geometry.image.y <= 0);
      assert(geometry.image.width >= width - 1 && geometry.image.height >= height - 1);
      assert(geometry.button.x > 0 && geometry.button.right < width);
      assert(geometry.button.height >= 43);
      for (const row of geometry.rows) {
        assert.equal(row.units.length, 5);
        for (const [index, unit] of row.units.entries()) {
          const r = unit.rect;
          assert(unit.hit && unit.position === "absolute");
          assert(Math.abs(r.y + r.height / 2 - row.row.y - row.row.height / 2) < 1.5);
          if (index > 0) assert(r.x > row.units[index - 1].rect.right);
          if (row.side === "opponent") assert(r.bottom < geometry.scene.y && r.y > row.hero.bottom);
          else assert(r.y > geometry.scene.bottom && r.bottom < row.hero.y);
        }
      }
      await page.screenshot({ path: `${output}/${width}x${height}-ten-minions.png` });
      assert.deepEqual(errors, []);
      result.status = "passed";
    } catch (error) {
      result.status = "failed";
      result.error = String(error);
      await page.screenshot({ path: `${output}/${width}x${height}-failed.png` }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await checkTurnRelease(browser, origin.href, expected, output);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ sourceCommit: expected, results }, null, 2));
  await browser.close();
}
console.log(`Published acceptance passed: ${results.length} viewports, source ${expected}`);
