import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const KEY='lushizhizao.basic-game.v1';
/** Actual served-site check using native pointer/keyboard input. Test saves
 * belong only to these isolated browser contexts, never the user's session. */
export async function checkSummonRelease(browser,url,sourceCommit,output) {
  const reports=[];
  try {
    for(const [width,height] of [[1536,691],[740,360]]) {
      const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const report={width,height,sourceCommit,status:'running',errors};reports.push(report);
      try {
        await page.goto(url,{waitUntil:'networkidle'});await page.locator('#reveal-turn').click();
        await page.locator('#end-turn:not(:disabled)').waitFor();
        await page.evaluate(key=>{
          const s=JSON.parse(localStorage.getItem(key));s.handoffRequired=false;s.pendingEffects=[];s.demoSpecialsAdded=true;
          s.state.activePlayer='P1';s.state.players.P1.hand=['C004','C001'];s.state.players.P1.normalSummonsUsedThisTurn=0;
          s.state.players.P1.board=Array.from({length:5},(_,i)=>[1,4].includes(i)?{instanceId:`3c-${i}`,cardId:'C001',owner:'P1',controller:'P1',currentHealth:4,attackModifier:0,attacksUsedThisTurn:0,summonedOnTurn:0,statuses:[]}:null);
          localStorage.setItem(key,JSON.stringify(s));
        },KEY);
        await page.reload({waitUntil:'networkidle'});await page.locator('#end-turn:not(:disabled)').waitFor();
        assert.equal(await page.locator('.summon-placement-mark,.active-board .empty-slot:visible').count(),0);
        const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
        await page.screenshot({path:join(output,`${width}x${height}-summon-idle.png`)});
        await page.locator('.stage04-hand-toggle').click();
        const card=await page.locator('[data-hand-index="0"]').boundingBox(),board=await page.locator('.active-board').boundingBox();
        await page.mouse.move(card.x+card.width/2,Math.min(height-10,card.y+card.height/2));await page.mouse.down();
        await page.mouse.move(board.x+board.width/2,board.y+board.height/2,{steps:10});
        await page.locator('.active-board[data-summon-mode="direct"]').waitFor();
        const options=await page.locator('.active-board [data-summon-legal]').evaluateAll(es=>es.map(e=>Number(e.dataset.emptySlot)));
        report.slots=options;assert.deepEqual(options,[0,2,3]);
        assert.equal(await page.locator('.opponent-board .summon-placement-mark').count(),0);
        const r=await page.locator('.active-board [data-empty-slot="3"]').boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:4});
        await page.locator('.active-board [data-empty-slot="3"][data-summon-target="true"]').waitFor();
        await page.screenshot({path:join(output,`${width}x${height}-summon-legal-hover.png`)});
        await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.summon-placement-mark,.ab-lift-card'));
        const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
        assert.equal(after.state.players.P1.board[3]?.cardId,'C004');assert.equal(after.state.players.P1.health,before.state.players.P1.health-3);
        assert.equal(after.revision,before.revision+1);assert.equal(await page.locator('.active-board .empty-slot:visible').count(),0);
        await page.screenshot({path:join(output,`${width}x${height}-summon-settled.png`)});
        // Remaining valid minion is blocked by the real per-turn limit.
        await page.locator('.stage04-hand-toggle').click();await page.locator('[data-hand-index="0"]').focus();
        await page.keyboard.press('Enter');assert.equal(await page.locator('.summon-placement-mark').count(),0);
        assert.deepEqual((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY)).state,after.state);
        assert.deepEqual(errors,[]);report.status='passed';
      } catch(error) {
        report.status='failed';report.error=String(error);
        await page.screenshot({path:join(output,`${width}x${height}-summon-failed.png`)}).catch(()=>{});throw error;
      } finally {await context.close();}
    }
  } finally {await writeFile(join(output,'summon-results.json'),JSON.stringify({sourceCommit,reports},null,2));}
}
