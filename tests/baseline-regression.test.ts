import { describe, expect, it, vi } from "vitest";
import { attackMinion, currentPendingUnitEffect, chooseUnitEffectTarget, choosePendingEffectTarget, settlePendingEffects, controlEffectTargets, endTurn, unitEffectTargets } from "../src/core/basic-game.js";
import type { PendingUnitEffect } from "../src/core/deathrattle-effects.js";
import { applyCommand } from "../src/core/commands.js";
import { GameStore } from "../src/application/game-store.js";
import { migrateLegacyEffects } from "../src/application/session-migration.js";
import { battlefieldTransform, worldToScreen, screenToWorld } from "../src/application/battlefield-geometry.js";
import { SAVE_KEY, BACKUP_KEY, parseStored, restoreSession, persistSession } from "../src/web/persistence.js";
import { fresh, unit, catalog } from "./baseline-fixtures.js";

function effect(overrides: Partial<PendingUnitEffect> = {}): PendingUnitEffect {
  return {
    id: "e1", kind: "unit", sourcePlayer: "P1", sourceCardId: "C034", sourceName: "火山之灵",
    action: "damage", amount: 4, scope: "all_units", remainingTargets: 1, selectedKeys: [], text: "死后对选中单位造成4点伤害", ...overrides
  };
}

describe("baseline: one death and target pipeline", () => {
  it("real C034 deathrattle killing C002 produces T001, exactly once", () => {
    const s = fresh();
    const attacker = unit("C001", "P1"); attacker.attackModifier = 100;
    const fire = unit("C034", "P2", 1); const fish = unit("C002", "P1", 4);
    s.state.players.P1.board = [attacker, fish, null, null, null]; s.state.players.P2.board[0] = fire;
    expect(attackMinion(s, catalog, attacker.instanceId, fire.instanceId)).toBeNull();
    const e = currentPendingUnitEffect(s)!; expect(e.amount).toBe(4);
    expect(endTurn(s)).toContain("待处理");
    expect(chooseUnitEffectTarget(s, catalog, e.id, `minion:${fish.instanceId}`)).toBeNull();
    expect(s.state.players.P1.board[1]?.cardId).toBe("T001");
    const snapshot = structuredClone(s);
    expect(chooseUnitEffectTarget(s, catalog, e.id, `minion:${fish.instanceId}`)).not.toBeNull();
    expect(s).toEqual(snapshot);
    expect(s.state.deathLog.filter((d) => d.instanceId === fish.instanceId)).toHaveLength(1);
  });
  it("a targeted kill can enqueue another targeted deathrattle", () => {
    const s = fresh(); const fire = unit("C034", "P2", 4); s.state.players.P2.board[0] = fire; s.pendingEffects = [effect()];
    expect(chooseUnitEffectTarget(s, catalog, "e1", `minion:${fire.instanceId}`)).toBeNull();
    expect(currentPendingUnitEffect(s)?.sourcePlayer).toBe("P2");
    expect(currentPendingUnitEffect(s)?.id).not.toBe("e1");
  });
  it("petrify suppression is attached to this death, not another same-name minion", () => {
    const s = fresh(); const fish = unit("C002", "P1", 4, [{ keyword: "petrify", remainingOwnTurns: 1 }]);
    s.state.players.P1.board[0] = fish; s.pendingEffects = [effect()];
    chooseUnitEffectTarget(s, catalog, "e1", `minion:${fish.instanceId}`);
    expect(s.state.players.P1.board[0]).toBeNull();
    expect(s.state.deathLog.at(-1)?.deathrattleSuppressed).toBe(true);
  });
  it("damage consumes guard once; health-loss bypasses guard and armor", () => {
    const s = fresh(); const m = unit("C001", "P1", 10, [{ keyword: "guard", charges: 1 }, { keyword: "armor_2" }]);
    s.state.players.P1.board[0] = m;
    s.pendingEffects = [effect(), effect({ id: "e2" }), effect({ id: "e3", action: "health_loss" })];
    chooseUnitEffectTarget(s, catalog, "e1", `minion:${m.instanceId}`); expect(m.currentHealth).toBe(10);
    chooseUnitEffectTarget(s, catalog, "e2", `minion:${m.instanceId}`); expect(m.currentHealth).toBe(8);
    chooseUnitEffectTarget(s, catalog, "e3", `minion:${m.instanceId}`); expect(m.currentHealth).toBe(4);
  });
  it("target list and executor enforce enemy taunt but allow friendly targets", () => {
    const s = fresh(); s.state.players.P2.board[0] = unit("C001", "P2", 10, [{ keyword: "taunt" }]);
    s.pendingEffects = [effect()];
    expect(unitEffectTargets(s, catalog, effect()).some((t) => t.key === "hero:P2")).toBe(false);
    expect(chooseUnitEffectTarget(s, catalog, "e1", "hero:P2")).not.toBeNull();
    expect(chooseUnitEffectTarget(s, catalog, "e1", "hero:P1")).toBeNull();
    expect(s.state.players.P1.health).toBe(76);
  });
  it("multi-target choices cannot repeat and do not stall when no distinct legal target remains", () => {
    const s = fresh(); const m = unit("C001", "P2", 20, [{ keyword: "taunt" }]); s.state.players.P2.board[0] = m;
    s.pendingEffects = [effect({ scope: "enemy_minions", remainingTargets: 2 })];
    chooseUnitEffectTarget(s, catalog, "e1", `minion:${m.instanceId}`);
    expect(s.pendingEffects).toHaveLength(0);
  });
  it("control picker uses legal targets and settlement skips exhausted mixed queues", () => {
    const s = fresh(); const m = unit("C001", "P2", 20, [{ keyword: "taunt" }]); const normal = unit("C001", "P2");
    s.state.players.P2.board = [m, normal, null, null, null];
    const control = { id: "f1", kind: "freeze" as const, sourcePlayer: "P1" as const, sourceCardId: "C001" as const, sourceName: "测试", targetPlayer: "P2" as const, remainingTargets: 2, durationOwnTurns: 2, selectedTargetIds: [] };
    s.pendingEffects = [control, effect({ scope: "friendly_minions" })];
    expect(controlEffectTargets(s, catalog, control)).toEqual([m]);
    expect(choosePendingEffectTarget(s, catalog, m.instanceId, "old")).not.toBeNull();
    expect(choosePendingEffectTarget(s, catalog, m.instanceId, "f1")).toBeNull();
    expect(s.pendingEffects).toHaveLength(0);
  });
  it("empty migrated choices settle without replaying a death", () => {
    const s = fresh(); s.pendingEffects = [effect({ scope: "all_minions" })]; settlePendingEffects(s, catalog);
    expect(s.pendingEffects).toHaveLength(0); expect(s.state.deathLog).toHaveLength(0);
  });
  it("full-board sacrifice retains deathrattle token without a sixth logical slot", () => {
    const s = fresh(); const ritual = [...catalog.cards.values()].find((c) => c.summonText?.includes("献祭1只随从") && !c.summonText.includes("进化"))!;
    expect(ritual).toBeTruthy(); s.state.players.P1.board = Array.from({ length: 5 }, () => unit("C002", "P1"));
    const victim = s.state.players.P1.board[2]!; s.state.players.P1.hand = [ritual.id];
    expect(applyCommand(s, catalog, { type: "sacrifice-summon", cardId: ritual.id, handIndex: 0, sacrifices: [victim.instanceId] })).toBeNull();
    expect(s.state.players.P1.board).toHaveLength(5); expect(s.state.players.P1.board[2]?.cardId).toBe(ritual.id);
    expect(s.state.players.P1.overflowMinions.some((m) => m.cardId === "T001")).toBe(true);
  });
});

