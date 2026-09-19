import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fresh } from '../baseline-fixtures.js';
import { TURN_PLATE, V2 } from '../../src/application/battlefield-v2.js';
const KEY = 'lushizhizao.basic-game.v1';

async function seed(page: Page) {
  const session = fresh();
  session.demoSpecialsAdded = true;
  session.state.sharedDeck = [];
  session.state.players.P1.discardPile = [];
  session.state.players.P2.discardPile = [];
  await page.addInitScript(({ key, session }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
  }, { key: KEY, session });
}
async function shot(page: Page, info: TestInfo, name: string) {
  // R1 static geometry inspection in the real battlefield. Only the old handoff
  // dialog is hidden for these pictures; its redesign remains R3, not accepted.
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, style: '.overlay { visibility:hidden; }' });
  await info.attach(name, { path, contentType:'image/png' });
}
const near = (a: number, b: number) => expect(Math.abs(a-b)).toBeLessThan(.5);

for (const [width, height] of [[1536,691], [740,360]] as const) {
  test(`R1 native texture crop, shared pivot and edge-on solid ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await seed(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('./');
    await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
    const core = page.locator('.v2-turn-core');
    const plate = page.locator('.v2-turn-plate');
    const rim = page.locator('.v2-turn-rim');
    const input = page.locator('#end-turn');
    await page.mouse.move(0,0);
    const before = await input.boundingBox();
    const rimBefore = await rim.boundingBox();
    const front = await page.locator('[data-turn-texture="front"]').boundingBox();
    expect(before && rimBefore && front).toBeTruthy();
    await expect(plate).toHaveCSS('transform-style','preserve-3d');
    await expect(plate).toHaveCSS('filter','none');
    await expect(plate).toHaveCSS('overflow','visible');
    await expect(core).toHaveCSS('filter','none');
    await shot(page, info, 'r1-front-static');

    // Check source alpha bounds in the browser decoder, not a guessed CSS box.
    const pixels = await page.locator('.v2-turn-back').evaluate(async element => {
      const image = element as HTMLImageElement;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d')!; ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let x0=canvas.width, y0=canvas.height, x1=0, y1=0;
      for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
        if (data[(y*canvas.width+x)*4+3]! > 0) {
          x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);
        }
      }
      return { x:x0,y:y0,width:x1-x0,height:y1-y0 };
    });
    expect(pixels).toEqual(TURN_PLATE.crops.back);

    await input.click();
    await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(core).toHaveAttribute('data-turn-face','back');
    const back = await page.locator('[data-turn-texture="back"]').boundingBox();
    expect(back).toBeTruthy();
    const scale = front!.width / V2.core.width;
    near(back!.width / scale, front!.width / scale);
    near(back!.height / scale, front!.height / scale);
    near(back!.x + back!.width/2, front!.x + front!.width/2);
    near(back!.y + back!.height/2, front!.y + front!.height/2);
    const ratios = await page.locator('.v2-turn-back').evaluate(element => {
      const image=element as HTMLImageElement;
      const css=getComputedStyle(image);
      return [parseFloat(css.width)/image.naturalWidth,parseFloat(css.height)/image.naturalHeight];
    });
    expect(ratios[0]).toBeCloseTo(ratios[1]!,3);
    await shot(page, info, 'r1-back-static');

    // A held side pose of the real plate, NOT final motion acceptance.
    await plate.evaluate(element => (element as HTMLElement).style.setProperty('transform','translateZ(-1.5px) rotateX(90deg)'));
    const matrix = await plate.evaluate(element => {
      const m=new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { m22:m.m22, m23:m.m23 };
    });
    expect(matrix.m22).toBeCloseTo(0,5);
    expect(Math.abs(matrix.m23)).toBeCloseTo(1,5);
    await expect(page.locator('.v2-turn-edge')).toHaveCount(8);
    const edges = await page.locator('.v2-turn-edge').evaluateAll(elements => elements.map(e=> {
      const r=e.getBoundingClientRect(); return {width:r.width,height:r.height};
    }));
    expect(edges.some(e=>e.width>20*scale && e.height>1*scale)).toBe(true);
    const rimAfter=await rim.boundingBox(), after=await input.boundingBox();
    for (const key of ['x','y','width','height'] as const) {
      near(rimAfter![key],rimBefore![key]);near(after![key],before![key]);
    }
    await shot(page, info, 'r1-side-static');
    await plate.evaluate(element => (element as HTMLElement).style.setProperty('transform','translateZ(-1.5px) rotateX(180deg)'));
    await page.locator('#reveal-turn').click();
    await expect(input).toBeEnabled();
    await expect(core).toHaveAttribute('data-turn-face','front');
    expect(errors).toEqual([]);
  });
}
for (const failure of ['missing','corrupt'] as const) {
  test(`R1 both text fallback faces survive ${failure} art`, async ({ page }) => {
    await seed(page);
    await page.route('**/*turn-core-*.webp', route => failure==='missing' ? route.abort() : route.fulfill({ status:200,contentType:'image/webp',body:'broken' }));
    await page.goto('./');
    await expect(page.locator('.end-turn-label')).toBeVisible();
    await page.locator('#end-turn').click();
    await expect(page.locator('#reveal-turn')).toBeVisible();
    await expect(page.locator('.end-turn-back-fallback')).toBeVisible();
    await expect(page.locator('.v2-turn-core')).toHaveAttribute('data-turn-face','back');
    await page.locator('#reveal-turn').click();
    await expect(page.locator('#end-turn')).toBeEnabled();
    await expect(page.locator('.end-turn-label')).toBeVisible();
  });
}
