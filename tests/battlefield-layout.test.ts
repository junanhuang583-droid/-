import { describe, expect, it } from "vitest";
import { battlefieldTransform, gameplayGeometry, FIXED_SOCKETS, HERO_LINE_CLEARANCE } from "../src/application/battlefield-geometry.js";

describe("gameplay centers respect physical hero and unit bounds", () => {
  for (const [width, height] of [[1536, 691], [1400, 500], [1152, 648], [896, 414], [740, 360], [1920, 1080]]) {
    it(`maintains both clearances and the central scene at ${width}x${height}`, () => {
      const t = battlefieldTransform(width!, height!);
      const g = gameplayGeometry(t);
      const opponentBottom = g.opponentHeroY + g.heroHeight / 2;
      const activeTop = g.activeHeroY - g.heroHeight / 2;
      expect(g.opponentLineY - g.unitHeight / 2 - opponentBottom).toBeGreaterThanOrEqual(HERO_LINE_CLEARANCE - .001);
      expect(activeTop - (g.activeLineY + g.unitHeight / 2)).toBeGreaterThanOrEqual(HERO_LINE_CLEARANCE - .001);
      expect(g.opponentLineY + g.unitHeight / 2).toBeLessThan(FIXED_SOCKETS.scene.y - 15);
      expect(g.activeLineY - g.unitHeight / 2).toBeGreaterThan(FIXED_SOCKETS.scene.y + 15);
      expect(g.unitStep).toBeGreaterThan(g.unitWidth);
      expect(g.opponentHeroY - g.heroHeight / 2).toBeGreaterThan(t.visible.y);
      expect(g.activeHeroY + g.heroHeight / 2).toBeLessThan(t.visible.y + t.visible.height);
    });
  }
});
