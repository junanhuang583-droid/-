import type { CardId, Keyword, MinionCardDefinition } from "../model/cards.js";
import type { GameState, MinionInstance, PlayerId, PlayerState, StatusState } from "../model/state.js";
import { RULES_CORE_V1 } from "./rules-core-v1.js";

export interface BasicGameLogEntry {
  at: string;
  turn: number;
  text: string;
}

export type PendingControlEffectKind = "freeze" | "petrify";

export interface PendingMinionTargetEffect {
  id: string;
  sourcePlayer: PlayerId;
  sourceCardId: CardId;
  sourceName: string;
  kind: PendingControlEffectKind;
  targetPlayer: PlayerId;
  remainingTargets: number;
  durationOwnTurns: number;
  selectedTargetIds: string[];
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
  /** v0.3 起加入。保留可选以兼容旧的本地 v1 存档。 */
  pendingEffects?: PendingMinionTargetEffect[];
}

export interface BasicGameCatalog {
  cards: Map<CardId, MinionCardDefinition>;
  playableDeckSize: number;
  playableUniqueCards: number;
  skippedCardIds: CardId[];
}

export interface SummonRequirement {
  healthCost: number;
  sacrificeCount: number;
  unsupportedReason: string | null;
}

const PASSIVE_KEYWORDS = new Set<Keyword>([
  "haste",
  "fast_attack",
  "taunt",
  "arrogance",
  "guard",
  "armor_1",
  "armor_2",
  "lifesteal",
]);

const CONTROL_KEYWORDS = new Set<Keyword>(["sleep", "freeze", "petrify"]);

/**
 * Browser acceptance mode deliberately widens the demo pool without changing
 * canonical card quantities. Any formal minion with known health + attack gets
 * at least one temporary demo copy; explicitly confirmed copy counts are kept.
 * Cards with missing combat stats stay out rather than receiving invented data.
 */
function demoCopies(card: MinionCardDefinition): number {
  if (card.type !== "minion" || card.health === null || card.attack === null) return 0;
  if (card.copies !== null && card.copies > 0) return card.copies;
  return 1;
}

export function createCatalog(cards: MinionCardDefinition[]): BasicGameCatalog {
  const map = new Map<CardId, MinionCardDefinition>();
  let playableDeckSize = 0;
  let playableUniqueCards = 0;
  const skippedCardIds: CardId[] = [];

  for (const card of cards) {
    map.set(card.id, card);
    const copies = demoCopies(card);
    if (copies <= 0) {
      if (card.type === "minion") skippedCardIds.push(card.id);
      continue;
    }
    playableDeckSize += copies;
    playableUniqueCards += 1;
  }

  return { cards: map, playableDeckSize, playableUniqueCards, skippedCardIds };
}

export function createBasicGame(
  cards: MinionCardDefinition[],
  random: () => number = Math.random,
): BasicGameSession {
  const catalog = createCatalog(cards);
  const deck: CardId[] = [];

  for (const card of cards) {
    const copies = demoCopies(card);
    for (let i = 0; i < copies; i += 1) deck.push(card.id);
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
    pendingEffects: [],
  };

  drawCards(session, "P1", RULES_CORE_V1.startingHandSize, random);
  drawCards(session, "P2", RULES_CORE_V1.startingHandSize, random);
  beginTurn(session, firstPlayer, random);
  log(session, `新对局开始，${playerName(firstPlayer)}先手。`);
  log(session, "已启用底层规则：扣血召唤、迅疾、快攻、嘲讽、狂妄、守护、甲一/甲二、吸血、献祭、死亡记录、可自动判定的亡语、汲取底层与沉睡/冰冻/石化状态。进化、装备和场景仍未启用。");
  log(session, `演示牌池载入 ${catalog.playableUniqueCards} 种、共 ${catalog.playableDeckSize} 张可运行随从。未知卡牌数量只在本演示牌池临时按 1 张使用，不写回正式卡牌记录。`);
  return session;
}

