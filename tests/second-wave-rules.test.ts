import { describe, expect, it } from "vitest";
import type { Keyword, MinionCardDefinition } from "../src/model/cards.js";
import type { MinionInstance, PlayerId } from "../src/model/state.js";
import {
  applyControlStatus,
  canMinionAttack,
  choosePendingEffectTarget,
  createBasicGame,
  createCatalog,
  currentPendingEffect,
  drainMinion,
  endTurn,
  getSummonRequirement,
  revealCurrentTurn,
  summonFromHand,
} from "../src/core/basic-game.js";

const fixedRandom = () => 0.1;

function makeCard(
  id: `C${string}`,
  name: string,
  attack: number,
  health: number,
  options: {
    summonText?: string | null;
    keywords?: Keyword[];
    effects?: MinionCardDefinition["effects"];
  } = {},
): MinionCardDefinition {
  return {
    id,
    name,
    type: "minion",
    attributes: ["普通"],
    copies: 20,
    notes: [],
    health,
    attack,
    healing: null,
    summonText: options.summonText ?? null,
    effects: options.effects ?? (options.keywords ?? []).map((keyword) => ({ text: keyword, implementation: "keyword", keyword })),
  };
}

function instance(card: MinionCardDefinition, owner: PlayerId, summonedOnTurn: number): MinionInstance {
  return {
    instanceId: `${card.id}-${Math.random()}`,
    cardId: card.id,
    owner,
    controller: owner,
    currentHealth: card.health ?? 1,
    attackModifier: 0,
    attacksUsedThisTurn: 0,
    summonedOnTurn,
    statuses: (card.effects ?? []).flatMap((effect) => effect.keyword && ["haste", "fast_attack", "taunt", "arrogance", "guard", "armor_1", "armor_2", "lifesteal"].includes(effect.keyword)
      ? [{ keyword: effect.keyword, ...(effect.keyword === "guard" ? { charges: 1 } : {}) }]
      : []),
  };
}

function fresh(cards: MinionCardDefinition[]) {
  const catalog = createCatalog(cards);
  const session = createBasicGame(cards, fixedRandom);
  revealCurrentTurn(session);
  return { catalog, session };
}

function swapTurn(session: ReturnType<typeof createBasicGame>): void {
  expect(endTurn(session, fixedRandom)).toBeNull();
  revealCurrentTurn(session);
}

