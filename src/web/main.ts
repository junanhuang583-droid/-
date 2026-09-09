import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import {
  attackHero,
  attackMinion,
  canMinionAttack,
  createBasicGame,
  createCatalog,
  endTurn,
  revealCurrentTurn,
  summonFromHand,
  type BasicGameSession,
} from "../core/basic-game.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { MinionInstance, PlayerId } from "../model/state.js";
import { installPersistenceGuards, loadSavedSession, saveSession } from "./persistence.js";
import "./styles.css";

const parsedCards = parseMinionCardsFromRecord(cardRecord);
const cards: MinionCardDefinition[] = parsedCards.map((card) => card);
const catalog = createCatalog(cards);
const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("缺少 #app 根节点");
const root: HTMLDivElement = appRoot;

const restoredSession = loadSavedSession();
let session: BasicGameSession = restoredSession ?? createBasicGame(cards);
let selectedHandIndex: number | null = null;
let selectedAttackerId: string | null = null;
let pendingTurnDrawCount = 0;
let hiddenDrawCount = 0;
let openingDealActive = restoredSession === null;
let animationRunning = false;
let notice = restoredSession
  ? "已恢复上次对局。新对局将启用扩展演示牌池。"
  : "新对局准备中：洗牌并发初始手牌。";

saveSession(session);
installPersistenceGuards(() => session);

window.addEventListener("storage", (event) => {
  if (!event.key?.startsWith("lushizhizao.basic-game.v1")) return;
  const latest = loadSavedSession();
  if (!latest || latest.updatedAt <= session.updatedAt) return;
  session = latest;
  selectedHandIndex = null;
  selectedAttackerId = null;
  pendingTurnDrawCount = 0;
  hiddenDrawCount = 0;
  openingDealActive = false;
  animationRunning = false;
  notice = "另一个标签页有更新，已同步。";
  render();
});

render();
if (openingDealActive) void playOpeningDeal();

function render(): void {
  const state = session.state;
  const active = state.activePlayer;
  const opponent = otherPlayer(active);
  const activeState = state.players[active];
  const interactionLocked = openingDealActive || animationRunning;

  root.innerHTML = `
    <main class="game-shell ${openingDealActive ? "opening-deal" : ""} ${hiddenDrawCount > 0 ? "draw-animating" : ""}">
      <header class="game-topbar">
        <div class="brand-block">
          <strong>Card Game</strong>
          <span>基础验收版</span>
        </div>
        <div class="top-stats">
          <span>第 ${state.turn} 回合</span>
          <span>${catalog.playableUniqueCards} 种演示随从</span>
          <span class="save-pill">● 自动保存</span>
        </div>
      </header>

      <section class="status-toast ${notice ? "show" : ""}">${escapeHtml(notice)}</section>

      <section class="battle-shell">
        ${heroPanel(opponent, false)}
        ${boardZone(opponent, false)}

        <section class="scene-lane">
          <div class="scene-placeholder">
            <span>场景区</span>
            <small>${selectedAttackerId ? `已选择攻击者，点击敌方随从或${playerLabel(opponent)}英雄` : "战场中央 / 场景牌以后显示在这里"}</small>
          </div>
        </section>

        ${heroPanel(active, true)}
        ${boardZone(active, true)}

        <aside class="battle-rail">
          <div class="rail-group">
            <span class="rail-label">共享牌库</span>
            <div id="deck-source" class="deck-stack" aria-label="共享牌库">
              <span class="deck-card deck-card-back"></span>
              <span class="deck-card deck-card-mid"></span>
              <span class="deck-card deck-card-front">CG</span>
            </div>
            <strong>${state.sharedDeck.length} 张</strong>
            <small>${catalog.playableUniqueCards} 种可运行随从</small>
            <small>P1 弃牌 ${state.players.P1.discardPile.length} · P2 弃牌 ${state.players.P2.discardPile.length}</small>
          </div>
          <div class="rail-actions">
            <button id="end-turn" class="primary-button turn-button" ${state.winner || interactionLocked ? "disabled" : ""}>结束回合</button>
            <button class="secondary-button" data-new-game="confirm" ${interactionLocked ? "disabled" : ""}>新对局</button>
          </div>
        </aside>
      </section>

      <section class="hand-dock">
        <div class="hand-heading">
          <strong>${playerLabel(active)}手牌</strong>
          <span>${activeState.hand.length} 张</span>
          <small>点手牌 → 点己方空位召唤　｜　点己方随从 → 点敌方目标攻击</small>
        </div>
        <div class="hand-row" id="active-hand-target">
          ${activeState.hand.map((cardId, index) => handCard(cardId, index, activeState.hand.length)).join("") || `<div class="empty-state">暂无手牌</div>`}
        </div>
      </section>

      <details class="debug-drawer">
        <summary>测试信息</summary>
        <div class="debug-content">
          <div class="mode-note">当前仅执行基础规则。特殊效果、关键词、召唤条件、进化、装备和场景暂不结算。演示牌池会让所有“生命与攻击已明确”的正式随从至少出现1张；数量未确认的卡只在本演示牌池临时按1张使用，不写回正式记录。</div>
          <div class="debug-stats">
            <span>演示牌池 ${catalog.playableUniqueCards} 种 / ${catalog.playableDeckSize} 张</span>
            <span>死亡记录 ${state.deathLog.length}</span>
            <span>保存 ${formatTime(session.updatedAt)}</span>
          </div>
          <div class="log-list">
            ${session.log.slice().reverse().map((entry) => `<div class="log-entry"><span>R${entry.turn}</span>${escapeHtml(entry.text)}</div>`).join("")}
          </div>
        </div>
      </details>

      <div id="flying-card-layer" class="flying-card-layer" aria-hidden="true"></div>
      ${openingDealActive ? openingDealOverlay() : ""}
      ${!openingDealActive && session.handoffRequired && !state.winner ? handoffOverlay(active) : ""}
      ${!openingDealActive && state.winner ? winnerOverlay(state.winner) : ""}
    </main>
  `;

  bindEvents();
}