export function revealCurrentTurn(session: BasicGameSession): void {
  ensureSessionExtensions(session);
  session.handoffRequired = false;
  touch(session);
}

export function currentPendingEffect(session: BasicGameSession): PendingMinionTargetEffect | null {
  ensureSessionExtensions(session);
  trimPendingEffects(session);
  return session.pendingEffects?.[0] ?? null;
}

export function getSummonRequirement(card: MinionCardDefinition): SummonRequirement {
  const text = card.summonText;
  if (!text || /直接召唤/.test(text)) return { healthCost: 0, sacrificeCount: 0, unsupportedReason: null };

  const healthMatch = text.match(/扣\s*(\d+)\s*血/);
  const healthCost = healthMatch ? Number(healthMatch[1]) : 0;
  const sacrificeMatch = text.match(/献祭\s*(\d+|一|二|两)\s*只随从/);
  const sacrificeCount = sacrificeMatch ? parseSmallCount(sacrificeMatch[1]!) : 0;

  if (/进化石|需.+召唤|＋|\+/.test(text)) {
    return {
      healthCost,
      sacrificeCount,
      unsupportedReason: "这张牌还包含进化石或前置随从等召唤条件，进化阶段实现后才能召唤。",
    };
  }

  const cleaned = text
    .replace(/献祭\s*(\d+|一|二|两)\s*只随从/g, "")
    .replace(/并扣\s*\d+\s*血/g, "")
    .replace(/扣\s*\d+\s*血/g, "")
    .replace(/[，,。；;\s]/g, "")
    .replace(/召唤/g, "");

  if (/扣[^\d\s].*血/.test(text) || cleaned.length > 0) {
    return { healthCost, sacrificeCount, unsupportedReason: "这张牌的召唤条件尚未完全程序化。" };
  }
  return { healthCost, sacrificeCount, unsupportedReason: null };
}

export function summonFromHand(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  handIndex: number,
  slotIndex: number,
  sacrificeInstanceIds: string[] = [],
): string | null {
  ensureSessionExtensions(session);
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  if (currentPendingEffect(session)) return "请先结算当前待处理的亡语效果。";

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

  const summonRule = getSummonRequirement(card);
  if (summonRule.unsupportedReason) return summonRule.unsupportedReason;

  const sacrifices = [...new Set(sacrificeInstanceIds)];
  if (summonRule.sacrificeCount > 0) {
    if (sacrifices.length !== summonRule.sacrificeCount) {
      return `这张牌需要献祭 ${summonRule.sacrificeCount} 只己方随从。`;
    }
    for (const instanceId of sacrifices) {
      if (!findBoardMinion(session, player.id, instanceId)) return "献祭目标必须是己方场上的随从。";
    }
  } else if (sacrifices.length > 0) {
    return "这张牌不需要献祭随从。";
  }

  player.hand.splice(handIndex, 1);

  for (const instanceId of sacrifices) {
    const found = findBoardMinion(session, player.id, instanceId);
    if (!found) continue;
    killMinion(session, player.id, found.slotIndex, "sacrifice", catalog);
  }

  if (summonRule.healthCost > 0) {
    player.health -= summonRule.healthCost;
    log(session, `${playerName(player.id)}为召唤「${card.name}」支付 ${summonRule.healthCost} 点生命。`);
  }

  const instance = createMinionInstance(card, player.id, session.state.turn);
  player.board[slotIndex] = instance;
  player.normalSummonsUsedThisTurn += 1;
  log(session, `${playerName(player.id)}召唤了「${card.name}」到 ${slotIndex + 1} 号位。`);
  resolveWinner(session);
  touch(session);
  return null;
}

