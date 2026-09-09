import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { GameState, MinionInstance, PlayerId, PlayerState } from "../model/state.js";
import { RULES_CORE_V1 } from "./rules-core-v1.js";

export interface BasicGameLogEntry {
  at: string;
  turn: number;
  text: string;
}

export interface BasicGameSession {
  schemaVersion: 1;
  gameId: string;
  createdAt: string;
  updatedAt: string;
  turnsStarted: Record<PlayerId, number>;
  handoffRequired: boolean;
  state: GameState;
  log: BasicGameLogEntry[];
}

export interface BasicGameCatalog {
  cards: Map<CardId, MinionCardDefinition>;
  playableDeckSize: number;
  skippedCardIds: CardId[];
}

export function createCatalog(cards: MinionCardDefinition[]): BasicGameCatalog {
  const map = new Map<CardId, MinionCardDefinition>();
  let playableDeckSize = 0;
  const skippedCardIds: CardId[] = [];

  for (const card of cards) {
    map.set(card.id, card);
    if (
      card.type !== "minion" ||
      card.copies === null ||
      card.copies <= 0 ||
      card.health === null ||
      card.attack === null
    ) {
      skippedCardIds.push(card.id);
      continue;
    }
    playableDeckSize += card.copies;
  }

  return { cards: map, playableDeckSize, skippedCardIds };
}

export function createBasicGame(
  cards: MinionCardDefinition[],
  random: () => number = Math.random,
): BasicGameSession {
  const catalog = createCatalog(cards);
  const deck: CardId[] = [];

  for (const card of cards) {
    if (
      card.type !== "minion" ||
      card.copies === null ||
      card.copies <= 0 ||
      card.health === null ||
      card.attack === null
    ) {
      continue;
    }
    for (let i = 0; i < card.copies; i += 1) deck.push(card.id);
  }

  shuffle(deck, random);
  const firstPlayer: PlayerId = random() < 0.5 ? "P1" : "P2";
  const now = new Date().toISOString();
  const state: GameState = {
    turn: 1,
    activePlayer: firstPlayer,
    firstPlayer,
    sharedDeck: deck,
    players: {
      P1: createPlayer("P1"),
      P2: createPlayer("P2"),
    },
    deathLog: [],
    winner: null,
  };

  const session: BasicGameSession = {
    schemaVersion: 1,
    gameId: createId(),
    createdAt: now,
    updatedAt: now,
    turnsStarted: { P1: 0, P2: 0 },
    handoffRequired: true,
    state,
    log: [],
  };

  drawCards(session, "P1", RULES_CORE_V1.startingHandSize, random);
  drawCards(session, "P2", RULES_CORE_V1.startingHandSize, random);
  beginTurn(session, firstPlayer, random);
  log(session, `新对局开始，${playerName(firstPlayer)}先手。基础验收模式不执行任何随从特殊效果。`);
  log(session, `本局共享牌库载入 ${catalog.playableDeckSize} 张可运行随从牌。`);
  return session;
}

export function revealCurrentTurn(session: BasicGameSession): void {
  session.handoffRequired = false;
  touch(session);
}

export function summonFromHand(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  handIndex: number,
  slotIndex: number,
): string | null {
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  const player = session.state.players[session.state.activePlayer];
  if (player.normalSummonsUsedThisTurn >= RULES_CORE_V1.normalSummonsPerTurn) {
    return "本回合已经进行过普通召唤。";
  }
  if (slotIndex < 0 || slotIndex >= RULES_CORE_V1.normalBoardSlots) return "随从位无效。";
  if (player.board[slotIndex] !== null) return "该随从位已经被占用。";
  const cardId = player.hand[handIndex];
  if (!cardId) return "手牌不存在。";
  const card = catalog.cards.get(cardId);
  if (!card || card.type !== "minion" || card.health === null || card.attack === null) {
    return "这张牌当前不能在基础模式召唤。";
  }

  player.hand.splice(handIndex, 1);
  const instance: MinionInstance = {
    instanceId: createId(),
    cardId,
    owner: player.id,
    controller: player.id,
    currentHealth: card.health,
    attackModifier: 0,
    attacksUsedThisTurn: 0,
    summonedOnTurn: session.state.turn,
    statuses: [],
  };
  player.board[slotIndex] = instance;
  player.normalSummonsUsedThisTurn += 1;
  log(session, `${playerName(player.id)}召唤了「${card.name}」到 ${slotIndex + 1} 号位。`);
  touch(session);
  return null;
}