function heroPanel(playerId: PlayerId, isActive: boolean): string {
  const player = session.state.players[playerId];
  const isTarget = !isActive && selectedAttackerId !== null && !session.handoffRequired && !animationRunning;
  const tag = isTarget ? "button" : "div";
  const targetAttrs = isTarget ? `data-hero-target="${playerId}"` : "";
  return `
    <${tag} class="hero-panel ${isActive ? "active-hero" : "opponent-hero"} ${isTarget ? "hero-target-ready" : ""}" ${targetAttrs}>
      <div class="hero-portrait"><span>${playerId === "P1" ? "1" : "2"}</span></div>
      <div class="hero-copy">
        <span>${playerLabel(playerId)}</span>
        <strong>♥ ${player.health}</strong>
        <small>${session.state.activePlayer === playerId ? "当前回合" : "等待"} · 手牌 ${player.hand.length}</small>
      </div>
      <div class="equipment-slot" title="装备位将在后续版本启用">装备</div>
    </${tag}>
  `;
}

function boardZone(playerId: PlayerId, isActivePanel: boolean): string {
  const player = session.state.players[playerId];
  const board = player.board.map((minion, index) => boardSlot(playerId, minion, index, isActivePanel)).join("");
  return `
    <section class="board-zone ${isActivePanel ? "active-board" : "opponent-board"}">
      <div class="board-caption"><span>${isActivePanel ? "己方随从" : "敌方随从"}</span><small>5 格</small></div>
      <div class="board-row">${board}</div>
    </section>
  `;
}