describe("baseline: single transactional store", () => {
  it("rolls back a failed partial mutation and shields snapshots", () => {
    const save = vi.fn(); const store = new GameStore(fresh(), save); const before = store.read();
    expect(store.dispatch((d) => { d.state.players.P1.health = 1; return "invalid"; })).toBe("invalid");
    expect(store.read()).toEqual(before); expect(save).not.toHaveBeenCalled();
    store.read().state.players.P1.health = 2; expect(store.read()).toEqual(before);
  });
  it("throws do not commit; notification failure does not hide a committed command", () => {
    const store = new GameStore(fresh()); const before = store.read();
    expect(() => store.dispatch((d) => { d.state.players.P1.health = 3; throw Error("bad"); })).toThrow();
    expect(store.read()).toEqual(before);
    const log = vi.spyOn(console, "error").mockImplementation(() => { }); const last = vi.fn();
    store.subscribe(() => { throw Error("view"); }); store.subscribe(last);
    expect(store.dispatch(() => null)).toBeNull(); expect(last).toHaveBeenCalledOnce(); log.mockRestore();
  });
  it("commits monotonic revisions/timestamps and prevents reentrant commands", () => {
    const store = new GameStore(fresh()); let nested: string | null = null;
    store.subscribe(() => { nested = store.dispatch(() => null); });
    store.dispatch(() => null); const first = store.read(); store.dispatch(() => null); const second = store.read();
    expect(nested).not.toBeNull(); expect(second.revision).toBe(2); expect(second.updatedAt > first.updatedAt).toBe(true);
  });
  it("storage failure keeps memory and retries without changing revision", () => {
    let broken = true; const save = vi.fn(() => { if (broken) throw Error("quota"); }); const store = new GameStore(fresh(), save);
    store.dispatch(d => { d.state.players.P1.health = 70; return null; }); expect(store.read().state.players.P1.health).toBe(70);
    broken = false; store.flush(); store.flush(); expect(save).toHaveBeenCalledTimes(2); expect(store.read().revision).toBe(1);
  });
  it("external newer snapshots replace stale views without a feedback write", () => {
    const initial = fresh(); const save = vi.fn(); const store = new GameStore(initial, save);
    const next = structuredClone(initial); next.updatedAt = new Date(Date.parse(initial.updatedAt) + 1000).toISOString();
    next.state.players.P1.health = 60; expect(store.acceptExternal(next)).toBe(true); expect(store.acceptExternal(initial)).toBe(false);
    store.flush(); expect(save).not.toHaveBeenCalled(); expect(store.read().state.players.P1.health).toBe(60);
  });
  it("stale hand identity cannot summon a different card", () => {
    const s = fresh(); s.state.players.P1.hand = ["C001"]; const store = new GameStore(s); const before = store.read();
    expect(store.dispatch(d => applyCommand(d, catalog, { type: "summon", handIndex: 0, slotIndex: 0, cardId: "C002" }))).not.toBeNull();
    expect(store.read()).toEqual(before);
  });
});