export function attackMinion(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attackerInstanceId: string,
  targetInstanceId: string,
): string | null {
  ensureSessionExtensions(session);
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  if (currentPendingEffect(session)) return "请先结算当前待处理的亡语效果。";

  const active = session.state.activePlayer;
  const attacker = findBoardMinion(session, active, attackerInstanceId);
  const defenderId = otherPlayer(active);
  const target = findBoardMinion(session, defenderId, targetInstanceId);
  if (!attacker || !target) return "攻击目标不存在。";
  const reason = validateAttacker(session, catalog, attacker);
  if (reason) return reason;
  const targetReason = validateAttackTarget(session, catalog, attacker.minion, target.minion);
  if (targetReason) return targetReason;

  const attack = getAttack(attacker.minion, catalog);
  const damage = applyDamageToMinion(session, target.minion, attack, catalog);
  attacker.minion.attacksUsedThisTurn += 1;
  const attackerName = cardName(attacker.minion.cardId, catalog);
  const targetName = cardName(target.minion.cardId, catalog);
  log(session, `${playerName(active)}的「${attackerName}」攻击「${targetName}」，实际造成 ${damage} 点伤害。`);
  applyLifesteal(session, catalog, attacker.minion, damage);

  if (target.minion.currentHealth <= 0) {
    killMinion(session, defenderId, target.slotIndex, "damage", catalog);
  }
  resolveWinner(session);
  touch(session);
  return null;
}

export function attackHero(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attackerInstanceId: string,
): string | null {
  ensureSessionExtensions(session);
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  if (currentPendingEffect(session)) return "请先结算当前待处理的亡语效果。";

  const active = session.state.activePlayer;
  const attacker = findBoardMinion(session, active, attackerInstanceId);
  if (!attacker) return "攻击随从不存在。";
  const reason = validateAttacker(session, catalog, attacker);
  if (reason) return reason;
  if (!minionHasKeyword(session, catalog, attacker.minion, "arrogance") && enemyHasTaunt(session, catalog, active)) {
    return "对方场上存在嘲讽随从，必须优先攻击嘲讽目标。";
  }

  const targetPlayerId = otherPlayer(active);
  const damage = getAttack(attacker.minion, catalog);
  session.state.players[targetPlayerId].health -= damage;
  attacker.minion.attacksUsedThisTurn += 1;
  log(session, `${playerName(active)}的「${cardName(attacker.minion.cardId, catalog)}」直接攻击${playerName(targetPlayerId)}，造成 ${damage} 点伤害。`);
  applyLifesteal(session, catalog, attacker.minion, damage);
  resolveWinner(session);
  touch(session);
  return null;
}

export function drainMinion(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  sourcePlayerId: PlayerId,
  targetPlayerId: PlayerId,
  targetInstanceId: string,
  amount: number,
  sourceLabel = "汲取",
): string | null {
  ensureSessionExtensions(session);
  if (amount <= 0) return "汲取数值必须大于0。";
  const target = findBoardMinion(session, targetPlayerId, targetInstanceId);
  if (!target) return "汲取目标不存在。";

  const before = Math.max(0, target.minion.currentHealth);
  const actualLoss = Math.min(before, amount);
  target.minion.currentHealth -= amount;
  session.state.players[sourcePlayerId].health += actualLoss;
  log(session, `${sourceLabel}使「${cardName(target.minion.cardId, catalog)}」失去 ${actualLoss} 点生命，并为${playerName(sourcePlayerId)}回复 ${actualLoss} 点生命。`);
  if (target.minion.currentHealth <= 0) killMinion(session, targetPlayerId, target.slotIndex, "other", catalog);
  touch(session);
  return null;
}