function boardSlot(playerId: PlayerId, minion: MinionInstance | null, slotIndex: number, isActivePanel: boolean): string {
  if (!minion) {
    const summonReady = isActivePanel && selectedHandIndex !== null && !session.handoffRequired && !animationRunning;
    return `<button class="board-slot empty-slot ${summonReady ? "summon-ready" : ""}" data-empty-slot="${slotIndex}" ${isActivePanel && !animationRunning ? "" : "disabled"}><span>${slotIndex + 1}</span><small>${summonReady ? "召唤" : "空位"}</small></button>`;
  }
  const card = catalog.cards.get(minion.cardId);
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  const ready = playerId === session.state.activePlayer && canMinionAttack(session, minion) && !session.handoffRequired && !animationRunning;
  const selected = selectedAttackerId === minion.instanceId;
  const enemyTarget = playerId !== session.state.activePlayer && selectedAttackerId !== null && !session.handoffRequired && !animationRunning;
  return `
    <button class="board-slot minion ${ready ? "attack-ready" : ""} ${selected ? "selected" : ""} ${enemyTarget ? "enemy-target" : ""}"
      data-minion-id="${escapeHtml(minion.instanceId)}" data-owner="${playerId}" ${animationRunning ? "disabled" : ""}>
      <span class="slot-number">${slotIndex + 1}</span>
      <div class="minion-art"><span>${escapeHtml((card?.name ?? minion.cardId).slice(0, 1))}</span></div>
      <strong>${escapeHtml(card?.name ?? minion.cardId)}</strong>
      <div class="minion-stats"><span>⚔ ${attack}</span><span>♥ ${minion.currentHealth}</span></div>
      <small>${ready ? "可攻击" : minion.summonedOnTurn === session.state.turn ? "刚上场" : "已行动"}</small>
    </button>
  `;
}

function handCard(cardId: CardId, index: number, handSize: number): string {
  const card = catalog.cards.get(cardId);
  if (!card) return `<button class="hand-card" disabled>${escapeHtml(cardId)}</button>`;
  const selected = selectedHandIndex === index;
  const unusable = card.health === null || card.attack === null;
  const newlyDrawnHidden = hiddenDrawCount > 0 && index >= handSize - hiddenDrawCount;
  return `
    <button class="hand-card ${selected ? "selected" : ""} ${newlyDrawnHidden ? "newly-drawn-hidden" : ""}" data-hand-index="${index}" ${unusable || animationRunning ? "disabled" : ""}>
      <span class="card-id">${escapeHtml(card.id)}</span>
      <div class="hand-card-art"><span>${escapeHtml(card.name.slice(0, 1))}</span></div>
      <strong>${escapeHtml(card.name)}</strong>
      <div class="card-stats"><span>⚔ ${card.attack ?? "?"}</span><span>♥ ${card.health ?? "?"}</span></div>
      <small>${escapeHtml(card.summonText ?? "直接召唤")}</small>
    </button>
  `;
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-hand-index]").forEach((element) => {
    element.addEventListener("click", () => {
      if (session.handoffRequired || animationRunning) return;
      const index = Number(element.dataset.handIndex);
      selectedHandIndex = selectedHandIndex === index ? null : index;
      selectedAttackerId = null;
      notice = selectedHandIndex === null ? "已取消召唤选择。" : "请选择己方空随从位。";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-empty-slot]").forEach((element) => {
    element.addEventListener("click", () => {
      if (selectedHandIndex === null || animationRunning) return;
      const error = summonFromHand(session, catalog, selectedHandIndex, Number(element.dataset.emptySlot));
      if (!error) selectedHandIndex = null;
      selectedAttackerId = null;
      commit(error ?? "召唤完成。", Boolean(error));
    });
  });

  document.querySelectorAll<HTMLElement>("[data-minion-id]").forEach((element) => {
    element.addEventListener("click", () => {
      if (session.handoffRequired || animationRunning) return;
      const instanceId = element.dataset.minionId;
      const owner = element.dataset.owner as PlayerId | undefined;
      if (!instanceId || !owner) return;
      if (owner === session.state.activePlayer) {
        const minion = findMinion(owner, instanceId);
        if (!minion || !canMinionAttack(session, minion)) {
          commit("这个随从当前不能攻击。", true, false);
          return;
        }
        selectedAttackerId = selectedAttackerId === instanceId ? null : instanceId;
        selectedHandIndex = null;
        notice = selectedAttackerId ? "请选择敌方随从或敌方英雄。" : "已取消攻击选择。";
        render();
        return;
      }
      if (!selectedAttackerId) return;
      const error = attackMinion(session, catalog, selectedAttackerId, instanceId);
      selectedAttackerId = null;
      selectedHandIndex = null;
      commit(error ?? "攻击结算完成。", Boolean(error));
    });
  });

  document.querySelector<HTMLElement>("[data-hero-target]")?.addEventListener("click", () => {
    if (!selectedAttackerId || animationRunning) return;
    const error = attackHero(session, catalog, selectedAttackerId);
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit(error ?? "英雄受到攻击。", Boolean(error));
  });

  document.querySelector<HTMLButtonElement>("#end-turn")?.addEventListener("click", () => {
    if (animationRunning) return;
    const next = otherPlayer(session.state.activePlayer);
    const handBefore = session.state.players[next].hand.length;
    const error = endTurn(session);
    if (!error) {
      pendingTurnDrawCount = Math.max(0, session.state.players[next].hand.length - handBefore);
    }
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit(error ?? "回合结束，进入交接。", Boolean(error));
  });

  document.querySelector<HTMLButtonElement>("#reveal-turn")?.addEventListener("click", () => {
    if (animationRunning) return;
    revealCurrentTurn(session);
    const drawCount = pendingTurnDrawCount;
    pendingTurnDrawCount = 0;
    hiddenDrawCount = drawCount;
    notice = `${playerLabel(session.state.activePlayer)}已接手。`;
    saveSession(session);
    render();
    if (drawCount > 0) void playTurnDraw(drawCount);
  });

  document.querySelectorAll<HTMLElement>("[data-new-game]").forEach((element) => {
    element.addEventListener("click", () => {
      if (animationRunning) return;
      const needsConfirm = element.dataset.newGame !== "instant";
      if (needsConfirm && !window.confirm("这会覆盖当前保存的对局。确定新开一局吗？")) return;
      startNewGame();
    });
  });
}