export function attackMinion(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attackerInstanceId: string,
  targetInstanceId: string,
): string | null {
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  const attacker = findBoardMinion(session, session.state.activePlayer, attackerInstanceId);
  const defenderId = otherPlayer(session.state.activePlayer);
  const target = findBoardMinion(session, defenderId, targetInstanceId);
  if (!attacker || !target) return "攻击目标不存在。";
  const reason = validateAttacker(session, attacker);
  if (reason) return reason;

  const attack = getAttack(attacker, catalog);
  target.minion.currentHealth -= attack;
  attacker.minion.attacksUsedThisTurn += 1;
  const attackerName = cardName(attacker.minion.cardId, catalog);
  const targetName = cardName(target.minion.cardId, catalog);
  log(session, `${playerName(session.state.activePlayer)}的「${attackerName}」攻击「${targetName}」，造成 ${attack} 点伤害。`);

  if (target.minion.currentHealth <= 0) {
    killMinion(session, defenderId, target.slotIndex, "damage", catalog);
  }
  touch(session);
  return null;
}

export function attackHero(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attackerInstanceId: string,
): string | null {
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  const active = session.state.activePlayer;
  const attacker = findBoardMinion(session, active, attackerInstanceId);
  if (!attacker) return "攻击随从不存在。";
  const reason = validateAttacker(session, attacker);
  if (reason) return reason;

  const targetPlayerId = otherPlayer(active);
  const damage = getAttack(attacker, catalog);
  session.state.players[targetPlayerId].health -= damage;
  attacker.minion.attacksUsedThisTurn += 1;
  log(session, `${playerName(active)}的「${cardName(attacker.minion.cardId, catalog)}」直接攻击${playerName(targetPlayerId)}，造成 ${damage} 点伤害。`);
  resolveWinner(session);
  touch(session);
  return null;
}

export function endTurn(
  session: BasicGameSession,
  random: () => number = Math.random,
): string | null {
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  const previous = session.state.activePlayer;
  const next = otherPlayer(previous);
  session.state.turn += 1;
  beginTurn(session, next, random);
  session.handoffRequired = true;
  log(session, `${playerName(previous)}结束回合，轮到${playerName(next)}。`);
  touch(session);
  return null;
}

export function canMinionAttack(session: BasicGameSession, minion: MinionInstance): boolean {
  return validateAttacker(session, { minion, slotIndex: -1 }) === null;
}

function beginTurn(session: BasicGameSession, playerId: PlayerId, random: () => number): void {
  session.state.activePlayer = playerId;
  const player = session.state.players[playerId];
  player.normalSummonsUsedThisTurn = 0;
  for (const minion of player.board) {
    if (minion) minion.attacksUsedThisTurn = 0;
  }
  for (const minion of player.overflowMinions) minion.attacksUsedThisTurn = 0;

  const startedBefore = session.turnsStarted[playerId];
  session.turnsStarted[playerId] += 1;
  const isSecondPlayer = playerId !== session.state.firstPlayer;
  const drawCount = isSecondPlayer && startedBefore === 0
    ? RULES_CORE_V1.secondPlayerFirstDraw
    : RULES_CORE_V1.normalDrawPerTurn;
  drawCards(session, playerId, drawCount, random);
}

function drawCards(
  session: BasicGameSession,
  playerId: PlayerId,
  count: number,
  random: () => number,
): void {
  const player = session.state.players[playerId];
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    if (session.state.sharedDeck.length === 0) recycleDiscards(session, random);
    const cardId = session.state.sharedDeck.pop();
    if (!cardId) break;
    player.hand.push(cardId);
    drawn += 1;
  }
  if (drawn > 0) log(session, `${playerName(playerId)}摸了 ${drawn} 张牌。`);
}

