import { test, expect } from "@playwright/test";
import { fresh } from "../baseline-fixtures.js";

const KEY = "lushizhizao.basic-game.v1";

test("authored battlefield remains 1152x648 before cover transform", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  const session = fresh();
  session.demoSpecialsAdded = true;
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, { key: KEY, session });

  await page.goto("./");
  const plane = page.locator(".battlefield-coordinate-layer");
  await expect(plane).toHaveAttribute("data-viewport-scale", /.+/);

  const geometry = await plane.evaluate((element) => {
    const node = element as HTMLElement;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      offsetWidth: node.offsetWidth,
      offsetHeight: node.offsetHeight,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      aspectRatio: style.aspectRatio,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });

  expect(geometry.offsetWidth).toBe(1152);
  expect(geometry.offsetHeight).toBe(648);
  expect(geometry.maxWidth).toBe("none");
  expect(geometry.maxHeight).toBe("none");
  expect(geometry.aspectRatio).toBe("auto");
  expect(geometry.x).toBeLessThanOrEqual(0);
  expect(geometry.y).toBeLessThanOrEqual(0);
  expect(geometry.width).toBeGreaterThanOrEqual(739);
  expect(geometry.height).toBeGreaterThanOrEqual(359);
});
