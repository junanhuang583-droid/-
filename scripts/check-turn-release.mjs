import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = 'lushizhizao.basic-game.v1';

/** Test the real served bundle. Only the acceptance browser's save is seeded.
 * Motion is observed at requestAnimationFrame, never paused, sought or slowed. */
export async function checkTurnRelease(browser, url, sourceCommit, output) {
  const reports = [];
  const videoDir = join(output, 'motion-videos');
  await mkdir(videoDir, { recursive: true });
  try {
    for (const [width, height] of [[1536, 691], [740, 360]]) {
      const context = await browser.newContext({ viewport: { width, height },
        reducedMotion: 'reduce', recordVideo: { dir: videoDir, size: { width, height } } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const report = { width, height, sourceCommit, status: 'running', errors, samples: {} };
      reports.push(report);
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.locator('#reveal-turn').click();
        await page.locator('#end-turn:not(:disabled)').waitFor();
        await page.evaluate(key => {
          const s = JSON.parse(localStorage.getItem(key));
          s.handoffRequired = false; s.pendingEffects = []; s.demoSpecialsAdded = true;
          s.state.activePlayer = 'P1'; s.state.firstPlayer = 'P1';
          s.turnsStarted = { P1: 1, P2: 0 };
          s.state.sharedDeck = [];
          for (const owner of ['P1', 'P2']) {
            s.state.players[owner].discardPile = [];
            s.state.players[owner].board = Array.from({ length: 5 }, (_, i) => i % 2 === 0 ? {
              instanceId: `motion-${owner}-${i}`, cardId: 'C001', owner, controller: owner,
              currentHealth: 4, attackModifier: 0, attacksUsedThisTurn: 0, summonedOnTurn: 0, statuses: [],
            } : null);
          }
          s.state.players.P1.hand = ['C001', 'C004', 'C012'];
          s.state.players.P2.hand = ['C004', 'C012', 'C001', 'C004'];
          localStorage.setItem(key, JSON.stringify(s));
        }, KEY);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('#end-turn.end-turn-art-ready:not(:disabled)').waitFor();
        const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
        await page.screenshot({ path: join(output, `${width}x${height}-motion-front.png`) });

        for (const selector of ['#end-turn', '#reveal-turn']) {
          await page.evaluate(({ selector, key }) => {
            const oldButton = document.querySelector('#end-turn');
            const oldPlate = oldButton.querySelector('.v2-turn-plate');
            const oldBackground = document.querySelector('#battlefield-background img');
            const fixed = oldButton.getBoundingClientRect();
            const rim = document.querySelector('.v2-turn-rim').getBoundingClientRect();
            window.__turnRelease = { done: false, frames: [] };
            document.querySelector(selector).addEventListener('click', () => {
              const start = performance.now();
              function sample() {
                const button = document.querySelector('#end-turn');
                const plate = button.querySelector('.v2-turn-plate');
                const core = button.querySelector('.v2-turn-core');
                const matrix = new DOMMatrixReadOnly(getComputedStyle(plate).transform);
                const rawAngle = Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI;
                const box = button.getBoundingClientRect();
                const rimNow = document.querySelector('.v2-turn-rim').getBoundingClientRect();
                const session = JSON.parse(localStorage.getItem(key));
                const moving = button.dataset.turnFlipping === 'true';
                window.__turnRelease.frames.push({ ms: performance.now() - start, moving,
                  angle: rawAngle < -.01 ? rawAngle + 360 : Math.max(0, rawAngle),
                  m23: matrix.m23, glow: Number(getComputedStyle(button.querySelector('.v2-turn-light')).opacity),
                  hands: document.querySelectorAll('#active-hand-target .hand-card').length,
                  view: document.querySelector('.game-shell').dataset.viewPlayer,
                  turn: session.state.turn, handoff: session.handoffRequired,
                  stable: button === oldButton && plate === oldPlate && oldBackground === document.querySelector('#battlefield-background img'),
                  geometryError: Math.max(...['x', 'y', 'width', 'height'].flatMap(k => [Math.abs(box[k] - fixed[k]), Math.abs(rimNow[k] - rim[k])])),
                  ownerFilters: [getComputedStyle(core).filter, getComputedStyle(plate).filter],
                });
                if (moving && performance.now() - start < 3000) requestAnimationFrame(sample);
                else window.__turnRelease.done = true;
              }
              requestAnimationFrame(sample);
            }, { once: true });
          }, { selector, key: KEY });
          // Actual mouse input. The sampler does not synthesize the command.
          await page.locator(selector).click();
          await page.waitForFunction(() => window.__turnRelease?.done === true);
          const samples = await page.evaluate(() => window.__turnRelease.frames);
          report.samples[selector] = samples;
          const moving = samples.filter(frame => frame.moving);
          assert(moving.length >= 3, 'No sufficiently sampled normal-speed flip');
          assert(moving.some(frame => Math.abs(frame.m23) > .4), 'No genuine intermediate 3D rotation');
          assert(samples.every(frame => frame.stable && frame.geometryError < .5), 'Mechanism replaced or housing moved');
          assert(moving.every(frame => frame.hands === 0), 'Face-up hand exposed during handoff motion');
          assert(moving.every(frame => frame.ownerFilters.every(filter => filter === 'none')), '3D owner flattened by a filter');
          assert(samples.every(frame => frame.turn === before.state.turn + 1), 'Rule commit delayed or repeated');
          const sign = selector === '#end-turn' ? 1 : -1;
          for (let i = 1; i < samples.length; i++)
            assert(sign * (samples[i].angle - samples[i - 1].angle) > -.5, 'Rotation reversed or reset');
          if (selector === '#end-turn') {
            assert(moving.every(frame => frame.view === 'P1' && frame.handoff), 'Outgoing view switched before handoff');
            assert(moving.filter(frame => frame.angle < 85).every(frame => frame.glow > .97), 'Amber lost before turning away');
            await page.locator('#reveal-turn').waitFor();
            const backdrop = await page.locator('#handoff-dialog').evaluate(e => ({
              color: getComputedStyle(e, '::backdrop').backgroundColor,
              filter: getComputedStyle(e, '::backdrop').backdropFilter,
            }));
            assert.deepEqual(backdrop, { color: 'rgba(0, 0, 0, 0)', filter: 'none' });
            await page.screenshot({ path: join(output, `${width}x${height}-motion-waiting.png`) });
          } else {
            await page.locator('#end-turn:not(:disabled)').waitFor();
            const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
            assert.equal(after.handoffRequired, false);
            assert.equal(after.revision, before.revision + 2);
            assert.deepEqual(after.state.players.P2.hand, before.state.players.P2.hand);
            assert.equal(await page.locator('.game-shell').getAttribute('data-view-player'), 'P2');
            assert.equal(await page.locator('#handoff-dialog').count(), 0);
            await page.screenshot({ path: join(output, `${width}x${height}-motion-ready.png`) });
          }
        }
        assert.deepEqual(errors, []);
        report.status = 'passed';
      } catch (error) {
        report.status = 'failed'; report.error = String(error);
        await page.screenshot({ path: join(output, `${width}x${height}-motion-failed.png`) }).catch(() => {});
        throw error;
      } finally {
        const video = page.video();
        await context.close();
        if (video) report.video = await video.path();
      }
    }
  } finally {
    await writeFile(join(output, 'motion-results.json'), JSON.stringify({ sourceCommit, reports }, null, 2));
  }
  return reports;
}