function recycleDiscards(session: BasicGameSession, random: () => number): void {
  const recycled = [
    ...session.state.players.P1.discardPile,
    ...session.state.players.P2.discardPile,
  ];
  session.state.players.P1.discardPile = [];
  session.state.players.P2.discardPile = [];
  shuffle(recycled, random);
  session.state.sharedDeck.push(...recycled);
  if (recycled.length > 0) log(session, `共享牌库抽空，临时规则将双方弃牌堆合并洗回，共 ${recycled.length} 张。`);
}

function validateAttacker(
  session: BasicGameSession,
  found: { minion: MinionInstance; slotIndex: number },
): string | null {
  const minion = found.minion;
  if (minion.controller !== session.state.activePlayer) return "只能使用当前回合一方的随从攻击。";
  if (minion.summonedOnTurn === session.state.turn) return "普通随从上场当回合不能攻击。";
  if (minion.attacksUsedThisTurn >= RULES_CORE_V1.normalMinionAttacksPerTurn) return "该随从本回合已经攻击过。";
  return null;
}

function getAttack(minion: MinionInstance, catalog: BasicGameCatalog): number {
  const card = catalog.cards.get(minion.cardId);
  const base = card?.attack ?? 0;
  return Math.max(RULES_CORE_V1.attackFloor, base + minion.attackModifier);
}

function killMinion(
  session: BasicGameSession,
  playerId: PlayerId,
  slotIndex: number,
  cause: "damage" | "sacrifice" | "execution" | "other",
  catalog: BasicGameCatalog,
): void {
  const player = session.state.players[playerId];
  const minion = player.board[slotIndex];
  if (!minion) return;
  player.board[slotIndex] = null;
  player.discardPile.push(minion.cardId);
  session.state.deathLog.push({
    turn: session.state.turn,
    owner: minion.owner,
    cardId: minion.cardId,
    instanceId: minion.instanceId,
    cause,
    canRevive: cause !== "execution",
  });
  log(session, `「${cardName(minion.cardId, catalog)}」死亡并进入${playerName(playerId)}弃牌堆。特殊亡语未执行。`);
}

function resolveWinner(session: BasicGameSession): void {
  const p1Dead = session.state.players.P1.health <= 0;
  const p2Dead = session.state.players.P2.health <= 0;
  if (p1Dead && p2Dead) session.state.winner = "draw";
  else if (p1Dead) session.state.winner = "P2";
  else if (p2Dead) session.state.winner = "P1";
  if (session.state.winner) {
    log(session, session.state.winner === "draw" ? "双方同时归零，本局平局。" : `${playerName(session.state.winner)}获胜。`);
  }
}

function findBoardMinion(
  session: BasicGameSession,
  playerId: PlayerId,
  instanceId: string,
): { minion: MinionInstance; slotIndex: number } | null {
  const board = session.state.players[playerId].board;
  for (let i = 0; i < board.length; i += 1) {
    const minion = board[i];
    if (minion?.instanceId === instanceId) return { minion, slotIndex: i };
  }
  return null;
}

function createPlayer(id: PlayerId): PlayerState {
  return {
    id,
    health: RULES_CORE_V1.startingHeroHealth,
    hand: [],
    discardPile: [],
    board: Array.from({ length: RULES_CORE_V1.normalBoardSlots }, () => null),
    overflowMinions: [],
    equipment: null,
    scene: null,
    normalSummonsUsedThisTurn: 0,
  };
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function playerName(playerId: PlayerId): string {
  return playerId === "P1" ? "玩家1" : "玩家2";
}

function cardName(cardId: CardId, catalog: BasicGameCatalog): string {
  return catalog.cards.get(cardId)?.name ?? cardId;
}

function log(session: BasicGameSession, text: string): void {
  session.log.push({ at: new Date().toISOString(), turn: session.state.turn, text });
  if (session.log.length > 300) session.log.splice(0, session.log.length - 300);
}

function touch(session: BasicGameSession): void {
  session.updatedAt = new Date().toISOString();
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