export function choosePendingEffectTarget(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  targetInstanceId: string,
): string | null {
  ensureSessionExtensions(session);
  const effect = currentPendingEffect(session);
  if (!effect) return "当前没有待选择目标的效果。";
  if (effect.selectedTargetIds.includes(targetInstanceId)) return "同一次效果不能重复选择同一只随从。";

  const target = findBoardMinion(session, effect.targetPlayer, targetInstanceId);
  if (!target) return "该随从不是当前效果的合法目标。";

  applyControlStatus(session, target.minion, effect.kind, effect.durationOwnTurns, effect.sourceCardId);
  effect.selectedTargetIds.push(targetInstanceId);
  effect.remainingTargets -= 1;
  const label = effect.kind === "freeze" ? "冰冻" : "石化";
  log(session, `「${effect.sourceName}」的亡语使「${cardName(target.minion.cardId, catalog)}」${label} ${effect.durationOwnTurns} 个自己的回合。`);

  if (effect.remainingTargets <= 0 || countRemainingEffectTargets(session, effect) <= 0) {
    session.pendingEffects!.shift();
  }
  trimPendingEffects(session);
  touch(session);
  return null;
}

export function applyControlStatus(
  session: BasicGameSession,
  minion: MinionInstance,
  keyword: "sleep" | "freeze" | "petrify",
  durationOwnTurns: number,
  sourceCardId?: CardId,
): void {
  if (durationOwnTurns <= 0) return;
  const nextOwnTurn = session.turnsStarted[minion.controller] + 1;
  const expiresAfterOwnTurn = nextOwnTurn + durationOwnTurns - 1;
  const existing = minion.statuses.find((status) => status.keyword === keyword && status.expiresAfterOwnTurn !== undefined);
  if (existing) {
    existing.activeFromOwnTurn = Math.min(existing.activeFromOwnTurn ?? nextOwnTurn, nextOwnTurn);
    existing.expiresAfterOwnTurn = Math.max(existing.expiresAfterOwnTurn ?? expiresAfterOwnTurn, expiresAfterOwnTurn);
    if (sourceCardId) existing.sourceCardId = sourceCardId;
    return;
  }

  minion.statuses.push({
    keyword,
    activeFromOwnTurn: nextOwnTurn,
    expiresAfterOwnTurn,
    ...(sourceCardId ? { sourceCardId } : {}),
  });
}

export function isControlStatusActive(
  session: BasicGameSession,
  minion: MinionInstance,
  keyword: "sleep" | "freeze" | "petrify",
): boolean {
  const ownTurn = session.turnsStarted[minion.controller];
  return minion.statuses.some((status) => {
    if (status.keyword !== keyword) return false;
    if (status.activeFromOwnTurn !== undefined && status.expiresAfterOwnTurn !== undefined) {
      return ownTurn >= status.activeFromOwnTurn && ownTurn <= status.expiresAfterOwnTurn;
    }
    return (status.remainingOwnTurns ?? 0) > 0;
  });
}

export function endTurn(
  session: BasicGameSession,
  random: () => number = Math.random,
): string | null {
  ensureSessionExtensions(session);
  if (session.state.winner) return "对局已经结束。";
  if (session.handoffRequired) return "请先完成回合交接。";
  if (currentPendingEffect(session)) return "请先结算当前待处理的亡语效果。";

  const previous = session.state.activePlayer;
  const next = otherPlayer(previous);
  session.state.turn += 1;
  beginTurn(session, next, random);
  session.handoffRequired = true;
  log(session, `${playerName(previous)}结束回合，轮到${playerName(next)}。`);
  touch(session);
  return null;
}

export function canMinionAttack(
  session: BasicGameSession,
  minion: MinionInstance,
  catalog?: BasicGameCatalog,
): boolean {
  return validateAttacker(session, catalog ?? null, { minion, slotIndex: -1 }) === null;
}

