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
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("缺少 #app 根节点");

let session: BasicGameSession = loadSavedSession() ?? createBasicGame(cards);
let selectedHandIndex: number | null = null;
let selectedAttackerId: string | null = null;
let notice = loadSavedSession() ? "已恢复上次未结束的对局。" : "已创建新对局并自动保存。";
saveSession(session);
installPersistenceGuards(() => session);

window.addEventListener("storage", (event) => {
  if (!event.key?.startsWith("lushizhizao.basic-game.v1")) return;
  const latest = loadSavedSession();
  if (!latest || latest.updatedAt <= session.updatedAt) return;
  session = latest;
  selectedHandIndex = null;
  selectedAttackerId = null;
  notice = "检测到另一个标签页的更新，已同步。";
  render();
});

render();

function render(): void {
  const state = session.state;
  const active = state.activePlayer;
  const opponent = otherPlayer(active);
  const activeState = state.players[active];
  const opponentState = state.players[opponent];

  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <div class="eyebrow">浏览器基础验收版</div>
          <h1>炉石制造</h1>
        </div>
        <div class="top-stats">
          <span>第 ${state.turn} 回合</span>
          <span>共享牌库 ${state.sharedDeck.length}</span>
          <span class="save-pill">● 自动保存</span>
        </div>
      </header>

      <section class="notice ${notice ? "show" : ""}">${escapeHtml(notice)}</section>
      <section class="mode-note">
        当前仅执行基础规则。所有随从特殊效果、关键词、召唤条件、进化、装备和场景暂不生效；牌面文字只展示，不参与结算。
      </section>

      ${playerPanel(opponent, false)}

      <section class="battlefield-divider">
        <button id="attack-hero" class="hero-target" ${selectedAttackerId ? "" : "disabled"}>
          ${selectedAttackerId ? `攻击${playerLabel(opponent)}英雄` : "先选择可攻击随从"}
        </button>
      </section>

      ${playerPanel(active, true)}

      <section class="hand-panel">
        <div class="section-heading">
          <div>
            <span>${playerLabel(active)}手牌</span>
            <small>${activeState.hand.length} 张</small>
          </div>
          <button id="end-turn" class="primary-button" ${state.winner ? "disabled" : ""}>结束回合</button>
        </div>
        <div class="hand-row">
          ${activeState.hand.map((cardId, index) => handCard(cardId, index)).join("") || `<div class="empty-state">暂无手牌</div>`}
        </div>
        <div class="hint">召唤：先点一张手牌，再点己方空随从位。攻击：先点己方可攻击随从，再点敌方随从或英雄。</div>
      </section>

      <section class="lower-grid">
        <article class="log-panel">
          <div class="section-heading"><span>对局记录</span><small>最多保留最近 300 条</small></div>
          <div class="log-list">
            ${session.log.slice().reverse().map((entry) => `<div class="log-entry"><span>R${entry.turn}</span>${escapeHtml(entry.text)}</div>`).join("")}
          </div>
        </article>
        <article class="info-panel">
          <div class="section-heading"><span>原型状态</span></div>
          <dl>
            <div><dt>可运行牌库</dt><dd>${catalog.playableDeckSize} 张</dd></div>
            <div><dt>弃牌</dt><dd>P1 ${state.players.P1.discardPile.length} / P2 ${state.players.P2.discardPile.length}</dd></div>
            <div><dt>死亡记录</dt><dd>${state.deathLog.length}</dd></div>
            <div><dt>保存时间</dt><dd>${formatTime(session.updatedAt)}</dd></div>
          </dl>
          <button id="new-game" class="danger-button">清空当前局并新开一局</button>
        </article>
      </section>

      ${session.handoffRequired && !state.winner ? handoffOverlay(active) : ""}
      ${state.winner ? winnerOverlay(state.winner) : ""}
    </main>
  `;

  bindEvents();
}

function playerPanel(playerId: PlayerId, isActivePanel: boolean): string {
  const player = session.state.players[playerId];
  const board = player.board.map((minion, index) => boardSlot(playerId, minion, index, isActivePanel)).join("");
  return `
    <section class="player-panel ${isActivePanel ? "active-player" : "opponent-player"}">
      <div class="player-line">
        <div>
          <strong>${playerLabel(playerId)}</strong>
          <span class="turn-badge">${session.state.activePlayer === playerId ? "当前回合" : "等待"}</span>
        </div>
        <div class="player-numbers">
          <span class="health">♥ ${player.health}</span>
          <span>手牌 ${player.hand.length}</span>
          <span>弃牌 ${player.discardPile.length}</span>
        </div>
      </div>
      <div class="board-row">${board}</div>
    </section>
  `;
}

function boardSlot(playerId: PlayerId, minion: MinionInstance | null, slotIndex: number, isActivePanel: boolean): string {
  if (!minion) {
    const summonReady = isActivePanel && selectedHandIndex !== null && !session.handoffRequired;
    return `<button class="board-slot empty-slot ${summonReady ? "summon-ready" : ""}" data-empty-slot="${slotIndex}" ${isActivePanel ? "" : "disabled"}><span>${slotIndex + 1}</span><small>${summonReady ? "召唤到这里" : "空位"}</small></button>`;
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
      <strong>${escapeHtml(card.name)}</strong>
      <div class="card-stats"><span>⚔ ${card.attack ?? "?"}</span><span>♥ ${card.health ?? "?"}</span></div>
      <small>${escapeHtml(card.summonText ?? "直接召唤")}</small>
      ${card.effects.length > 0 ? `<em>特殊效果暂未启用</em>` : ""}
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
      notice = selectedHandIndex === null ? "已取消召唤选择。" : "请选择己方一个空随从位。";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-empty-slot]").forEach((element) => {
    element.addEventListener("click", () => {
      if (selectedHandIndex === null) return;
      const error = summonFromHand(session, catalog, selectedHandIndex, Number(element.dataset.emptySlot));
      if (!error) selectedHandIndex = null;
      selectedAttackerId = null;
      commit(error ?? "召唤完成。特殊召唤条件和随从效果在本版中未执行。", Boolean(error));
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
        notice = selectedAttackerId ? "请选择敌方随从或敌方英雄作为目标。" : "已取消攻击选择。";
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

  document.querySelector<HTMLButtonElement>("#attack-hero")?.addEventListener("click", () => {
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
    commit(error ?? "回合已结束，进入交接屏。", Boolean(error));
  });

  document.querySelector<HTMLButtonElement>("#reveal-turn")?.addEventListener("click", () => {
    revealCurrentTurn(session);
    commit(`${playerLabel(session.state.activePlayer)}已接手。`, false);
  });

  document.querySelector<HTMLButtonElement>("#new-game")?.addEventListener("click", () => {
    const confirmed = window.confirm("这会覆盖当前保存的对局。确定新开一局吗？");
    if (!confirmed) return;
    session = createBasicGame(cards);
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit("已创建并保存新对局。", false);
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
      <div class="overlay-card">
        <div class="eyebrow">本地双人交接</div>
        <h2>轮到${playerLabel(playerId)}</h2>
        <p>上一位玩家请把设备交给下一位。点击后才显示当前玩家手牌，避免交接时看到对方手牌。</p>
        <button id="reveal-turn" class="primary-button large">查看手牌并开始</button>
      </div>
    </div>
  `;
}

function winnerOverlay(winner: PlayerId | "draw"): string {
  return `
    <div class="overlay">
      <div class="overlay-card">
        <div class="eyebrow">对局结束</div>
        <h2>${winner === "draw" ? "平局" : `${playerLabel(winner)}获胜`}</h2>
        <p>本局记录已经保存在当前浏览器中。你可以关闭页面后再回来查看，也可以手动新开一局。</p>
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
