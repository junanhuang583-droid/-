import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { currentPendingEffect, isControlStatusActive, type BasicGameSession } from "../core/basic-game.js";
import {
  otherPlayer,
  scopeAllowsTarget,
  targetedEffectPassesTaunt,
  type UnitTargetScope,
} from "../core/unit-targeting.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { MinionInstance, PlayerId } from "../model/state.js";
import { loadSavedSession, saveSession } from "./persistence.js";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const AUX_KEY = "cardgame.unit-effects.v1";
const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const byId = new Map(cards.map((card) => [card.id, card]));
let scheduled = false;
let syncing = false;

interface PendingUnitEffect {
  id: string;
  sourcePlayer: PlayerId;
  sourceCardId: CardId;
  sourceName: string;
  action: "damage" | "health_loss" | "heal" | "attack_buff";
  amount: number;
  scope: UnitTargetScope;
  remainingTargets: number;
  selectedKeys: string[];
  text: string;
}

interface UnitEffectsState {
  gameId: string;
  processedDeathIds: string[];
  queue: PendingUnitEffect[];
}

interface TargetView {
  key: string;
  playerId: PlayerId;
  kind: "hero" | "minion";
  label: string;
  detail: string;
  instanceId?: string;
  isTaunt?: boolean;
}

installStyles();
new MutationObserver(scheduleSync).observe(document.querySelector("#app") ?? document.body, { childList: true, subtree: true });
window.addEventListener("storage", scheduleSync);
scheduleSync();

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void syncUnitEffects();
  });
}

async function syncUnitEffects(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const session = loadSavedSession();
    if (!session) return;
    const aux = loadAux(session);
    const sessionChanged = processNewDeaths(session, aux);
    saveAux(aux);
    if (sessionChanged) saveAndSync(session);

    updateModeNote();

    if (currentPendingEffect(session)) {
      removeOurOverlay();
      return;
    }

    const effect = aux.queue[0];
    if (!effect) {
      removeOurOverlay();
      return;
    }
    renderEffectPicker(session, aux, effect);
  } finally {
    syncing = false;
  }
}

function loadAux(session: BasicGameSession): UnitEffectsState {
  try {
    const raw = localStorage.getItem(AUX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UnitEffectsState;
      if (parsed.gameId === session.gameId && Array.isArray(parsed.processedDeathIds) && Array.isArray(parsed.queue)) {
        return parsed;
      }
    }
  } catch {
    // Rebuild below.
  }

  // Existing matches are a baseline. This prevents a newly deployed script from
  // replaying old deathrattles from a match that was already in progress.
  const fresh: UnitEffectsState = {
    gameId: session.gameId,
    processedDeathIds: session.state.deathLog.map((entry) => entry.instanceId),
    queue: [],
  };
  saveAux(fresh);
  return fresh;
}

function saveAux(aux: UnitEffectsState): void {
  localStorage.setItem(AUX_KEY, JSON.stringify(aux));
}

function processNewDeaths(session: BasicGameSession, aux: UnitEffectsState): boolean {
  let sessionChanged = false;
  const processed = new Set(aux.processedDeathIds);

  for (const death of session.state.deathLog) {
    if (processed.has(death.instanceId)) continue;
    processed.add(death.instanceId);
    aux.processedDeathIds.push(death.instanceId);

    const card = byId.get(death.cardId);
    if (!card) continue;
    if (deathrattleWasSuppressedByPetrify(session, card.name, death.turn)) continue;

    for (const effect of card.effects) {
      if (!(effect.name?.startsWith("亡语") || /^死后/.test(effect.text.trim()))) continue;
      const text = normalize(effect.text);
      if (handledBySecondWaveCore(text)) continue;

      const parsed = parseTargetedDeathEffect(card, death.owner, text);
      if (parsed) {
        aux.queue.push(parsed);
        continue;
      }

      // This one has no target choice and cannot create simultaneous deaths.
      const friendlyHeal = text.match(/^死后给己方所有单位加(\d+)血$/);
      if (friendlyHeal) {
        const amount = Number(friendlyHeal[1]);
        healPlayerUnits(session, death.owner, amount);
        appendLog(session, `「${card.name}」亡语触发，${playerLabel(death.owner)}所有单位回复 ${amount} 点生命。`);
        sessionChanged = true;
      }
    }
  }

  // Keep the helper state bounded during long recycle matches.
  if (aux.processedDeathIds.length > 600) aux.processedDeathIds.splice(0, aux.processedDeathIds.length - 600);
  return sessionChanged;
}

