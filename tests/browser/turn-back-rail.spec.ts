import { test, expect, type Page } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import { pngPixels } from './png-samples.js';
import { TURN_BACK_RAIL_ASSET, v2Asset } from '../../src/application/battlefield-v2.js';
const KEY = 'lushizhizao.basic-game.v1';
async function start(page: Page) {
  const s = fresh(); s.demoSpecialsAdded = true; s.state.sharedDeck = [];
  s.state.players.P1.discardPile = []; s.state.players.P2.discardPile = [];
  await page.addInitScript(({key,s}) => { if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(s)); },{key:KEY,s});
  await page.goto('./');
}

test('back texture has a continuous lower rail and unchanged emblem/upper/side pixels', async ({page}) => {
  await start(page);
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
  const diff = await page.locator('.v2-turn-back-lower-rail').evaluate(async (element, originalUrl) => {
    const current = element as HTMLImageElement; await current.decode();
    const original = new Image(); original.src=originalUrl; await original.decode();
    function pixels(image: HTMLImageElement) {
      const canvas=document.createElement('canvas'); canvas.width=196;canvas.height=96;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,196,96).data;
    }
    const canvas=document.createElement('canvas');canvas.width=196;canvas.height=96;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(original,0,0);ctx.drawImage(current,0,0);
    const a=pixels(original), b=ctx.getImageData(0,0,196,96).data;let protectedChanges=0, changes=0;
    for(let y=0;y<96;y++)for(let x=0;x<196;x++) {
      const i=(y*196+x)*4;
      const changed=[0,1,2,3].some(c=>a[i+c]!==b[i+c]);
      if(!changed)continue;
      changes++;
      if(x<60||x>=138||y<79||y>=87||(x>=74&&x<122&&y<81))protectedChanges++;
    }
    const oldAlpha=[],newAlpha=[];
    for(let x=65;x<=132;x++) {oldAlpha.push(a[(84*196+x)*4+3]!);newAlpha.push(b[(84*196+x)*4+3]!);}
    return {protectedChanges,changes,oldAlpha,newAlpha,src:current.src};
  },v2Asset('turn-core-back'));
  expect(diff.src).toContain(`${TURN_BACK_RAIL_ASSET}.webp`);
  expect(diff.changes).toBeGreaterThan(300);
  expect(diff.protectedChanges).toBe(0);
  expect(diff.oldAlpha.every(a=>a===0)).toBe(true);
  expect(diff.newAlpha.every(a=>a===255)).toBe(true);
});

for(const [width,height] of [[1536,691],[740,360]] as const) {
  test(`completed lower rail is visible on the real back face ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await start(page);
    await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
    await expect(page.locator('.v2-turn-socket-repair')).toBeVisible();
    const box=await page.locator('#end-turn').boundingBox();
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    const image=page.locator('.v2-turn-back-lower-rail');
    const rect=(await image.boundingBox())!;
    const fixed=pngPixels(await page.screenshot({path:info.outputPath('complete-back-full.png')}));
    // Attribution: hide only the moving lower-rail layer, keeping the original B3,
    // fixed rim, dimensions and transforms. It must reopen the missing lower rail.
    await image.evaluate(e=>(e as HTMLElement).style.visibility='hidden');
    const old=pngPixels(await page.screenshot({path:info.outputPath('incomplete-b3-control.png')}));
    await image.evaluate(e=>(e as HTMLElement).style.removeProperty('visibility'));
    const lum=(rgb:[number,number,number])=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    const deltas=[70,78,118,126].map(x=>{
      const sx=rect.x+(x+.5)/196*rect.width,sy=rect.y+84.5/96*rect.height;
      return lum(fixed.rgb(sx,sy))-lum(old.rgb(sx,sy));
    });
    expect(deltas.every(d=>d>12)).toBe(true);
    for(const [x,y] of [[96,50],[96,20],[35,50],[160,50]]) {
      const sx=rect.x+(x!+.5)/196*rect.width,sy=rect.y+(y!+.5)/96*rect.height;
      expect(fixed.rgb(sx,sy)).toEqual(old.rgb(sx,sy));
    }
    // The repaired rail belongs to the back face. The fixed latch stays outside.
    expect(await image.evaluate(e=>!!e.closest('.v2-turn-face-back .v2-turn-texture')&&!!e.closest('.v2-turn-plate'))).toBe(true);
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
    expect(await page.locator('#end-turn').boundingBox()).toEqual(box);
    await page.screenshot({path:info.outputPath('unchanged-front-full.png')});
  });
}

test('restored lower rail moves with the back, remains complete at rest after both directions',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await start(page);
  await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
  const image=await page.locator('.v2-turn-back-lower-rail').elementHandle();
  const rim=await page.locator('.v2-turn-rim').boundingBox();
  for(const selector of ['#end-turn','#reveal-turn']) {
    await page.locator(selector).evaluate(e=>{
      (e as HTMLButtonElement).click();
      document.querySelector('#end-turn')!.getAnimations({subtree:true}).filter(a=>a.id.startsWith('turn-plate-')).forEach(a=>{a.pause();a.currentTime=180;});
    });
    expect(await image!.evaluate(e=>e.isConnected&&e===document.querySelector('.v2-turn-back-lower-rail'))).toBe(true);
    const transform=await page.locator('.v2-turn-plate').evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m23);
    expect(Math.abs(transform)).toBeGreaterThan(.4);
    expect(await page.locator('.v2-turn-rim').boundingBox()).toEqual(rim);
    await page.locator('#end-turn').evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.play()));
    if(selector==='#end-turn')await expect(page.locator('#reveal-turn')).toBeVisible();
    else await expect(page.locator('#end-turn')).toBeEnabled();
  }
});
for(const failure of ['missing','corrupt'] as const) {
  test(`completed back asset ${failure} keeps real text fallback and turn flow`,async({page})=>{
    await page.route(`**/${TURN_BACK_RAIL_ASSET}.webp`,route=>failure==='missing'?route.abort():route.fulfill({status:200,contentType:'image/webp',body:'invalid'}));
    await start(page);await expect(page.locator('.end-turn-label')).toBeVisible();
    await expect(page.locator('#end-turn')).not.toHaveClass(/end-turn-art-ready/);
    await page.locator('#end-turn').click();await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(page.locator('.end-turn-back-fallback')).toBeVisible();
    await page.locator('#reveal-turn').click();await expect(page.locator('#end-turn')).toBeEnabled();
  });
}
