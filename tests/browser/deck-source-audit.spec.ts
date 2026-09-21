import { test,expect } from '@playwright/test';
import {fresh} from '../baseline-fixtures.js';
import manifest from '../../assets-source/battlefield-v2/manifest.json' with {type:'json'};
const KEY='lushizhizao.basic-game.v1';
for(const [width,height] of [[1536,691],[740,360]] as const){
  test(`3B-0 actual fixed cavity, projected top card and rim audit ${width}x${height}`,async({page},info)=>{
    const s=fresh();s.demoSpecialsAdded=true;
    await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key:KEY,s});
    await page.setViewportSize({width,height});await page.goto('./');
    await expect(page.locator('#end-turn')).toHaveClass(/end-turn-art-ready/);
    const decoded=await page.locator('.v2-deck-slice,.v2-deck-rim').evaluateAll(async elements=>{
      return Promise.all(elements.map(async el=>{const im=el as HTMLImageElement;await im.decode();return {url:im.src,width:im.naturalWidth,height:im.naturalHeight};}));
    });
    expect(decoded.filter(a=>a.url.includes('card-back-deck'))).toHaveLength(4);
    expect(decoded.find(a=>a.url.includes('deck-rim'))).toMatchObject({width:210,height:233});
    for(const a of decoded.filter(a=>a.url.includes('card-back-deck')))expect(a).toMatchObject({width:284,height:354});
    expect(manifest.assets.find(a=>a.id==='card-back-deck')!.derivativeOf).toBe('card-back-final');
    const box=await page.locator('#deck-source').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({path:info.outputPath('deck-complete-full.png')});
    // Diagnostic layers only, never a production style change or proof of final motion.
    await page.screenshot({path:info.outputPath('deck-top-hidden-full.png'),style:'.v2-deck-slice{visibility:hidden;}'});
    await page.screenshot({path:info.outputPath('deck-rim-hidden-full.png'),style:'.v2-deck-rim{visibility:hidden;}'});
    await page.screenshot({path:info.outputPath('deck-background-only-full.png'),style:'.v2-deck-slice,.v2-deck-rim,.v2-deck-count{visibility:hidden;}'});
  });
}
