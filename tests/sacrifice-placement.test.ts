import { describe, expect, it } from "vitest";
import { createBasicGame, createCatalog, revealCurrentTurn } from "../src/core/basic-game.js";
import { summonIntoSacrificedSlot } from "../src/core/sacrifice-placement.js";
import type { MinionCardDefinition } from "../src/model/cards.js";
import type { MinionInstance } from "../src/model/state.js";

const fixedRandom = () => 0.1;

function card(id: `C${string}`, name: string, summonText: string | null = null): MinionCardDefinition {
  return {
    id,
    name,
    type: "minion",
    attributes: ["普通"],
    copies: 20,
    notes: [],
    health: 4,
    attack: 3,
    healing: null,
    summonText,
    effects: [],
  };
}

function minion(definition: MinionCardDefinition, owner: "P1" | "P2", slot: number): MinionInstance {
  return {
    instanceId: `${definition.id}-slot-${slot}`,
    cardId: definition.id,
    owner,
    controller: owner,
    currentHealth: definition.health ?? 1,
    attackModifier: 0,
    attacksUsedThisTurn: 0,
    summonedOnTurn: 0,
    statuses: [],
  };
}

describe("sacrifice summon placement", () => {
  it("places a one-sacrifice summon in the sacrificed slot even on a full board", () => {
    const victim = card("C001", "祭品");
    const filler = card("C002", "填充兵");
    const ritual = card("C003", "献祭兽", "献祭1只随从召唤。");
    const cards = [victim, filler, ritual];
    const catalog = createCatalog(cards);
    const session = createBasicGame(cards, fixedRandom);
    revealCurrentTurn(session);
    const active = session.state.activePlayer;
    const player = session.state.players[active];

    player.hand = [ritual.id];
    player.board = [0, 1, 2, 3, 4].map((slot) => minion(slot === 3 ? victim : filler, active, slot));
    const sacrificedId = player.board[3]!.instanceId;

    expect(summonIntoSacrificedSlot(session, catalog, 0, [sacrificedId])).toBeNull();
    expect(player.board).toHaveLength(5);
    expect(player.board[3]?.cardId).toBe(ritual.id);
    expect(player.discardPile).toContain(victim.id);
  });

  it("uses the left-most sacrificed slot when multiple minions are sacrificed", () => {
    const victimA = card("C011", "左祭品");
    const victimB = card("C012", "右祭品");
    const filler = card("C013", "填充兵");
    const ritual = card("C014", "双祭兽", "献祭2只随从召唤。");
    const cards = [victimA, victimB, filler, ritual];
    const catalog = createCatalog(cards);
    const session = createBasicGame(cards, fixedRandom);
    revealCurrentTurn(session);
    const active = session.state.activePlayer;
    const player = session.state.players[active];

    player.hand = [ritual.id];
    player.board = [
      minion(filler, active, 0),
      minion(victimA, active, 1),
      minion(filler, active, 2),
      minion(victimB, active, 3),
      minion(filler, active, 4),
    ];

    expect(summonIntoSacrificedSlot(session, catalog, 0, [player.board[3]!.instanceId, player.board[1]!.instanceId])).toBeNull();
    expect(player.board[1]?.cardId).toBe(ritual.id);
    expect(player.board[3]).toBeNull();
    expect(player.discardPile).toEqual(expect.arrayContaining([victimA.id, victimB.id]));
  });
});
