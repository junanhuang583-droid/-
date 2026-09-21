import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = 'lushizhizao.basic-game.v1';
/** Passive observation only: no patched animations, seeking, fake rule events,
 * speed changes or in-memory substitutes. All writes below seed this isolated
 * acceptance browser's save, never a user's existing browser/session. */
function installObserver() {
  const create = () => ({ sources: [], fronts: [], frames: [], privateLeak: false, seen: new Set(), revealed: new Set() });
  window.__drawRelease = create();
  window.__resetDrawRelease = () => { window.__drawRelease = create(); };
  function inspect() {
    const r = window.__drawRelease, source = document.querySelector('#deck-source');
    const shell = document.querySelector('.game-shell');
    if (!shell) return;
    const cards = [...document.querySelectorAll('.deck-draw-card')];
    for (const card of cards) if (!r.seen.has(card)) {
      r.seen.add(card);
      r.sources.push({ id: card.dataset.acquisitionId, before: Number(source?.dataset.visualRemaining),
        plaque: Number(document.querySelector('.v2-deck-count')?.textContent),
        kind: card.className, privateData: card.hasAttribute('data-card-id'), time: performance.now() });
    }
    for (const front of document.querySelectorAll('[data-draw-state="revealing"],[data-draw-state="ready"]')) {
      const id = front.dataset.drawReceipt;
      if (r.revealed.has(id)) continue;
      r.revealed.add(id);
      r.fronts.push({ id, index: Number(front.dataset.handIndex), cardId: front.dataset.cardId,
        title: front.querySelector('strong')?.textContent?.trim(), time: performance.now() });
    }
    if (shell.dataset.handPrivate === 'true' && document.querySelector('#active-hand-target .hand-card')) r.privateLeak = true;
  }
  new MutationObserver(inspect).observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-draw-state','data-hand-private','data-draw-phase'] });
  const sample = () => {
    inspect();
    const r = window.__drawRelease, shell = document.querySelector('.game-shell');
    const cards = [...document.querySelectorAll('.deck-draw-card')];
    if (cards.length && r.frames.length < 2000) r.frames.push({ time: performance.now(), count: cards.length,
      extracting: cards.filter(c => c.dataset.drawPhase === 'exit').length,
      fronts: r.fronts.length, locked: document.querySelector('#end-turn').disabled,
      source: Number(document.querySelector('#deck-source').dataset.visualRemaining),
      handPrivate: shell.dataset.handPrivate === 'true' });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}
const read = (page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const observation = (page) => page.evaluate(() => {
  const { sources, fronts, frames, privateLeak } = window.__drawRelease;
  return { sources, fronts, frames, privateLeak };
});
// A short-lived first node can already be edge-on/hidden when a polling
// locator runs. Wait for the passive observer's durable receipt AND rAF sample
// instead of missing an otherwise completed batch. All motion assertions below
// still run against the full captured sequence; no timeout is waived.
const waitForObservedFlight = (page) => page.waitForFunction(() =>
  window.__drawRelease.sources.length > 0 && window.__drawRelease.frames.length > 0);
function motionChecks(data, count) {
  assert.equal(data.sources.length, count, 'Actual flight count differs from committed draws');
  assert.equal(new Set(data.sources.map(s => s.id)).size, count, 'Duplicated receipt flight');
  assert(data.sources.every(s => s.id && !s.privateData), 'Missing occurrence ID or private definition on a back');
  assert(!data.privateLeak, 'Private hand exposed before handoff');
  if (count) {
    assert(data.frames.length >= 3, 'No sampled normal-speed motion');
    assert(data.frames.every(f => f.count <= 3 && f.extracting <= 1 && f.locked), 'Overlap/source lease/input lock violation');
    if (count > 1) assert(data.frames.some(f => f.count > 1), 'Batch incorrectly serial');
  }
}

export async function checkDrawRelease(browser, url, expected, output) {
  const reports = [], videoDir = join(output, 'draw-videos');
  await mkdir(videoDir, { recursive: true });
  try {
    for (const [width,height] of [[1536,691],[740,360]]) {
      const context = await browser.newContext({ viewport: {width,height}, reducedMotion: 'no-preference',
        recordVideo: {dir:videoDir,size:{width,height}} });
      const page = await context.newPage(), errors = [];
      page.on('pageerror',e => errors.push(e.message));
      const report = {width,height,sourceCommit:expected,status:'running',errors,turns:[]}; reports.push(report);
      try {
        const info = await context.request.get(new URL(`build-info.json?draw=${Date.now()}`,url).href);
        assert(info.ok()); report.info = await info.json();
        assert.equal(report.info.sourceCommit,expected,'Wrong published draw build');
        await page.addInitScript(installObserver);
        await page.goto(url,{waitUntil:'load'});
        await waitForObservedFlight(page);
        const initial = await read(page);
        await page.screenshot({path:join(output,`${width}x${height}-draw-opening.png`)});
        await page.locator('#reveal-turn').waitFor();
        const opening = await observation(page); report.opening = opening; motionChecks(opening,20);
        assert.equal(opening.fronts.length,0,'Opening revealed card fronts');
        assert.deepEqual(opening.sources.map(s=>s.before),Array.from({length:20},(_,i)=>initial.state.sharedDeck.length+20-i));
        assert(opening.sources.every(s=>s.plaque===initial.state.sharedDeck.length));
        const dealt = await read(page);
        assert.deepEqual(dealt.state.players,initial.state.players,'Cosmetic opening changed cards');
        for (const owner of ['P1','P2']) assert.equal(
          Number(await page.locator(`.opening-receiver[data-owner="${owner}"]`).getAttribute('data-received')),
          dealt.state.players[owner].hand.length);
        await page.screenshot({path:join(output,`${width}x${height}-draw-private-waiting.png`)});
        await page.locator('#reveal-turn').click(); await page.locator('#end-turn:not(:disabled)').waitFor();
        assert.equal((await observation(page)).sources.length,20,'First reveal redealt opening');
        assert.equal(await page.locator('.opening-deal-receivers').count(),0);

        // Both art types and repeated definitions in a real five-card draw.
        await page.evaluate(key => {
          const s=JSON.parse(localStorage.getItem(key));s.state.turn=1;s.state.activePlayer='P1';s.state.firstPlayer='P1';
          s.turnsStarted={P1:1,P2:0};s.handoffRequired=false;s.pendingEffects=[];s.demoSpecialsAdded=true;
          s.state.sharedDeck=[...Array(16).fill('C001'),...['X001','C001','A001','X001','C004'].reverse()];
          for(const owner of ['P1','P2']){
            s.state.players[owner].hand=['C004','C012'];s.state.players[owner].discardPile=[];
            s.state.players[owner].board=Array.from({length:5},(_,i)=>({instanceId:`release-${owner}-${i}`,cardId:'C001',
              owner,controller:owner,currentHealth:4,attackModifier:0,attacksUsedThisTurn:0,summonedOnTurn:0,statuses:[]}));
          }
          localStorage.setItem(key,JSON.stringify(s));
        },KEY);
        await page.reload({waitUntil:'networkidle'}); await page.locator('#end-turn:not(:disabled)').waitFor();
        for(const count of [5,4]){
          await page.evaluate(()=>window.__resetDrawRelease());
          const before=await read(page);await page.locator('#end-turn').click();await page.locator('#reveal-turn').waitFor();
          const committed=await read(page),owner=committed.state.activePlayer;
          const old=before.state.players[owner].hand.length,ids=committed.state.players[owner].hand.slice(old);
          assert.equal(ids.length,count);assert.equal((await observation(page)).sources.length,0);
          await page.locator('#reveal-turn').click();await waitForObservedFlight(page);
          await page.screenshot({path:join(output,`${width}x${height}-draw-${count}-moving.png`)});
          await page.locator('#end-turn:not(:disabled)').waitFor();
          const data=await observation(page);report.turns.push({count,ids,...data});motionChecks(data,count);
          assert.deepEqual(data.fronts.map(f=>f.index),Array.from({length:count},(_,i)=>old+i));
          assert.deepEqual(data.fronts.map(f=>f.cardId),ids,'Wrong card rendered at landing');
          assert(data.fronts.every(f=>f.title),'A landed card showed a placeholder instead of its real front');
          assert(data.frames.some(f=>f.fronts>0&&f.fronts<count),'Cards revealed as a whole group');
          for(const f of data.fronts) {
            const front=page.locator(`[data-hand-index="${f.index}"]`);
            assert.equal(await front.locator('strong').textContent(),f.title,'Front changed again after unlock');
          }
          const after=await read(page);assert.deepEqual(after.state,committed.state);assert.equal(after.revision,before.revision+2);
          assert.equal(await page.locator('[data-draw-state],.deck-draw-stage').count(),0);
          await page.screenshot({path:join(output,`${width}x${height}-draw-${count}-landed.png`)});
        }
        // Real last-card/refill commands, using the same served bundle.
        for(const scenario of [{deck:1,discard:0,source:[1],final:0},{deck:1,discard:4,source:[1,4,3,2],final:1}]){
          await page.evaluate(({key,scenario})=>{
            const s=JSON.parse(localStorage.getItem(key));
            s.state.sharedDeck=Array(scenario.deck).fill('C001');s.state.players.P1.discardPile=Array(scenario.discard).fill('C004');
            s.state.players.P2.discardPile=[];localStorage.setItem(key,JSON.stringify(s));
          },{key:KEY,scenario});
          await page.reload({waitUntil:'networkidle'});await page.locator('#end-turn:not(:disabled)').waitFor();
          await page.locator('#end-turn').click();await page.locator('#reveal-turn').waitFor();
          const committed=await read(page);assert.equal(committed.state.sharedDeck.length,scenario.final);
          assert.equal(await page.locator('#deck-source').getAttribute('data-visual-remaining'),'1');
          await page.locator('#reveal-turn').click();await page.locator('#end-turn:not(:disabled)').waitFor();
          const data=await observation(page);motionChecks(data,scenario.source.length);
          assert.deepEqual(data.sources.map(s=>s.before),scenario.source);assert(data.sources.every(s=>s.plaque===scenario.final));
          assert.deepEqual((await read(page)).state,committed.state);
          report.turns.push({scenario,...data});
        }
        await page.screenshot({path:join(output,`${width}x${height}-draw-refill-settled.png`)});
        assert.deepEqual(errors,[]);report.status='passed';
      } catch(error) {
        report.status='failed';report.error=String(error);
        report.lastObservation=await observation(page).catch(()=>null);
        await page.screenshot({path:join(output,`${width}x${height}-draw-failed.png`)}).catch(()=>{});
        throw error;
      } finally {
        const video=page.video();await context.close();if(video)report.video=await video.path();
      }
    }
  } finally {
    await writeFile(join(output,'draw-results.json'),JSON.stringify({sourceCommit:expected,reports},null,2));
  }
  return reports;
}