function parseTargetedDeathEffect(
  card: MinionCardDefinition,
  sourcePlayer: PlayerId,
  text: string,
): PendingUnitEffect | null {
  let match = text.match(/^死后对选中(单位|随从)造成(\d+)点伤害$/);
  if (match) return makePending(card, sourcePlayer, "damage", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后对(?:两个|两(?:个)?|2个)(单位|随从)各造成(\d+)点伤害$/);
  if (match) return makePending(card, sourcePlayer, "damage", Number(match[2]), scopeFromNoun(match[1]!), 2, text);

  match = text.match(/^死后选择一个(单位|随从)[，,]?扣(\d+)(?:点)?血$/);
  if (match) return makePending(card, sourcePlayer, "health_loss", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后选取(?:两个|两(?:个)?|2个)(单位|随从)[，,]?各扣(\d+)点血$/);
  if (match) return makePending(card, sourcePlayer, "health_loss", Number(match[2]), scopeFromNoun(match[1]!), 2, text);

  match = text.match(/^死后选定一个(单位|随从)加(\d+)血$/);
  if (match) return makePending(card, sourcePlayer, "heal", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后给指定随从加(\d+)攻击$/);
  if (match) return makePending(card, sourcePlayer, "attack_buff", Number(match[1]), "all_minions", 1, text);

  return null;
}

function makePending(
  card: MinionCardDefinition,
  sourcePlayer: PlayerId,
  action: PendingUnitEffect["action"],
  amount: number,
  scope: UnitTargetScope,
  remainingTargets: number,
  text: string,
): PendingUnitEffect {
  return {
    id: makeId(),
    sourcePlayer,
    sourceCardId: card.id,
    sourceName: card.name,
    action,
    amount,
    scope,
    remainingTargets,
    selectedKeys: [],
    text,
  };
}

function scopeFromNoun(noun: string): UnitTargetScope {
  return noun === "随从" ? "all_minions" : "all_units";
}

function handledBySecondWaveCore(text: string): boolean {
  return /^死后变为/.test(text)
    || /冻住对方一只随从.*两(?:个)?回合/.test(text)
    || /石化对方两位随从.*两(?:个)?回合/.test(text);
}

function deathrattleWasSuppressedByPetrify(session: BasicGameSession, cardName: string, turn: number): boolean {
  const deathNeedle = `「${cardName}」因`;
  const suppressNeedle = `「${cardName}」死亡时处于石化状态`;
  let deathIndex = -1;
  let suppressIndex = -1;
  session.log.forEach((entry, index) => {
    if (entry.turn !== turn) return;
    if (entry.text.includes(deathNeedle)) deathIndex = index;
    if (entry.text.includes(suppressNeedle)) suppressIndex = index;
  });
  return suppressIndex > deathIndex && deathIndex >= 0;
}

