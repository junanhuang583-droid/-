import { describe, expect, it } from "vitest";
import { scopeAllowsTarget, targetedEffectPassesTaunt } from "../src/core/unit-targeting.js";

describe("confirmed unit targeting rules", () => {
  it("treats unqualified unit as both heroes and both sides' minions", () => {
    expect(scopeAllowsTarget("P1", "all_units", { playerId: "P1", kind: "hero" })).toBe(true);
    expect(scopeAllowsTarget("P1", "all_units", { playerId: "P2", kind: "hero" })).toBe(true);
    expect(scopeAllowsTarget("P1", "all_units", { playerId: "P1", kind: "minion" })).toBe(true);
    expect(scopeAllowsTarget("P1", "all_units", { playerId: "P2", kind: "minion" })).toBe(true);
  });

  it("keeps minion-only wording away from heroes", () => {
    expect(scopeAllowsTarget("P1", "all_minions", { playerId: "P1", kind: "hero" })).toBe(false);
    expect(scopeAllowsTarget("P1", "all_minions", { playerId: "P2", kind: "hero" })).toBe(false);
    expect(scopeAllowsTarget("P1", "all_minions", { playerId: "P1", kind: "minion" })).toBe(true);
    expect(scopeAllowsTarget("P1", "all_minions", { playerId: "P2", kind: "minion" })).toBe(true);
  });

  it("applies friendly and enemy wording to the corresponding side", () => {
    expect(scopeAllowsTarget("P1", "enemy_units", { playerId: "P2", kind: "hero" })).toBe(true);
    expect(scopeAllowsTarget("P1", "enemy_units", { playerId: "P1", kind: "minion" })).toBe(false);
    expect(scopeAllowsTarget("P1", "friendly_units", { playerId: "P1", kind: "hero" })).toBe(true);
    expect(scopeAllowsTarget("P1", "friendly_minions", { playerId: "P1", kind: "hero" })).toBe(false);
  });

  it("lets enemy taunt block enemy hero and non-taunt minions but not friendly targets", () => {
    expect(targetedEffectPassesTaunt("P1", { playerId: "P2", kind: "hero" }, true)).toBe(false);
    expect(targetedEffectPassesTaunt("P1", { playerId: "P2", kind: "minion", isTaunt: false }, true)).toBe(false);
    expect(targetedEffectPassesTaunt("P1", { playerId: "P2", kind: "minion", isTaunt: true }, true)).toBe(true);
    expect(targetedEffectPassesTaunt("P1", { playerId: "P1", kind: "hero" }, true)).toBe(true);
    expect(targetedEffectPassesTaunt("P1", { playerId: "P1", kind: "minion" }, true)).toBe(true);
  });
});
