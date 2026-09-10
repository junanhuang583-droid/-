import { describe, expect, it } from "vitest";
import type { Keyword, MinionCardDefinition } from "../src/model/cards.js";
import {
  attackHero,
  attackMinion,
  canMinionAttack,
  createBasicGame,
  createCatalog,
  endTurn,
  revealCurrentTurn,
  summonFromHand,
} from "../src/core/basic-game.js";

const fixedRandom = () => 0.1;

function card(
  id: `C${string}`,
  name: string,
  attack: number,
  health: number,
  options: { summonText?: string | null; keywords?: Keyword[]; copies?: number | null } = {},
): MinionCardDefinition {
  return {
    id,
    name,
    type: "minion",
    attributes: ["普通"],
    copies: options.copies === undefined ? 40 : options.copies,
    notes: [],
    health,
    attack,
    healing: null,
    summonText: options.summonText ?? null,
    effects: (options.keywords ?? []).map((keyword) => ({ text: keyword, implementation: "keyword", keyword })),
  };
}

const cards: MinionCardDefinition[] = [card("C001", "测试兵", 2, 3)];

function freshSession(testCards: MinionCardDefinition[]) {
  const catalog = createCatalog(testCards);
  const session = createBasicGame(testCards, fixedRandom);
  revealCurrentTurn(session);
  return { catalog, session };
}

