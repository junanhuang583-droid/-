import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const [url, expected] = process.argv.slice(2);
assert(url && expected, "Provide the Pages URL and expected source SHA");
await mkdir("published-check", {recursive:true});
const browser=await chromium.launch();
const results=[];
try {
  for(const [width,height] of [[1536,691],[896,414]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce"});
    const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    let info;
    for(let attempt=0;attempt<12;attempt++) {
      const r=await context.request.get(new URL(`build-info.json?verify=${Date.now()}`,url).href);
      if(r.ok()) {info=await r.json();if(info.sourceCommit===expected)break;}
      await new Promise(r=>setTimeout(r,5000));
    }
    assert.equal(info?.sourceCommit,expected,"Published version does not match tested source");
    await page.goto(url,{waitUntil:"networkidle"});
    await page.waitForSelector("#reveal-turn");await page.click("#reveal-turn");
    await page.waitForSelector("#end-turn.end-turn-art-ready:not(:disabled)");
    const geometry=await page.evaluate(()=>{
      const bg=document.querySelector("#battlefield-background img");const button=document.querySelector("#end-turn");
      return {imageDecoded:bg.naturalWidth>0,button:button.getBoundingClientRect().toJSON(),fakeSocket:!!document.querySelector(".stage072b-end-turn-socket")};
    });
    assert(geometry.imageDecoded);assert(!geometry.fakeSocket);assert(geometry.button.width>0);
    await page.screenshot({path:`published-check/${width}x${height}.png`});
    const turn=await page.evaluate(()=>JSON.parse(localStorage.getItem("lushizhizao.basic-game.v1")).state.turn);
    await page.click("#end-turn");await page.waitForSelector("#reveal-turn");
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("lushizhizao.basic-game.v1")).state.turn);
    assert.equal(after,turn+1);assert.deepEqual(errors,[]);
    results.push({width,height,info,geometry,turn,after,errors});await context.close();
  }
} finally {await writeFile("published-check/results.json",JSON.stringify(results,null,2));await browser.close();}