function beginTurn(session: BasicGameSession, playerId: PlayerId, random: () => number): void {
  ensureSessionExtensions(session);
  session.state.activePlayer = playerId;
  const player = session.state.players[playerId];
  const startedBefore = session.turnsStarted[playerId];
  session.turnsStarted[playerId] += 1;
  pruneExpiredControlStatuses(session, playerId);

  player.normalSummonsUsedThisTurn = 0;
  for (const minion of player.board) {
    if (minion) minion.attacksUsedThisTurn = 0;
  }
  for (const minion of player.overflowMinions) minion.attacksUsedThisTurn = 0;

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
  catalog: BasicGameCatalog | null,
  found: { minion: MinionInstance; slotIndex: number },
): string | null {
  const minion = found.minion;
  if (minion.controller !== session.state.activePlayer) return "只能使用当前回合一方的随从攻击。";
  if (isControlStatusActive(session, minion, "petrify")) return "该随从本回合处于石化状态，不能行动且技能无效。";
  if (isControlStatusActive(session, minion, "freeze")) return "该随从本回合处于冰冻状态，不能行动。";
  if (isControlStatusActive(session, minion, "sleep")) return "该随从本回合处于沉睡状态，不能行动。";

  const hasHaste = catalog ? minionHasKeyword(session, catalog, minion, "haste") : hasStoredKeyword(minion, "haste");
  if (minion.summonedOnTurn === session.state.turn && !hasHaste) {
    return "普通随从上场当回合不能攻击。";
  }
  const hasFastAttack = catalog ? minionHasKeyword(session, catalog, minion, "fast_attack") : hasStoredKeyword(minion, "fast_attack");
  const maxAttacks = hasFastAttack ? 2 : RULES_CORE_V1.normalMinionAttacksPerTurn;
  if (minion.attacksUsedThisTurn >= maxAttacks) return "该随从本回合已经用完攻击次数。";
  return null;
}

function validateAttackTarget(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attacker: MinionInstance,
  target: MinionInstance,
): string | null {
  if (minionHasKeyword(session, catalog, attacker, "arrogance")) return null;
  if (!enemyHasTaunt(session, catalog, session.state.activePlayer)) return null;
  if (minionHasKeyword(session, catalog, target, "taunt")) return null;
  return "对方场上存在嘲讽随从，必须优先攻击嘲讽目标。";
}

function enemyHasTaunt(session: BasicGameSession, catalog: BasicGameCatalog, attackerPlayer: PlayerId): boolean {
  const enemy = session.state.players[otherPlayer(attackerPlayer)];
  return enemy.board.some((minion) => minion !== null && minionHasKeyword(session, catalog, minion, "taunt"));
}

function getAttack(minion: MinionInstance, catalog: BasicGameCatalog): number {
  const card = catalog.cards.get(minion.cardId);
  const base = card?.attack ?? 0;
  return Math.max(RULES_CORE_V1.attackFloor, base + minion.attackModifier);
}

function applyDamageToMinion(
  session: BasicGameSession,
  minion: MinionInstance,
  incomingDamage: number,
  catalog: BasicGameCatalog,
): number {
  if (incomingDamage <= 0) return 0;

  if (!isControlStatusActive(session, minion, "petrify")) {
    const guard = minion.statuses.find((status) => status.keyword === "guard" && (status.charges ?? 0) > 0);
    if (guard) {
      guard.charges = Math.max(0, (guard.charges ?? 0) - 1);
      return 0;
    }
  }

  let reduction = 0;
  if (minionHasKeyword(session, catalog, minion, "armor_1")) reduction += 1;
  if (minionHasKeyword(session, catalog, minion, "armor_2")) reduction += 2;
  const damage = Math.max(0, incomingDamage - reduction);
  minion.currentHealth -= damage;
  return damage;
}

function applyLifesteal(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  attacker: MinionInstance,
  actualDamage: number,
): void {
  if (actualDamage <= 0) return;
  if (!minionHasKeyword(session, catalog, attacker, "lifesteal")) return;
  const player = session.state.players[attacker.controller];
  player.health += actualDamage;
  log(session, `「${cardName(attacker.cardId, catalog)}」吸血，为${playerName(player.id)}回复 ${actualDamage} 点生命。`);
}