function renderEffectPicker(session: BasicGameSession, aux: UnitEffectsState, effect: PendingUnitEffect): void {
  const existing = document.querySelector<HTMLElement>("#unit-effect-overlay");
  if (existing?.dataset.effectId === effect.id) return;
  removeOurOverlay();

  const targets = legalTargets(session, effect);
  if (targets.length === 0) {
    aux.queue.shift();
    appendLog(session, `「${effect.sourceName}」亡语触发，但没有合法目标。`);
    resolveWinner(session);
    saveAux(aux);
    saveAndSync(session);
    removeOurOverlay();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "unit-effect-overlay";
  overlay.dataset.effectId = effect.id;
  overlay.className = "unit-effect-overlay";
  overlay.innerHTML = `
    <section class="unit-effect-card">
      <div class="unit-effect-eyebrow">亡语结算 · 单位目标</div>
      <h2>「${escapeHtml(effect.sourceName)}」</h2>
      <p>${escapeHtml(effect.text)}。还需选择 ${effect.remainingTargets} 个不同目标。敌方存在嘲讽时，选择敌方单位仍必须先选嘲讽随从；己方单位不受该限制。</p>
      <div class="unit-target-groups">
        ${targetGroup(effect.sourcePlayer, targets, true)}
        ${targetGroup(effect.sourcePlayer, targets, false)}
      </div>
      <div class="unit-effect-footer">
        <span>${actionLabel(effect)} · 数值 ${effect.amount}</span>
        <small>“单位”包含双方英雄与双方随从</small>
      </div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-unit-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.unitTarget;
      if (!key) return;
      resolveTargetChoice(key);
    });
  });
}

function targetGroup(sourcePlayer: PlayerId, targets: TargetView[], friendly: boolean): string {
  const playerId = friendly ? sourcePlayer : otherPlayer(sourcePlayer);
  const group = targets.filter((target) => target.playerId === playerId);
  if (group.length === 0) return "";
  return `
    <div class="unit-target-group">
      <strong>${friendly ? "我方" : "敌方"}</strong>
      <div class="unit-target-grid">
        ${group.map(targetButton).join("")}
      </div>
    </div>
  `;
}

function targetButton(target: TargetView): string {
  return `
    <button type="button" class="unit-target-option ${target.kind === "hero" ? "hero-option" : ""} ${target.isTaunt ? "taunt-option" : ""}" data-unit-target="${escapeHtml(target.key)}">
      <small>${target.kind === "hero" ? "英雄" : target.isTaunt ? "随从 · 嘲讽" : "随从"}</small>
      <strong>${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(target.detail)}</span>
    </button>
  `;
}

function legalTargets(session: BasicGameSession, effect: PendingUnitEffect): TargetView[] {
  const result: TargetView[] = [];
  const enemy = otherPlayer(effect.sourcePlayer);
  const enemyTaunt = playerHasActiveTaunt(session, enemy);

  for (const playerId of ["P1", "P2"] as const) {
    const hero: TargetView = {
      key: `hero:${playerId}`,
      playerId,
      kind: "hero",
      label: playerLabel(playerId),
      detail: `♥ ${session.state.players[playerId].health}`,
    };
    if (targetAllowed(effect, hero, enemyTaunt)) result.push(hero);

    session.state.players[playerId].board.forEach((minion, index) => {
      if (!minion) return;
      const card = byId.get(minion.cardId);
      const target: TargetView = {
        key: `minion:${minion.instanceId}`,
        playerId,
        kind: "minion",
        instanceId: minion.instanceId,
        label: card?.name ?? minion.cardId,
        detail: `${index + 1}号位 · ⚔ ${Math.max(0, (card?.attack ?? 0) + minion.attackModifier)} · ♥ ${minion.currentHealth}`,
        isTaunt: hasActiveKeyword(session, minion, "taunt"),
      };
      if (targetAllowed(effect, target, enemyTaunt)) result.push(target);
    });
  }
  return result;
}

function targetAllowed(effect: PendingUnitEffect, target: TargetView, enemyHasTaunt: boolean): boolean {
  if (effect.selectedKeys.includes(target.key)) return false;
  if (!scopeAllowsTarget(effect.sourcePlayer, effect.scope, target)) return false;
  return targetedEffectPassesTaunt(effect.sourcePlayer, target, enemyHasTaunt);
}

function resolveTargetChoice(key: string): void {
  const session = loadSavedSession();
  if (!session) return;
  const aux = loadAux(session);
  const effect = aux.queue[0];
  if (!effect) return;

  const target = legalTargets(session, effect).find((candidate) => candidate.key === key);
  if (!target) {
    showOverlayError("这个目标现在不合法，可能是嘲讽或场上状态刚刚发生了变化。");
    return;
  }

  const result = applyEffectToTarget(session, effect, target);
  appendLog(session, result);
  effect.selectedKeys.push(key);
  effect.remainingTargets -= 1;

  const remainingLegal = legalTargets(session, effect).length;
  if (effect.remainingTargets <= 0 || remainingLegal <= 0) {
    aux.queue.shift();
    resolveWinner(session);
  }

  saveAux(aux);
  removeOurOverlay();
  saveAndSync(session);
  scheduleSync();
}

function saveAndSync(session: BasicGameSession): void {
  saveSession(session);
  const value = localStorage.getItem(SAVE_KEY);
  try {
    window.dispatchEvent(new StorageEvent("storage", {
      key: SAVE_KEY,
      newValue: value,
      storageArea: localStorage,
      url: window.location.href,
    }));
  } catch {
    // The saved state is still valid if an older engine cannot construct StorageEvent.
  }
}

function applyEffectToTarget(session: BasicGameSession, effect: PendingUnitEffect, target: TargetView): string {
  if (target.kind === "hero") {
    const hero = session.state.players[target.playerId];
    if (effect.action === "heal") {
      hero.health += effect.amount;
      return `「${effect.sourceName}」亡语使${playerLabel(target.playerId)}回复 ${effect.amount} 点生命。`;
    }
    hero.health -= effect.amount;
    const word = effect.action === "damage" ? "受到" : "失去";
    return `「${effect.sourceName}」亡语使${playerLabel(target.playerId)}${word} ${effect.amount} 点${effect.action === "damage" ? "伤害" : "生命"}。`;
  }

  const found = findMinion(session, target.playerId, target.instanceId!);
  if (!found) return `「${effect.sourceName}」亡语目标已经离场。`;
  const cardName = byId.get(found.minion.cardId)?.name ?? found.minion.cardId;

  if (effect.action === "heal") {
    found.minion.currentHealth += effect.amount;
    return `「${effect.sourceName}」亡语为「${cardName}」回复 ${effect.amount} 点生命。`;
  }
  if (effect.action === "attack_buff") {
    found.minion.attackModifier += effect.amount;
    return `「${effect.sourceName}」亡语使「${cardName}」攻击 +${effect.amount}。`;
  }

  const actual = effect.action === "damage"
    ? applyDamage(session, found.minion, effect.amount)
    : applyHealthLoss(found.minion, effect.amount);
  const label = effect.action === "damage" ? `受到 ${actual} 点实际伤害` : `失去 ${actual} 点生命`;
  if (found.minion.currentHealth <= 0) killMinion(session, target.playerId, found.slotIndex, effect.sourceName);
  return `「${effect.sourceName}」亡语使「${cardName}」${label}。`;
}

function applyDamage(session: BasicGameSession, minion: MinionInstance, amount: number): number {
  if (amount <= 0) return 0;
  const petrified = isControlStatusActive(session, minion, "petrify");
  if (!petrified) {
    const guard = minion.statuses.find((status) => status.keyword === "guard" && (status.charges ?? 0) > 0);
    if (guard) {
      guard.charges = Math.max(0, (guard.charges ?? 0) - 1);
      return 0;
    }
  }

  let reduction = 0;
  if (!petrified && hasActiveKeyword(session, minion, "armor_1")) reduction += 1;
  if (!petrified && hasActiveKeyword(session, minion, "armor_2")) reduction += 2;
  const actual = Math.max(0, amount - reduction);
  minion.currentHealth -= actual;
  return actual;
}

function applyHealthLoss(minion: MinionInstance, amount: number): number {
  const before = Math.max(0, minion.currentHealth);
  minion.currentHealth -= amount;
  return Math.min(before, amount);
}

function killMinion(session: BasicGameSession, playerId: PlayerId, slotIndex: number, sourceName: string): void {
  const player = session.state.players[playerId];
  const minion = player.board[slotIndex];
  if (!minion) return;
  const petrified = isControlStatusActive(session, minion, "petrify");
  player.board[slotIndex] = null;
  player.discardPile.push(minion.cardId);
  session.state.deathLog.push({
    turn: session.state.turn,
    owner: minion.owner,
    cardId: minion.cardId,
    instanceId: minion.instanceId,
    cause: "other",
    canRevive: true,
  });
  const name = byId.get(minion.cardId)?.name ?? minion.cardId;
  appendLog(session, `「${name}」因「${sourceName}」效果死亡并进入${playerLabel(playerId)}弃牌堆。`);
  if (petrified) appendLog(session, `「${name}」死亡时处于石化状态，技能无效，亡语不触发。`);
}

function healPlayerUnits(session: BasicGameSession, playerId: PlayerId, amount: number): void {
  session.state.players[playerId].health += amount;
  for (const minion of session.state.players[playerId].board) {
    if (minion) minion.currentHealth += amount;
  }
  for (const minion of session.state.players[playerId].overflowMinions) minion.currentHealth += amount;
}

function findMinion(
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

function playerHasActiveTaunt(session: BasicGameSession, playerId: PlayerId): boolean {
  return session.state.players[playerId].board.some((minion) => minion && hasActiveKeyword(session, minion, "taunt"));
}

function hasActiveKeyword(session: BasicGameSession, minion: MinionInstance, keyword: "taunt" | "armor_1" | "armor_2"): boolean {
  if (isControlStatusActive(session, minion, "petrify")) return false;
  if (minion.statuses.some((status) => status.keyword === keyword && (keyword !== "taunt" || (status.charges ?? 1) > 0))) return true;
  return byId.get(minion.cardId)?.effects.some((effect) => effect.keyword === keyword) ?? false;
}

function resolveWinner(session: BasicGameSession): void {
  const p1Dead = session.state.players.P1.health <= 0;
  const p2Dead = session.state.players.P2.health <= 0;
  if (p1Dead && p2Dead) session.state.winner = "draw";
  else if (p1Dead) session.state.winner = "P2";
  else if (p2Dead) session.state.winner = "P1";
}

function actionLabel(effect: PendingUnitEffect): string {
  if (effect.action === "damage") return "伤害";
  if (effect.action === "health_loss") return "扣血";
  if (effect.action === "heal") return "加血";
  return "加攻击";
}

function updateModeNote(): void {
  const note = document.querySelector<HTMLElement>(".mode-note");
  if (!note || note.dataset.unitTargetWave === "true") return;
  note.dataset.unitTargetWave = "true";
  note.textContent = "已确认单位目标规则：‘单位’包含双方英雄与双方随从；未写敌我时双方均可选。‘敌方/我方单位’包含对应英雄与随从，‘敌方/我方随从’只含对应随从。需要手动选目标的效果遵守嘲讽。已补钢刺栗子等明确目标亡语；仍有目标时点或批量死亡顺序未确认/未接入的复杂技能。";
}

function appendLog(session: BasicGameSession, text: string): void {
  session.log.push({ at: new Date().toISOString(), turn: session.state.turn, text });
  if (session.log.length > 300) session.log.splice(0, session.log.length - 300);
}

function showOverlayError(message: string): void {
  const card = document.querySelector<HTMLElement>("#unit-effect-overlay .unit-effect-card");
  if (!card) return;
  let error = card.querySelector<HTMLElement>(".unit-effect-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "unit-effect-error";
    card.prepend(error);
  }
  error.textContent = message;
}

function removeOurOverlay(): void {
  document.querySelector("#unit-effect-overlay")?.remove();
}

function normalize(value: string): string {
  return value.replace(/[。.]$/, "").replace(/\s+/g, "").trim();
}

function playerLabel(playerId: PlayerId): string {
  return playerId === "P1" ? "玩家1" : "玩家2";
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

function installStyles(): void {
  if (document.querySelector("#unit-effects-style")) return;
  const style = document.createElement("style");
  style.id = "unit-effects-style";
  style.textContent = `
    .unit-effect-overlay{position:fixed;inset:0;z-index:145;display:grid;place-items:center;padding:max(12px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(7,6,5,.8);backdrop-filter:blur(9px)}
    .unit-effect-card{width:min(800px,94vw);max-height:90dvh;overflow:auto;border:1px solid rgba(203,156,85,.78);border-radius:18px;padding:17px;background:linear-gradient(180deg,rgba(43,34,26,.99),rgba(20,17,14,.99));box-shadow:0 25px 80px rgba(0,0,0,.62);color:#eee0cd}
    .unit-effect-card h2{margin:4px 0 5px;font-size:clamp(18px,3vw,28px)}
    .unit-effect-card p{margin:0 0 12px;color:#cdbda8;font-size:11px;line-height:1.5}
    .unit-effect-eyebrow{color:#e0b16c;font-size:9px;font-weight:900;letter-spacing:.12em}
    .unit-target-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}.unit-target-group>strong{display:block;margin:0 0 5px;font-size:11px;color:#d9c7af}
    .unit-target-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .unit-target-option{min-height:74px;border:1px solid rgba(125,99,68,.8);border-radius:11px;padding:7px;background:rgba(31,26,21,.94);color:#eddfcc;display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left}
    .unit-target-option:active{transform:translateY(1px)}.unit-target-option.hero-option{border-color:rgba(166,112,72,.9);background:rgba(48,30,24,.95)}.unit-target-option.taunt-option{box-shadow:inset 0 0 0 1px rgba(210,174,93,.45)}
    .unit-target-option small{font-size:8px;color:#9e8b77}.unit-target-option strong{font-size:11px}.unit-target-option span{font-size:9px;color:#c9b99f}
    .unit-effect-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:11px;padding-top:9px;border-top:1px solid rgba(143,112,75,.35);font-size:10px;color:#d8c6ab}.unit-effect-footer small{color:#998774}
    .unit-effect-error{margin-bottom:8px;padding:7px 9px;border:1px solid rgba(194,88,75,.65);border-radius:8px;background:rgba(97,34,27,.38);color:#ffd7cf;font-size:10px}
    @media (orientation:landscape) and (max-height:460px){.unit-effect-card{padding:10px 12px;border-radius:12px}.unit-effect-card h2{font-size:17px}.unit-effect-card p{font-size:9px;margin-bottom:7px}.unit-target-option{min-height:55px;padding:5px}.unit-target-grid{gap:4px}.unit-effect-footer{margin-top:6px;padding-top:6px}}
    @media (max-width:650px){.unit-target-groups{grid-template-columns:1fr}.unit-target-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;
  document.head.append(style);
}
