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
let notice = restoredSession ? "已恢复上次对局。" : "已创建新对局并自动保存。";
saveSession(session);
installPersistenceGuards(() => session);

window.addEventListener("storage", (event) => {
  if (!event.key?.startsWith("lushizhizao.basic-game.v1")) return;
  const latest = loadSavedSession();
  if (!latest || latest.updatedAt <= session.updatedAt) return;
  session = latest;
  selectedHandIndex = null;
  selectedAttackerId = null;
  notice = "另一个标签页有更新，已同步。";
  render();
});

render();

function render(): void {
  const state = session.state;
  const active = state.activePlayer;
  const opponent = otherPlayer(active);
  const activeState = state.players[active];

  root.innerHTML = `
    <main class="game-shell">
      <header class="game-topbar">
        <div class="brand-block">
          <strong>Card Game</strong>
          <span>基础验收版</span>
        </div>
        <div class="top-stats">
          <span>第 ${state.turn} 回合</span>
          <span>共享牌库 ${state.sharedDeck.length}</span>
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
            <span class="rail-label">牌局</span>
            <strong>牌库 ${state.sharedDeck.length}</strong>
            <small>P1 弃牌 ${state.players.P1.discardPile.length}</small>
            <small>P2 弃牌 ${state.players.P2.discardPile.length}</small>
          </div>
          <div class="rail-actions">
            <button id="end-turn" class="primary-button turn-button" ${state.winner ? "disabled" : ""}>结束回合</button>
            <button class="secondary-button" data-new-game="confirm">新对局</button>
          </div>
        </aside>
      </section>

      <section class="hand-dock">
        <div class="hand-heading">
          <strong>${playerLabel(active)}手牌</strong>
          <span>${activeState.hand.length} 张</span>
          <small>点手牌 → 点己方空位召唤　｜　点己方随从 → 点敌方目标攻击</small>
        </div>
        <div class="hand-row">
          ${activeState.hand.map((cardId, index) => handCard(cardId, index)).join("") || `<div class="empty-state">暂无手牌</div>`}
        </div>
      </section>

      <details class="debug-drawer">
        <summary>测试信息</summary>
        <div class="debug-content">
          <div class="mode-note">当前仅执行基础规则。随从特殊效果、关键词、召唤条件、进化、装备和场景暂不结算。</div>
          <div class="debug-stats">
            <span>可运行牌库 ${catalog.playableDeckSize}</span>
            <span>死亡记录 ${state.deathLog.length}</span>
            <span>保存 ${formatTime(session.updatedAt)}</span>
          </div>
          <div class="log-list">
            ${session.log.slice().reverse().map((entry) => `<div class="log-entry"><span>R${entry.turn}</span>${escapeHtml(entry.text)}</div>`).join("")}
          </div>
        </div>
      </details>

      ${session.handoffRequired && !state.winner ? handoffOverlay(active) : ""}
      ${state.winner ? winnerOverlay(state.winner) : ""}
    </main>
  `;

  bindEvents();
}

function heroPanel(playerId: PlayerId, isActive: boolean): string {
  const player = session.state.players[playerId];
  const isTarget = !isActive && selectedAttackerId !== null && !session.handoffRequired;
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
    const summonReady = isActivePanel && selectedHandIndex !== null && !session.handoffRequired;
    return `<button class="board-slot empty-slot ${summonReady ? "summon-ready" : ""}" data-empty-slot="${slotIndex}" ${isActivePanel ? "" : "disabled"}><span>${slotIndex + 1}</span><small>${summonReady ? "召唤" : "空位"}</small></button>`;
  }
  const card = catalog.cards.get(minion.cardId);
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  const ready = playerId === session.state.activePlayer && canMinionAttack(session, minion) && !session.handoffRequired;
  const selected = selectedAttackerId === minion.instanceId;
  const enemyTarget = playerId !== session.state.activePlayer && selectedAttackerId !== null && !session.handoffRequired;
  return `
    <button class="board-slot minion ${ready ? "attack-ready" : ""} ${selected ? "selected" : ""} ${enemyTarget ? "enemy-target" : ""}"
      data-minion-id="${escapeHtml(minion.instanceId)}" data-owner="${playerId}">
      <span class="slot-number">${slotIndex + 1}</span>
      <div class="minion-art"><span>${escapeHtml((card?.name ?? minion.cardId).slice(0, 1))}</span></div>
      <strong>${escapeHtml(card?.name ?? minion.cardId)}</strong>
      <div class="minion-stats"><span>⚔ ${attack}</span><span>♥ ${minion.currentHealth}</span></div>
      <small>${ready ? "可攻击" : minion.summonedOnTurn === session.state.turn ? "刚上场" : "已行动"}</small>
    </button>
  `;
}

function handCard(cardId: CardId, index: number): string {
  const card = catalog.cards.get(cardId);
  if (!card) return `<button class="hand-card" disabled>${escapeHtml(cardId)}</button>`;
  const selected = selectedHandIndex === index;
  const unusable = card.health === null || card.attack === null;
  return `
    <button class="hand-card ${selected ? "selected" : ""}" data-hand-index="${index}" ${unusable ? "disabled" : ""}>
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
      if (session.handoffRequired) return;
      const index = Number(element.dataset.handIndex);
      selectedHandIndex = selectedHandIndex === index ? null : index;
      selectedAttackerId = null;
      notice = selectedHandIndex === null ? "已取消召唤选择。" : "请选择己方空随从位。";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-empty-slot]").forEach((element) => {
    element.addEventListener("click", () => {
      if (selectedHandIndex === null) return;
      const error = summonFromHand(session, catalog, selectedHandIndex, Number(element.dataset.emptySlot));
      if (!error) selectedHandIndex = null;
      selectedAttackerId = null;
      commit(error ?? "召唤完成。", Boolean(error));
    });
  });

  document.querySelectorAll<HTMLElement>("[data-minion-id]").forEach((element) => {
    element.addEventListener("click", () => {
      if (session.handoffRequired) return;
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
    if (!selectedAttackerId) return;
    const error = attackHero(session, catalog, selectedAttackerId);
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit(error ?? "英雄受到攻击。", Boolean(error));
  });

  document.querySelector<HTMLButtonElement>("#end-turn")?.addEventListener("click", () => {
    const error = endTurn(session);
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit(error ?? "回合结束，进入交接。", Boolean(error));
  });

  document.querySelector<HTMLButtonElement>("#reveal-turn")?.addEventListener("click", () => {
    revealCurrentTurn(session);
    commit(`${playerLabel(session.state.activePlayer)}已接手。`, false);
  });

  document.querySelectorAll<HTMLElement>("[data-new-game]").forEach((element) => {
    element.addEventListener("click", () => {
      const needsConfirm = element.dataset.newGame !== "instant";
      if (needsConfirm && !window.confirm("这会覆盖当前保存的对局。确定新开一局吗？")) return;
      session = createBasicGame(cards);
      selectedAttackerId = null;
      selectedHandIndex = null;
      commit("已创建并保存新对局。", false);
    });
  });
}

function commit(message: string, isError = false, persist = true): void {
  notice = isError ? `无法执行：${message}` : message;
  if (persist) saveSession(session);
  render();
}

function handoffOverlay(playerId: PlayerId): string {
  return `
    <div class="overlay">
      <div class="overlay-card compact-overlay">
        <div class="eyebrow">本地双人交接</div>
        <h2>轮到${playerLabel(playerId)}</h2>
        <p>把设备交给下一位玩家，点击后才显示当前玩家手牌。</p>
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
        <p>结束状态已自动保存。点击“再来一局”会直接覆盖当前对局存档。</p>
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}