describe("second-wave rules", () => {
  it("parses and pays sacrifice plus health summon conditions", () => {
    const fuel = makeCard("C100", "祭品", 1, 2);
    const summon = makeCard("C101", "献祭召唤兽", 4, 6, { summonText: "献祭1只随从，并扣4血召唤。" });
    const { catalog, session } = fresh([fuel, summon]);
    const active = session.state.activePlayer;
    const player = session.state.players[active];
    const fuelInstance = instance(fuel, active, session.state.turn - 1);
    player.board[0] = fuelInstance;
    player.hand = [summon.id];

    expect(getSummonRequirement(summon)).toEqual({ healthCost: 4, sacrificeCount: 1, unsupportedReason: null });
    expect(summonFromHand(session, catalog, 0, 1)).toContain("需要献祭");
    expect(summonFromHand(session, catalog, 0, 1, [fuelInstance.instanceId])).toBeNull();
    expect(player.health).toBe(76);
    expect(player.board[0]).toBeNull();
    expect(player.board[1]?.cardId).toBe("C101");
    expect(session.state.deathLog.at(-1)?.cause).toBe("sacrifice");
  });

  it("turns a deathrattle minion into its derived token after sacrifice", () => {
    const fish = makeCard("C200", "潮汐测试鱼", 2, 3, {
      effects: [{ name: "亡语", text: "死后变为鱼仔", implementation: "keyword", keyword: "deathrattle" }],
    });
    const summoner = makeCard("C201", "献祭者", 3, 4, { summonText: "献祭1只随从召唤。" });
    const token: MinionCardDefinition = {
      id: "T001",
      name: "鱼仔",
      type: "token_minion",
      attributes: [],
      copies: null,
      notes: [],
      health: 3,
      attack: 2,
      healing: null,
      summonText: "由亡语产生",
      effects: [],
    };
    const { catalog, session } = fresh([fish, summoner, token]);
    const active = session.state.activePlayer;
    const player = session.state.players[active];
    const fishInstance = instance(fish, active, session.state.turn - 1);
    player.board[0] = fishInstance;
    player.hand = [summoner.id];

    expect(summonFromHand(session, catalog, 0, 1, [fishInstance.instanceId])).toBeNull();
    expect(player.board[0]?.cardId).toBe("T001");
    expect(player.board[1]?.cardId).toBe("C201");
  });

  it("queues freeze deathrattle targeting and blocks the next two own turns", () => {
    const ice = makeCard("C037", "冰晶测试", 1, 8, {
      effects: [{ name: "亡语·霜", text: "死后冻住对方一只随从，两个回合。", implementation: "raw" }],
    });
    const summoner = makeCard("C202", "献祭者", 3, 4, { summonText: "献祭1只随从召唤。" });
    const targetCard = makeCard("C203", "目标", 2, 5);
    const { catalog, session } = fresh([ice, summoner, targetCard]);
    const active = session.state.activePlayer;
    const enemy: PlayerId = active === "P1" ? "P2" : "P1";
    const iceInstance = instance(ice, active, session.state.turn - 1);
    const target = instance(targetCard, enemy, session.state.turn - 1);
    session.state.players[active].board[0] = iceInstance;
    session.state.players[active].hand = [summoner.id];
    session.state.players[enemy].board[0] = target;

    expect(summonFromHand(session, catalog, 0, 1, [iceInstance.instanceId])).toBeNull();
    expect(currentPendingEffect(session)?.kind).toBe("freeze");
    expect(choosePendingEffectTarget(session, catalog, target.instanceId)).toBeNull();
    expect(currentPendingEffect(session)).toBeNull();

    swapTurn(session);
    expect(session.state.activePlayer).toBe(enemy);
    expect(canMinionAttack(session, target, catalog)).toBe(false);
    swapTurn(session);
    swapTurn(session);
    expect(session.state.activePlayer).toBe(enemy);
    expect(canMinionAttack(session, target, catalog)).toBe(false);
    swapTurn(session);
    swapTurn(session);
    expect(session.state.activePlayer).toBe(enemy);
    expect(canMinionAttack(session, target, catalog)).toBe(true);
  });

  it("supports sleep timing and direct drain life loss", () => {
    const source = makeCard("C300", "汲取者", 1, 4);
    const targetCard = makeCard("C301", "目标", 2, 2);
    const { catalog, session } = fresh([source, targetCard]);
    const active = session.state.activePlayer;
    const enemy: PlayerId = active === "P1" ? "P2" : "P1";
    const target = instance(targetCard, enemy, session.state.turn - 1);
    session.state.players[enemy].board[0] = target;
    session.state.players[active].health = 60;

    applyControlStatus(session, target, "sleep", 1, source.id);
    swapTurn(session);
    expect(canMinionAttack(session, target, catalog)).toBe(false);
    swapTurn(session);
    swapTurn(session);
    expect(canMinionAttack(session, target, catalog)).toBe(true);

    const freshTarget = instance(targetCard, enemy, session.state.turn - 1);
    session.state.players[enemy].board[0] = freshTarget;
    expect(drainMinion(session, catalog, active, enemy, freshTarget.instanceId, 3, "测试汲取")).toBeNull();
    expect(session.state.players[active].health).toBe(62);
    expect(session.state.players[enemy].board[0]).toBeNull();
    expect(session.state.deathLog.at(-1)?.cardId).toBe("C301");
  });
});
