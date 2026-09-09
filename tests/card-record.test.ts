import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMinionCardsFromRecord } from "../src/data/parse-card-record.js";

const markdown = readFileSync(new URL("../docs/卡牌游戏记录_v0.5.md", import.meta.url), "utf8");
const cards = parseMinionCardsFromRecord(markdown);

describe("v0.5 card record parser", () => {
  it("loads 77 formal minions and 2 token minions", () => {
    expect(cards.filter((card) => card.type === "minion")).toHaveLength(77);
    expect(cards.filter((card) => card.type === "token_minion")).toHaveLength(2);
    expect(cards).toHaveLength(79);
  });

  it("preserves unknown values as null", () => {
    const twistedStone = cards.find((card) => card.id === "C021");
    expect(twistedStone?.health).toBeNull();
    expect(twistedStone?.attack).toBeNull();
    expect(twistedStone?.copies).toBe(4);
  });

  it("distinguishes healing from attack", () => {
    const healer = cards.find((card) => card.id === "C027");
    expect(healer?.health).toBe(3);
    expect(healer?.attack).toBeNull();
    expect(healer?.healing).toBe(1);
  });

  it("extracts keyword effects without losing raw effects", () => {
    const wolfKing = cards.find((card) => card.id === "C013");
    expect(wolfKing?.effects.some((effect) => effect.keyword === "fast_attack")).toBe(true);
    expect(wolfKing?.effects.some((effect) => effect.keyword === "haste")).toBe(true);
    expect(wolfKing?.effects.some((effect) => effect.keyword === "guard")).toBe(true);
    expect(wolfKing?.effects.some((effect) => effect.name === "月圆")).toBe(true);
  });

  it("stops each card raw block at the next section heading", () => {
    const amplifier = cards.find((card) => card.id === "C006");
    expect(amplifier?.rawText).not.toContain("### 3.2");
  });

  it("keeps complex top-tier cards raw instead of inventing base stats", () => {
    const ancestorDragon = cards.find((card) => card.id === "C076");
    expect(ancestorDragon?.series).toBe("先天之灵");
    expect(ancestorDragon?.health).toBeNull();
    expect(ancestorDragon?.rawText).toContain("特殊血总量：12");
  });
});