function initialKeywordStatuses(card: MinionCardDefinition): StatusState[] {
  const keywords = new Set(
    card.effects
      .filter((effect) => effect.implementation === "keyword" && effect.keyword && PASSIVE_KEYWORDS.has(effect.keyword))
      .map((effect) => effect.keyword!),
  );
  return [...keywords].map((keyword) => keyword === "guard"
    ? { keyword, charges: 1, sourceCardId: card.id }
    : { keyword, sourceCardId: card.id });
}

function hasStoredKeyword(minion: MinionInstance, keyword: Keyword): boolean {
  return minion.statuses.some((status) => status.keyword === keyword && (keyword !== "guard" || (status.charges ?? 0) > 0));
}

function minionHasKeyword(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  minion: MinionInstance,
  keyword: Keyword,
): boolean {
  if (keyword !== "petrify" && isControlStatusActive(session, minion, "petrify")) return false;
  if (hasStoredKeyword(minion, keyword)) return true;
  return cardHasKeyword(catalog.cards.get(minion.cardId), keyword);
}

function cardHasKeyword(card: MinionCardDefinition | undefined, keyword: Keyword): boolean {
  return card?.effects.some((effect) => effect.implementation === "keyword" && effect.keyword === keyword) ?? false;
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
  const petrifiedAtDeath = isControlStatusActive(session, minion, "petrify");

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
  log(session, `「${cardName(minion.cardId, catalog)}」因${deathCauseLabel(cause)}死亡并进入${playerName(playerId)}弃牌堆。`);

  if (petrifiedAtDeath) {
    log(session, `「${cardName(minion.cardId, catalog)}」死亡时处于石化状态，技能无效，亡语不触发。`);
    return;
  }
  resolveDeathrattles(session, minion, playerId, slotIndex, catalog);
}

function resolveDeathrattles(
  session: BasicGameSession,
  minion: MinionInstance,
  controllerAtDeath: PlayerId,
  vacatedSlot: number,
  catalog: BasicGameCatalog,
): void {
  const card = catalog.cards.get(minion.cardId);
  if (!card) return;
  const deathrattles = card.effects.filter((effect) => effect.keyword === "deathrattle" || effect.name?.startsWith("亡语"));

  for (const effect of deathrattles) {
    const text = effect.text.replace(/[。.]$/, "").trim();
    const transform = text.match(/死后变为(.+)$/);
    if (transform) {
      const tokenName = transform[1]!.trim();
      const token = [...catalog.cards.values()].find((candidate) => candidate.name === tokenName);
      if (!token || token.health === null || token.attack === null) {
        log(session, `「${card.name}」亡语需要产生「${tokenName}」，但该衍生随从数据尚不完整。`);
        continue;
      }
      spawnEffectMinion(session, controllerAtDeath, vacatedSlot, token);
      log(session, `「${card.name}」亡语触发，产生「${token.name}」。`);
      continue;
    }

    if (/死后.*冻住对方一只随从.*两(?:个)?回合/.test(text)) {
      queueControlDeathrattle(session, card, controllerAtDeath, "freeze", 1, 2);
      continue;
    }

    if (/死后.*石化对方两位随从.*(?:持续)?两(?:个)?回合/.test(text)) {
      queueControlDeathrattle(session, card, controllerAtDeath, "petrify", 2, 2);
      continue;
    }

    log(session, `「${card.name}」亡语已识别，但“${text}”仍需要目标或范围规则，当前不擅自结算。`);
  }
}