describe("basic game and first-wave rules", () => {
  it("enforces one normal summon and summon sickness", () => {
    const { catalog, session } = freshSession(cards);
    expect(summonFromHand(session, catalog, 0, 0)).toBeNull();
    const minion = session.state.players[session.state.activePlayer].board[0];
    expect(minion).not.toBeNull();
    expect(minion && canMinionAttack(session, minion)).toBe(false);
    expect(summonFromHand(session, catalog, 0, 1)).toContain("已经进行过普通召唤");
  });

  it("attacks without retaliation and sends dead minions to discard", () => {
    const { catalog, session } = freshSession(cards);
    const first = session.state.activePlayer;
    summonFromHand(session, catalog, 0, 0);

    endTurn(session, fixedRandom);
    revealCurrentTurn(session);
    const second = session.state.activePlayer;
    summonFromHand(session, catalog, 0, 0);

    endTurn(session, fixedRandom);
    revealCurrentTurn(session);
    const attacker = session.state.players[first].board[0]!;
    const defender = session.state.players[second].board[0]!;
    const attackerHealthBefore = attacker.currentHealth;

    expect(attackMinion(session, catalog, attacker.instanceId, defender.instanceId)).toBeNull();
    expect(attacker.currentHealth).toBe(attackerHealthBefore);
    expect(defender.currentHealth).toBe(1);

    endTurn(session, fixedRandom);
    revealCurrentTurn(session);
    const secondAttacker = session.state.players[second].board[0]!;
    attackMinion(session, catalog, secondAttacker.instanceId, attacker.instanceId);

    endTurn(session, fixedRandom);
    revealCurrentTurn(session);
    const firstAttacker = session.state.players[first].board[0]!;
    const secondDefender = session.state.players[second].board[0]!;
    attackMinion(session, catalog, firstAttacker.instanceId, secondDefender.instanceId);

    expect(session.state.players[second].board[0]).toBeNull();
    expect(session.state.players[second].discardPile).toContain("C001");
    expect(session.state.deathLog).toHaveLength(1);
  });

  it("pays health summon costs and allows the cost to be lethal", () => {
    const costly = [card("C010", "血契兵", 4, 4, { summonText: "扣3血召唤。" })];
    const { catalog, session } = freshSession(costly);
    const active = session.state.activePlayer;
    session.state.players[active].health = 3;

    expect(summonFromHand(session, catalog, 0, 0)).toBeNull();
    expect(session.state.players[active].health).toBe(0);
    expect(session.state.players[active].board[0]?.cardId).toBe("C010");
    expect(session.state.winner).toBe(active === "P1" ? "P2" : "P1");
  });

  it("keeps compound summon requirements blocked until their systems exist", () => {
    const evo = [card("C011", "进化兽", 5, 5, { summonText: "野狼＋进化石，并扣2血召唤。" })];
    const { catalog, session } = freshSession(evo);
    expect(summonFromHand(session, catalog, 0, 0)).toContain("进化石");
  });

  it("haste attacks on summon turn and fast attack attacks twice", () => {
    const speedy = [card("C020", "疾风兵", 2, 3, { keywords: ["haste", "fast_attack"] })];
    const { catalog, session } = freshSession(speedy);
    const active = session.state.activePlayer;
    const enemy = active === "P1" ? "P2" : "P1";
    summonFromHand(session, catalog, 0, 0);
    const attacker = session.state.players[active].board[0]!;

    expect(canMinionAttack(session, attacker)).toBe(true);
    expect(attackHero(session, catalog, attacker.instanceId)).toBeNull();
    expect(attackHero(session, catalog, attacker.instanceId)).toBeNull();
    expect(session.state.players[enemy].health).toBe(76);
    expect(attackHero(session, catalog, attacker.instanceId)).toContain("用完攻击次数");
  });

  it("taunt blocks other targets while arrogance ignores taunt", () => {
    const testCards = [
      card("C030", "普通攻击者", 3, 4, { keywords: ["haste"] }),
      card("C031", "狂妄攻击者", 3, 4, { keywords: ["haste", "arrogance"] }),
      card("C032", "嘲讽者", 1, 5, { keywords: ["taunt"] }),
      card("C033", "旁边的人", 1, 5),
    ];
    const { catalog, session } = freshSession(testCards);
    const active = session.state.activePlayer;
    const enemy = active === "P1" ? "P2" : "P1";

    const normalId = testCards[0]!.id;
    session.state.players[active].hand = [normalId];
    summonFromHand(session, catalog, 0, 0);
    const normal = session.state.players[active].board[0]!;
    session.state.players[enemy].board[0] = makeMinion(testCards[2]!, enemy, session.state.turn - 1);
    session.state.players[enemy].board[1] = makeMinion(testCards[3]!, enemy, session.state.turn - 1);

    expect(attackHero(session, catalog, normal.instanceId)).toContain("嘲讽");
    expect(attackMinion(session, catalog, normal.instanceId, session.state.players[enemy].board[1]!.instanceId)).toContain("嘲讽");

    session.state.players[active].board[0] = makeMinion(testCards[1]!, active, session.state.turn, ["haste", "arrogance"]);
    const arrogant = session.state.players[active].board[0]!;
    expect(attackHero(session, catalog, arrogant.instanceId)).toBeNull();
  });

  it("guard blocks one damage instance, armor reduces damage, and lifesteal heals actual damage", () => {
    const testCards = [
      card("C040", "吸血者", 5, 5, { keywords: ["haste", "lifesteal"] }),
      card("C041", "守甲者", 1, 8, { keywords: ["guard", "armor_2"] }),
    ];
    const { catalog, session } = freshSession(testCards);
    const active = session.state.activePlayer;
    const enemy = active === "P1" ? "P2" : "P1";
    session.state.players[active].health = 70;
    session.state.players[active].hand = ["C040"];
    summonFromHand(session, catalog, 0, 0);
    const attacker = session.state.players[active].board[0]!;
    session.state.players[enemy].board[0] = makeMinion(testCards[1]!, enemy, session.state.turn - 1, ["guard", "armor_2"]);
    const defender = session.state.players[enemy].board[0]!;

    expect(attackMinion(session, catalog, attacker.instanceId, defender.instanceId)).toBeNull();
    expect(defender.currentHealth).toBe(8);
    expect(session.state.players[active].health).toBe(70);

    attacker.attacksUsedThisTurn = 0;
    expect(attackMinion(session, catalog, attacker.instanceId, defender.instanceId)).toBeNull();
    expect(defender.currentHealth).toBe(5);
    expect(session.state.players[active].health).toBe(73);
  });

  it("adds one temporary demo copy for known-stat cards with unknown quantity", () => {
    const demoCards: MinionCardDefinition[] = [
      card("C101", "数量未知但可战斗", 3, 4, { copies: null }),
      {
        ...card("C102", "数值未确认", 1, 1, { copies: 4 }),
        health: null,
        attack: null,
      },
    ];

    const catalog = createCatalog(demoCards);
    expect(catalog.playableUniqueCards).toBe(1);
    expect(catalog.playableDeckSize).toBe(1);
    expect(catalog.skippedCardIds).toContain("C102");
  });
});

function makeMinion(
  definition: MinionCardDefinition,
  owner: "P1" | "P2",
  summonedOnTurn: number,
  keywords: Keyword[] = definition.effects.flatMap((effect) => effect.keyword ? [effect.keyword] : []),
) {
  return {
    instanceId: `${definition.id}-${Math.random()}`,
    cardId: definition.id,
    owner,
    controller: owner,
    currentHealth: definition.health ?? 1,
    attackModifier: 0,
    attacksUsedThisTurn: 0,
    summonedOnTurn,
    statuses: keywords.map((keyword) => keyword === "guard" ? { keyword, charges: 1 } : { keyword }),
  };
}