function startNewGame(): void {
  session = createBasicGame(cards);
  selectedAttackerId = null;
  selectedHandIndex = null;
  pendingTurnDrawCount = 0;
  hiddenDrawCount = 0;
  openingDealActive = true;
  animationRunning = false;
  notice = "新对局准备中：洗牌并发初始手牌。";
  saveSession(session);
  render();
  void playOpeningDeal();
}

function commit(message: string, isError = false, persist = true): void {
  notice = isError ? `无法执行：${message}` : message;
  if (persist) saveSession(session);
  render();
}

function openingDealOverlay(): string {
  return `
    <div class="opening-deal-shield">
      <div class="deal-status">
        <span>共享牌库</span>
        <strong>正在发牌</strong>
        <small id="deal-progress">准备牌库…</small>
      </div>
    </div>
  `;
}

async function playOpeningDeal(): Promise<void> {
  if (!openingDealActive || animationRunning) return;
  animationRunning = true;
  await wait(reducedMotion() ? 40 : 180);

  const progress = () => document.querySelector<HTMLElement>("#deal-progress");
  const opponentTarget = document.querySelector<HTMLElement>(".opponent-hero");
  const activeTarget = document.querySelector<HTMLElement>("#active-hand-target");
  if (!opponentTarget || !activeTarget) {
    openingDealActive = false;
    animationRunning = false;
    render();
    return;
  }

  const openingCount = 8;
  for (let i = 0; i < openingCount; i += 1) {
    const label = progress();
    if (label) label.textContent = `初始手牌 ${i + 1} / ${openingCount}`;
    await Promise.all([
      flyCardTo(opponentTarget, i, openingCount, "opponent"),
      flyCardTo(activeTarget, i, openingCount, "active"),
    ]);
  }

  const firstTurnDraw = Math.max(0, session.state.players[session.state.activePlayer].hand.length - openingCount);
  if (firstTurnDraw > 0) {
    const label = progress();
    if (label) label.textContent = `先手摸牌 ${firstTurnDraw} 张`;
    for (let i = 0; i < firstTurnDraw; i += 1) {
      await flyCardTo(activeTarget, i, firstTurnDraw, "draw");
    }
  }

  openingDealActive = false;
  animationRunning = false;
  notice = `发牌完成。演示牌池共 ${catalog.playableUniqueCards} 种随从。`;
  render();
}

