import { describe, expect, it } from "vitest";
import type { Keyword } from "../src/model/cards.js";
import {
  attackLimitFor,
  canAttackOnSummonTurn,
  clampAttack,
  isActionLocked,
  reduceIncomingDamage,
} from "../src/core/rule-helpers.js";

const keywords = (...items: Keyword[]) => new Set<Keyword>(items);

describe("Rules Core v1 helpers", () => {
  it("never lets attack fall below zero", () => {
    expect(clampAttack(-3)).toBe(0);
    expect(clampAttack(4)).toBe(4);
  });

  it("supports fast attack and haste independently", () => {
    expect(attackLimitFor(keywords())).toBe(1);
    expect(attackLimitFor(keywords("fast_attack"))).toBe(2);
    expect(canAttackOnSummonTurn(keywords())).toBe(false);
    expect(canAttackOnSummonTurn(keywords("haste"))).toBe(true);
  });

  it("locks actions for sleep, freeze and petrify", () => {
    expect(isActionLocked(keywords("sleep"))).toBe(true);
    expect(isActionLocked(keywords("freeze"))).toBe(true);
    expect(isActionLocked(keywords("petrify"))).toBe(true);
    expect(isActionLocked(keywords("taunt"))).toBe(false);
  });

  it("consumes guard before damage is applied", () => {
    expect(reduceIncomingDamage(99, keywords("guard"))).toEqual({
      damage: 0,
      consumedGuard: true,
    });
  });

  it("stacks armor one and armor two", () => {
    expect(reduceIncomingDamage(6, keywords("armor_1", "armor_2"))).toEqual({
      damage: 3,
      consumedGuard: false,
    });
  });
});
