import { test, expect, type Page } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import { MASTER_TO_WORLD, V2 } from '../../src/application/battlefield-v2.js';
import { pngPixels } from './png-samples.js';
const KEY = 'lushizhizao.basic-game.v1';
async function start(page: Page) {
  const s = fresh(); s.demoSpecialsAdded = true; s.state.sharedDeck = [];
  s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  await page.addInitScript(({key,s}) => { if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(s)); },{key:KEY,s});
  await page.goto('./');
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
}
for (const [width,height] of [[1536,691],[740,360]] as const) {
  test(`lower socket fixed-layer ghost is absent in actual rendered pixels ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height}); await start(page);
    const repair=page.locator('.v2-turn-socket-repair'); await expect(repair).toBeVisible();
    const originalButton=await page.locator('#end-turn').boundingBox();
    const originalPlate=await page.locator('.v2-turn-plate').elementHandle();
    await page.locator('#end-turn').click(); await expect(page.locator('#reveal-turn')).toBeVisible();
    const plane=(await page.locator('.battlefield-coordinate-layer').boundingBox())!;
    const scale=plane.width/1152;
    const fixed=pngPixels(await page.screenshot({path:info.outputPath('repaired-back-full.png')}));
    // Attribution control: hide only the repair, not the B3/current scene. The old
    // stationary stripe must reappear, proving this is not the previous R1 crop bug.
    await repair.evaluate(e=>(e as HTMLElement).style.visibility='hidden');
    const old=pngPixels(await page.screenshot({path:info.outputPath('original-stripe-attribution.png')}));
    await repair.evaluate(e=>(e as HTMLElement).style.removeProperty('visibility'));
    const points=[1480,1496,1550,1568].map(x=>({x:plane.x+x*MASTER_TO_WORLD*scale,
      y:plane.y+(483-.25)*MASTER_TO_WORLD*scale}));
    const warmth=(image:ReturnType<typeof pngPixels>)=>points.reduce((sum,p)=>{
      const [r,,b]=image.rgb(p.x,p.y); return sum+r-b;
    },0)/points.length;
    expect(warmth(old)).toBeGreaterThan(12);
    expect(warmth(fixed)).toBeLessThan(5);
    expect(warmth(old)-warmth(fixed)).toBeGreaterThan(12);
    // Sentinel pixels outside the documented patch are exactly unchanged.
    for(const [x,y] of [[1520,372],[1405,440],[1645,430],[1520,503],[1470,420]]) {
      const sx=plane.x+x!*MASTER_TO_WORLD*scale,sy=plane.y+(y!-.25)*MASTER_TO_WORLD*scale;
      expect(fixed.rgb(sx,sy)).toEqual(old.rgb(sx,sy));
    }
    const r=(await repair.boundingBox())!;
    expect(r.x).toBeCloseTo(plane.x+V2.socketLowerRepair.x*scale,1);
    expect(r.y).toBeCloseTo(plane.y+V2.socketLowerRepair.y*scale,1);
    expect(await repair.evaluate(e=>e.parentElement?.classList.contains('v2-turn'))).toBe(true);
    await expect(repair).toHaveCSS('z-index','-1');
    await expect(repair).toHaveCSS('pointer-events','none');
    await page.locator('#reveal-turn').click(); await expect(page.locator('#end-turn')).toBeEnabled();
    expect(await originalPlate!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-turn-plate'))).toBe(true);
    expect(await page.locator('#end-turn').boundingBox()).toEqual(originalButton);
    await page.screenshot({path:info.outputPath('repaired-front-full.png')});
  });
}
test('lower socket texture never rotates with the physical plate',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'}); await start(page);
  const repair=page.locator('.v2-turn-socket-repair');await expect(repair).toBeVisible();
  const before=await repair.boundingBox();
  for(const selector of ['#end-turn','#reveal-turn']) {
    await page.locator(selector).evaluate(e=>{
      (e as HTMLButtonElement).click();
      document.querySelector('#end-turn')!.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).forEach(a=>{a.pause();a.currentTime=150;});
    });
    await expect(repair).toHaveCSS('transform','none');expect(await repair.boundingBox()).toEqual(before);
    expect(await repair.evaluate(e=>e.getAnimations().length)).toBe(0);
    await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.play()));
    if(selector==='#end-turn')await expect(page.locator('#reveal-turn')).toBeVisible();
    else await expect(page.locator('#end-turn')).toBeEnabled();
  }
});
for(const failure of ['missing','corrupt'] as const) {
  test(`optional socket repair ${failure} does not break handoff or face fallback`,async({page})=>{
    await page.route('**/turn-socket-lower-clean.webp',r=>failure==='missing'?r.abort():r.fulfill({status:200,contentType:'image/webp',body:'broken'}));
    await start(page);await expect(page.locator('.v2-turn-socket-repair')).toBeHidden();
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('.v2-turn-core')).toHaveAttribute('data-turn-face','front');
  });
}