async function playTurnDraw(count: number): Promise<void> {
  if (count <= 0 || animationRunning) {
    hiddenDrawCount = 0;
    render();
    return;
  }
  animationRunning = true;
  render();
  await wait(reducedMotion() ? 30 : 80);
  const target = document.querySelector<HTMLElement>("#active-hand-target");
  if (target) {
    for (let i = 0; i < count; i += 1) {
      await flyCardTo(target, i, count, "draw");
    }
  }
  hiddenDrawCount = 0;
  animationRunning = false;
  notice = `${playerLabel(session.state.activePlayer)}摸了 ${count} 张牌。`;
  render();
}

async function flyCardTo(
  target: HTMLElement,
  index: number,
  total: number,
  kind: "opponent" | "active" | "draw",
): Promise<void> {
  const source = document.querySelector<HTMLElement>("#deck-source");
  const layer = document.querySelector<HTMLElement>("#flying-card-layer");
  if (!source || !layer) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const card = document.createElement("div");
  card.className = `flying-card flying-card-${kind}`;
  card.innerHTML = `<span>CG</span>`;
  layer.append(card);

  const width = Math.max(22, Math.min(42, sourceRect.width * 0.54));
  const height = width * 1.38;
  const startX = sourceRect.left + sourceRect.width / 2 - width / 2;
  const startY = sourceRect.top + sourceRect.height / 2 - height / 2;
  const spread = total > 1 ? (index - (total - 1) / 2) * Math.min(16, targetRect.width / (total + 2)) : 0;
  const endX = targetRect.left + targetRect.width / 2 - width / 2 + spread;
  const targetVertical = kind === "opponent" ? 0.62 : 0.5;
  const endY = targetRect.top + targetRect.height * targetVertical - height / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  card.style.width = `${width}px`;
  card.style.height = `${height}px`;
  card.style.left = `${startX}px`;
  card.style.top = `${startY}px`;

  if (reducedMotion()) {
    card.remove();
    await wait(20);
    return;
  }

  const animation = card.animate([
    { transform: "translate3d(0, 0, 0) rotate(5deg) scale(.72)", opacity: 0 },
    { transform: `translate3d(${dx * 0.42}px, ${dy * 0.28 - 22}px, 0) rotate(-8deg) scale(1.05)`, opacity: 1, offset: 0.45 },
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${kind === "opponent" ? -4 : 3}deg) scale(.86)`, opacity: 0.94 },
  ], {
    duration: kind === "draw" ? 250 : 210,
    easing: "cubic-bezier(.2,.76,.24,1)",
    fill: "forwards",
  });

  try {
    await animation.finished;
  } catch {
    // A render/navigation can cancel a cosmetic animation. Game state is already saved.
  }
  card.remove();
  await wait(kind === "draw" ? 35 : 18);
}

function handoffOverlay(playerId: PlayerId): string {
  return `
    <div class="overlay">
      <div class="overlay-card compact-overlay">
        <div class="eyebrow">本地双人交接</div>
        <h2>轮到${playerLabel(playerId)}</h2>
        <p>把设备交给下一位玩家，点击后才显示当前玩家手牌。随后会播放本回合摸牌动画。</p>
        <button id="reveal-turn" class="primary-button large">查看手牌并开始</button>
      </div>
    </div>
  `;
}

function winnerOverlay(winner: PlayerId | "draw"): string {
  return `
    <div class="overlay winner-overlay">
      <div class="overlay-card compact-overlay">
        <div class="eyebrow">对局结束</div>
        <h2>${winner === "draw" ? "平局" : `${playerLabel(winner)}获胜`}</h2>
        <p>结束状态已自动保存。点击“再来一局”会直接创建新对局，并重新播放洗牌发牌动画。</p>
        <button class="primary-button large" data-new-game="instant">再来一局</button>
      </div>
    </div>
  `;
}

function findMinion(playerId: PlayerId, instanceId: string): MinionInstance | null {
  return session.state.players[playerId].board.find((minion) => minion?.instanceId === instanceId) ?? null;
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function playerLabel(playerId: PlayerId): string {
  return playerId === "P1" ? "玩家1" : "玩家2";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
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