describe("baseline: save compatibility and migration", () => {
  it("accepts old v1 data and rejects malformed nested values", () => {
    const s = fresh(); expect(parseStored(JSON.stringify(s))?.gameId).toBe(s.gameId);
    s.pendingEffects = [null as never]; expect(parseStored(JSON.stringify(s))).toBeNull();
    s.pendingEffects = []; s.state.players.P1.overflowMinions = [null as never]; expect(parseStored(JSON.stringify(s))).toBeNull();
  });
  it("restores a good backup and never rotates corrupt primary over it", () => {
    const s = fresh(); const data = new Map([[SAVE_KEY, "bad json"], [BACKUP_KEY, JSON.stringify(s)]]);
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    expect(restoreSession(storage)?.gameId).toBe(s.gameId); persistSession(storage, s); expect(data.get(BACKUP_KEY)).toBe(JSON.stringify(s));
  });
  it("primary write is attempted even when backup rotation hits quota", () => {
    const s = fresh(); const calls: string[] = []; persistSession({ getItem: () => JSON.stringify(s), setItem: (key) => { calls.push(key); if (key === BACKUP_KEY) throw Error("quota"); } }, s);
    expect(calls).toEqual([BACKUP_KEY, SAVE_KEY]);
  });
  it("migrates only outstanding same-game effects, once, retaining control queue", () => {
    const s = fresh(); const legacy = JSON.stringify({ gameId: s.gameId, processedDeaths: [], queue: [effect(), { id: "invalid" }] });
    migrateLegacyEffects(s, legacy); migrateLegacyEffects(s, legacy); expect(s.pendingEffects).toHaveLength(1);
    s.revision = 1; s.pendingEffects = []; migrateLegacyEffects(s, legacy); expect(s.pendingEffects).toHaveLength(0);
    const other = fresh(); migrateLegacyEffects(other, legacy); expect(other.pendingEffects).toHaveLength(0);
  });
});

describe("baseline: common image-space geometry", () => {
  it.each([[1152, 648], [1536, 691], [1400, 500], [896, 414], [844, 390], [1920, 1080], [390, 844]])("fills %ix%i and round-trips coordinates", (w, h) => {
    const t = battlefieldTransform(w, h); expect(1152 * t.scale).toBeGreaterThanOrEqual(w); expect(648 * t.scale).toBeGreaterThanOrEqual(h);
    const p = worldToScreen(t, 1078, 324); const back = screenToWorld(t, p.x, p.y); expect(back.x).toBeCloseTo(1078); expect(back.y).toBeCloseTo(324);
    expect(worldToScreen(t, t.visible.x, t.visible.y).x).toBeCloseTo(0); expect(worldToScreen(t, t.visible.x, t.visible.y).y).toBeCloseTo(0);
  });
  it.each([[0, 500], [NaN, 300], [100, Infinity], [-1, 300]])("rejects bad viewport", (w, h) => expect(() => battlefieldTransform(w, h)).toThrow());
});

describe("baseline: unsupported is not free", () => {
  it("does not allow a series evolution-stone requirement to disappear", () => {
    const s = fresh(); const card = [...catalog.cards.values()].find(c => c.series === "史前巨兽")!;
    s.state.players.P1.hand = [card.id];
    expect(applyCommand(s, catalog, { type: "summon", handIndex: 0, slotIndex: 0, cardId: card.id })).toContain("进化石");
    expect(s.state.players.P1.board.every(m => m === null)).toBe(true);
  });
});
