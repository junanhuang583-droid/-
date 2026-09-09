import { describe, expect, it } from "vitest";
import type { MinionCardDefinition } from "../src/model/cards.js";
import {
  attackMinion,
  canMinionAttack,
  createBasicGame,
  createCatalog,
  endTurn,
  revealCurrentTurn,
  summonFromHand,
} from "../src/core/basic-game.js";

const cards: MinionCardDefinition[] = [
  {
    id: "C001",
    name: "测试兵",
    type: "minion",
    attributes: ["普通"],
    copies: 40,
    notes: [],
    health: 3,
    attack: 2,
    healing: null,
    summonText: null,
    effects: [],
  },
];

const fixedRandom = () => 0.1;

describe("basic no-effects game", () => {
  it("enforces one normal summon and summon sickness", () => {
    const catalog = createCatalog(cards);
    const session = createBasicGame(cards, fixedRandom);
    revealCurrentTurn(session);

    expect(summonFromHand(session, catalog, 0, 0)).toBeNull();
    const minion = session.state.players[session.state.activePlayer].board[0];
    expect(minion).not.toBeNull();
    expect(minion && canMinionAttack(session, minion)).toBe(false);
    expect(summonFromHand(session, catalog, 0, 1)).toContain("已经进行过普通召唤");
  });

  it("attacks without retaliation and sends dead minions to discard", () => {
    const catalog = createCatalog(cards);
    const session = createBasicGame(cards, fixedRandom);
    revealCurrentTurn(session);
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
});