function queueControlDeathrattle(
  session: BasicGameSession,
  sourceCard: MinionCardDefinition,
  sourcePlayer: PlayerId,
  kind: PendingControlEffectKind,
  targetCount: number,
  durationOwnTurns: number,
): void {
  ensureSessionExtensions(session);
  const targetPlayer = otherPlayer(sourcePlayer);
  const available = session.state.players[targetPlayer].board.filter(Boolean).length;
  const remainingTargets = Math.min(targetCount, available);
  const label = kind === "freeze" ? "冰冻" : "石化";
  if (remainingTargets <= 0) {
    log(session, `「${sourceCard.name}」亡语触发，但对方场上没有可${label}的随从。`);
    return;
  }

  session.pendingEffects!.push({
    id: createId(),
    sourcePlayer,
    sourceCardId: sourceCard.id,
    sourceName: sourceCard.name,
    kind,
    targetPlayer,
    remainingTargets,
    durationOwnTurns,
    selectedTargetIds: [],
  });
  log(session, `「${sourceCard.name}」亡语等待选择 ${remainingTargets} 个目标进行${label}。`);
}

function spawnEffectMinion(
  session: BasicGameSession,
  playerId: PlayerId,
  preferredSlot: number,
  card: MinionCardDefinition,
): void {
  const player = session.state.players[playerId];
  const instance = createMinionInstance(card, playerId, session.state.turn);
  if (preferredSlot >= 0 && preferredSlot < player.board.length && player.board[preferredSlot] === null) {
    player.board[preferredSlot] = instance;
    return;
  }
  const emptyIndex = player.board.findIndex((entry) => entry === null);
  if (emptyIndex >= 0) {
    player.board[emptyIndex] = instance;
    return;
  }
  player.overflowMinions.push(instance);
}

function createMinionInstance(card: MinionCardDefinition, owner: PlayerId, turn: number): MinionInstance {
  return {
    instanceId: createId(),
    cardId: card.id,
    owner,
    controller: owner,
    currentHealth: card.health ?? 0,
    attackModifier: 0,
    attacksUsedThisTurn: 0,
    summonedOnTurn: turn,
    statuses: initialKeywordStatuses(card),
  };
}

function countRemainingEffectTargets(session: BasicGameSession, effect: PendingMinionTargetEffect): number {
  return session.state.players[effect.targetPlayer].board.filter((minion) => minion && !effect.selectedTargetIds.includes(minion.instanceId)).length;
}

function trimPendingEffects(session: BasicGameSession): void {
  ensureSessionExtensions(session);
  while (session.pendingEffects!.length > 0) {
    const effect = session.pendingEffects![0]!;
    if (effect.remainingTargets > 0 && countRemainingEffectTargets(session, effect) > 0) break;
    session.pendingEffects!.shift();
  }
}

function pruneExpiredControlStatuses(session: BasicGameSession, playerId: PlayerId): void {
  const ownTurn = session.turnsStarted[playerId];
  const player = session.state.players[playerId];
  const prune = (minion: MinionInstance): void => {
    minion.statuses = minion.statuses.filter((status) => {
      if (!CONTROL_KEYWORDS.has(status.keyword as Keyword)) return true;
      if (status.expiresAfterOwnTurn === undefined) return (status.remainingOwnTurns ?? 0) > 0;
      return status.expiresAfterOwnTurn >= ownTurn;
    });
  };
  for (const minion of player.board) if (minion) prune(minion);
  for (const minion of player.overflowMinions) prune(minion);
}

function resolveWinner(session: BasicGameSession): void {
  const previousWinner = session.state.winner;
  const p1Dead = session.state.players.P1.health <= 0;
  const p2Dead = session.state.players.P2.health <= 0;
  if (p1Dead && p2Dead) session.state.winner = "draw";
  else if (p1Dead) session.state.winner = "P2";
  else if (p2Dead) session.state.winner = "P1";
  if (!previousWinner && session.state.winner) {
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

function ensureSessionExtensions(session: BasicGameSession): void {
  if (!session.pendingEffects) session.pendingEffects = [];
}

function parseSmallCount(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "二" || value === "两") return 2;
  return 1;
}

function deathCauseLabel(cause: "damage" | "sacrifice" | "execution" | "other"): string {
  if (cause === "sacrifice") return "献祭";
  if (cause === "execution") return "必杀";
  if (cause === "damage") return "伤害";
  return "效果";
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
