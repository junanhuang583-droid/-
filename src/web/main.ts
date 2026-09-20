import type { QueuedCard } from "../application/card-acquisition-queue.js";
import { battlefieldBackground, deckView, turnView, heroView } from "./battlefield-view.js";
import { HandoffView } from "./handoff-view.js";
import { presentationLocked, setPresentationLocked } from "./presentation-lock.js";
import { turnControlAriaLabel, turnControlDisabled, turnFace } from "../application/turn-control-state.js";
import { deriveTurnControlState } from "../application/turn-control-state.js";
import { EndTurnMotion } from "./end-turn-motion.js";
import { syncEndTurnArt } from "./end-turn-view.js";
import { DeckDrawMotion } from "./deck-draw-motion.js";
import {
  canMinionAttack,
  hasPendingEffects,
  type BasicGameSession
} from "../core/basic-game.js";
import type { CardId } from "../model/cards.js";
import type { MinionInstance, PlayerId } from "../model/state.js";
import { catalog } from "./game-catalog.js";
import { acquisitionQueue, dispatchGame, finishOpeningDeal, persistenceWarning, readSession, resetGame, subscribeSession, wasSessionRestored } from "./session-runtime.js";
import "./styles.css";
import { publishViewRendered } from "./view-events.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("缺少 #app 根节点");
const root: HTMLDivElement = appRoot;

const restoredSession = wasSessionRestored ? readSession() : null;
let session: BasicGameSession = readSession();
let presentedPlayer: PlayerId = session.state.activePlayer;
let selectedHandIndex: number | null = null;
let selectedAttackerId: string | null = null;
let hiddenDrawCount = 0;
let openingDealActive = restoredSession === null;
let animationRunning = false;
let turnFlipAnimating = false;
let turnFlipEpoch = 0;
const turnMotion = new EndTurnMotion();
const deckDrawMotion = new DeckDrawMotion();
const handoffView = new HandoffView(() => { void revealTurnWithFlip(); });
const clickBound = new WeakSet<HTMLElement>();
const markup = new WeakMap<HTMLElement, string>();
let notice = restoredSession
  ? "已恢复上次对局。新对局将启用扩展演示牌池。"
  : "新对局准备中：洗牌并发初始手牌。";

let sessionRenderQueued = false;
subscribeSession((reason) => {
  session = readSession();
  selectedAttackerId = null;
  selectedHandIndex = null;
  if (reason === "external" || reason === "new-game" || session.state.winner) {
    animationEpoch += 1;
    discardFlyingCards();
    hiddenDrawCount = 0;
    openingDealActive = false;
    animationRunning = false;
    turnFlipEpoch += 1;
    turnMotion.cancel();
    handoffView.cancelPublic();
    presentedPlayer = session.state.activePlayer;
    turnFlipAnimating = false;
    if (reason === "external") notice = "已同步另一窗口中的对局。";
  }
  // A committed end-turn/reveal renders through the flip presenter. Suppress
  // the normal command render so it cannot replace the core mid-animation.
  if (turnFlipAnimating && reason === "command") return;
  // Privacy and gesture cancellation apply in this same notification, not next frame.
  setPresentationLocked(session.handoffRequired || turnFlipAnimating || openingDealActive || animationRunning || Boolean(session.state.winner));
  if (session.handoffRequired) hidePrivateHand();
  if (sessionRenderQueued) return;
  sessionRenderQueued = true;
  queueMicrotask(() => { sessionRenderQueued = false; render(); });
});
let animationEpoch = 0;

render();
if (openingDealActive) void playOpeningDeal();

function render(): void {
  const carriedPose = turnMotion.capture();
  session = readSession();
  const state = session.state;
  const active = presentedPlayer;
  const opponent = otherPlayer(active);
  const interactionLocked = openingDealActive || animationRunning || turnFlipAnimating;
  const handPrivate = openingDealActive || session.handoffRequired || turnFlipAnimating;
  setPresentationLocked(handPrivate || animationRunning || Boolean(state.winner));
  const turnState = deriveTurnControlState({ handoffRequired: session.handoffRequired,
    blocked: Boolean(state.winner || interactionLocked || hasPendingEffects(session)) });

  if (!root.querySelector(".game-shell")) {
    root.innerHTML = `<main class="game-shell">
      <header class="game-topbar"><div class="brand-block"><strong>Card Game</strong><span>基础验收版</span></div><div class="top-stats"></div></header>
      <section class="status-toast"></section>
      <div class="stage07-utility-actions" data-battlefield-anchor="utility-actions"><button class="secondary-button" data-new-game="confirm">新对局</button></div>
      <section class="battlefield-viewport" aria-label="战场">
        <div class="battlefield-coordinate-layer" data-battlefield-design="1152x648" data-stage07-lock="battlefield-v2-2d3">
          ${battlefieldBackground()}
          <div class="battlefield-future-anchor" data-battlefield-anchor="discard-future" aria-hidden="true"></div>
          <section class="battle-shell">
            <div id="public-battle-view" class="public-battle-view" tabindex="-1" aria-label="公共战场"></div>
            <aside class="battle-rail" data-battlefield-anchor="right-rail"><div id="deck-view-mount">${deckView(state.sharedDeck.length)}</div>${turnView(turnState)}</aside>
          </section>
          <section class="hand-dock" data-battlefield-anchor="hand-dock">
            <button class="stage04-hand-toggle" type="button" aria-expanded="false"><span>手牌</span><strong></strong></button>
            <div class="hand-row" id="active-hand-target"></div>
          </section>
        </div>
      </section>
      <details class="debug-drawer"><summary>测试信息</summary><div class="debug-content"></div></details>
      <div id="flying-card-layer" class="flying-card-layer" aria-hidden="true"></div>
      <div id="session-overlay-mount"></div>
    </main>`;
  }
  const shell = root.querySelector<HTMLElement>(".game-shell")!;
  shell.dataset.viewPlayer = presentedPlayer;
  shell.dataset.handPrivate = String(handPrivate);
  shell.classList.toggle("session-private", handPrivate);
  shell.classList.toggle("opening-deal", openingDealActive);
  shell.classList.toggle("draw-animating", hiddenDrawCount > 0);
  shell.dataset.presentationLocked = String(presentationLocked());
  const toast = root.querySelector<HTMLElement>(".status-toast")!;
  toast.textContent = persistenceWarning() || notice;
  toast.classList.toggle("show", Boolean(toast.textContent));
  root.querySelector<HTMLButtonElement>('[data-new-game="confirm"]')!.disabled = interactionLocked;
  replaceMarkup(root.querySelector<HTMLElement>(".top-stats")!, `<span>第 ${state.turn} 回合</span><span>${catalog.playableUniqueCards} 种演示随从</span><span class="save-pill">● 自动保存</span>`);
  const publicView = root.querySelector<HTMLElement>("#public-battle-view")!;
  publicView.dataset.viewPlayer = active;
  publicView.inert = presentationLocked();
  replaceMarkup(publicView, `${heroPanel(opponent, false)}${boardZone(opponent, false)}
    <section class="scene-lane" data-battlefield-anchor="scene"><div class="scene-placeholder">
      <span class="scene-label">场景</span><small>${selectedAttackerId ? `已选择攻击者，点击敌方随从或${playerLabel(opponent)}英雄` : ""}</small>
    </div></section>${heroPanel(active, true)}${boardZone(active, true)}`);
  publicView.querySelectorAll<HTMLElement>(".v2-hero-status").forEach(e => {
    const owner = e.closest<HTMLElement>(".hero-panel")!.dataset.owner as PlayerId;
    e.textContent = session.handoffRequired || turnFlipAnimating ? "交接中"
      : `${owner === state.activePlayer ? "当前回合" : "等待"} · 手牌 ${state.players[owner].hand.length}`;
  });
  replaceMarkup(root.querySelector<HTMLElement>("#deck-view-mount")!, deckView(state.sharedDeck.length));

  const hand = root.querySelector<HTMLElement>("#active-hand-target")!;
  hand.setAttribute("aria-hidden", String(handPrivate));
  hand.inert = presentationLocked();
  const handState = state.players[state.activePlayer];
  replaceMarkup(hand, handPrivate ? "" : handState.hand.map((id, index) => handCard(id, index, handState.hand.length)).join("") || `<div class="empty-state">暂无手牌</div>`);
  const toggle = root.querySelector<HTMLButtonElement>(".stage04-hand-toggle")!;
  toggle.disabled = presentationLocked();
  toggle.querySelector("strong")!.textContent = String(handState.hand.length);
  // Hidden logs contain card names too; omit private details throughout handoff.
  replaceMarkup(root.querySelector<HTMLElement>(".debug-content")!, handPrivate ? "" : `
    <div class="mode-note">当前支持基础战斗、献祭、部分关键词与明确亡语。进化、装备、场景与AI尚未实现；并非全部卡牌技能都可执行。演示牌池中数量未确认的卡临时按1张使用，不写回正式记录。</div>
    <div class="debug-stats"><span>演示牌池 ${catalog.playableUniqueCards} 种 / ${catalog.playableDeckSize} 张</span><span>死亡记录 ${state.deathLog.length}</span><span>保存 ${formatTime(session.updatedAt)}</span></div>
    <div class="log-list">${session.log.slice().reverse().map(entry => `<div class="log-entry"><span>R${entry.turn}</span>${escapeHtml(entry.text)}</div>`).join("")}</div>`);
  replaceMarkup(root.querySelector<HTMLElement>("#session-overlay-mount")!, openingDealActive ? openingDealOverlay() : state.winner ? winnerOverlay(state.winner) : "");

  const turnButton = root.querySelector<HTMLButtonElement>("#end-turn")!;
  turnButton.dataset.turnState = turnState;
  turnButton.closest<HTMLElement>(".v2-turn")!.dataset.turnState = turnState;
  turnButton.disabled = turnControlDisabled(turnState);
  turnButton.setAttribute("aria-label", turnControlAriaLabel(turnState));
  turnButton.querySelector<HTMLElement>(".v2-turn-core")!.dataset.turnFace = turnFace(turnState);
  turnButton.querySelectorAll<HTMLElement>("[data-turn-face-panel]").forEach(e => e.setAttribute("aria-hidden", String(e.dataset.turnFacePanel !== turnFace(turnState))));
  syncEndTurnArt(turnButton);
  turnMotion.mount(turnButton, { face: turnFace(turnState),
    ready: !session.handoffRequired && !state.winner && !openingDealActive
      && !animationRunning && hiddenDrawCount === 0 && !hasPendingEffects(session),
  }, carriedPose, turnFlipAnimating);
  handoffView.sync(openingDealActive || state.winner ? null : turnFlipAnimating
    ? session.handoffRequired ? "outgoing" : "revealing" : session.handoffRequired ? "waiting" : null, playerLabel(state.activePlayer));
  bindEvents();
  publishViewRendered();
}

function replaceMarkup(element: HTMLElement, html: string): void {
  if (markup.get(element) === html) return;
  element.innerHTML = html;
  markup.set(element, html);
}
function hidePrivateHand(): void {
  const shell = root.querySelector<HTMLElement>(".game-shell");
  if (shell) { shell.classList.add("session-private"); shell.dataset.handPrivate = "true"; }
  const hand = root.querySelector<HTMLElement>("#active-hand-target");
  if (hand) { hand.inert = true; hand.setAttribute("aria-hidden", "true"); replaceMarkup(hand, ""); }
  const debug = root.querySelector<HTMLElement>(".debug-content");
  if (debug) replaceMarkup(debug, "");
}
function discardFlyingCards(): void {
  deckDrawMotion.cancel();
  const layer = root.querySelector<HTMLElement>("#flying-card-layer");
  layer?.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  layer?.replaceChildren();
}
function bindClick(element: HTMLElement | null, listener: () => void): void {
  if (!element || clickBound.has(element)) return;
  clickBound.add(element); element.addEventListener("click", listener);
}

function heroPanel(playerId: PlayerId, isActive: boolean): string {
  const player = session.state.players[playerId];
  const target = !isActive && selectedAttackerId !== null && !presentationLocked() && !interactionBusy();
  return heroView(playerId, isActive, player.health, player.hand.length, target);
}

function boardZone(playerId: PlayerId, isActivePanel: boolean): string {
  const player = session.state.players[playerId];
  const occupiedCount = player.board.reduce((count, minion) => count + (minion ? 1 : 0), 0);
  let occupiedOrder = 0;
  const board = player.board.map((minion, index) => {
    const visualOrder = minion ? occupiedOrder++ : null;
    return boardSlot(playerId, minion, index, isActivePanel, visualOrder, occupiedCount);
  }).join("");
  const summonMode = isActivePanel && selectedHandIndex !== null && !presentationLocked() && !interactionBusy();
  return `
    <section class="board-zone ${isActivePanel ? "active-board" : "opponent-board"} ${summonMode ? "summon-mode" : ""}" data-battlefield-anchor="${isActivePanel ? "active-minions" : "opponent-minions"}">
      <div class="board-caption"><span>${isActivePanel ? "己方随从" : "敌方随从"}</span><small>5 格</small></div>
      <div class="board-row">${board}</div>
    </section>
  `;
}

function boardSlot(
  playerId: PlayerId,
  minion: MinionInstance | null,
  slotIndex: number,
  isActivePanel: boolean,
  visualOrder: number | null,
  occupiedCount: number,
): string {
  const logicalOffset = slotIndex - 2;
  if (!minion) {
    const summonReady = isActivePanel && selectedHandIndex !== null && !presentationLocked() && !interactionBusy();
    return `<button class="board-slot empty-slot ${summonReady ? "summon-ready" : ""}" style="--battle-slot-index:${logicalOffset}" data-empty-slot="${slotIndex}" data-battlefield-slot="${playerId}-${slotIndex + 1}" ${isActivePanel && !presentationLocked() && !interactionBusy() ? "" : "disabled"}><span>${slotIndex + 1}</span><small>${summonReady ? "召唤" : "空位"}</small></button>`;
  }
  const compactOffset = (visualOrder ?? 0) - (occupiedCount - 1) / 2;
  const card = catalog.cards.get(minion.cardId);
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  const ready = playerId === session.state.activePlayer && canMinionAttack(session, minion) && !presentationLocked() && !interactionBusy();
  const selected = selectedAttackerId === minion.instanceId;
  const enemyTarget = playerId !== session.state.activePlayer && selectedAttackerId !== null && !presentationLocked() && !interactionBusy();
  return `
    <button class="board-slot minion ${ready ? "attack-ready" : ""} ${selected ? "selected" : ""} ${enemyTarget ? "enemy-target" : ""}"
      style="--battle-unit-index:${compactOffset};--battle-slot-index:${logicalOffset}"
      data-minion-id="${escapeHtml(minion.instanceId)}" data-card-id="${escapeHtml(minion.cardId)}" data-owner="${playerId}" data-battlefield-slot="${playerId}-${slotIndex + 1}" ${presentationLocked() || interactionBusy() ? "disabled" : ""}>
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
    <button class="hand-card ${selected ? "selected" : ""} ${newlyDrawnHidden ? "newly-drawn-hidden" : ""}" data-hand-index="${index}" data-card-id="${escapeHtml(cardId)}" ${unusable || interactionBusy() ? "disabled" : ""}>
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
    bindClick(element, () => {
      if (presentationLocked() || interactionBusy()) return;
      const index = Number(element.dataset.handIndex);
      selectedHandIndex = selectedHandIndex === index ? null : index;
      selectedAttackerId = null;
      notice = selectedHandIndex === null ? "已取消召唤选择。" : "请选择己方空位。";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-empty-slot]").forEach((element) => {
    bindClick(element, () => {
      if (presentationLocked() || selectedHandIndex === null || interactionBusy()) return;
      const error = dispatchGame({ type: "summon", handIndex: selectedHandIndex, slotIndex: Number(element.dataset.emptySlot), cardId: session.state.players[session.state.activePlayer].hand[selectedHandIndex]! });
      if (!error) selectedHandIndex = null;
      selectedAttackerId = null;
      commit(error ?? "召唤完成。", Boolean(error));
    });
  });

  document.querySelectorAll<HTMLElement>("[data-minion-id]").forEach((element) => {
    bindClick(element, () => {
      if (presentationLocked() || interactionBusy()) return;
      const instanceId = element.dataset.minionId;
      const owner = element.dataset.owner as PlayerId | undefined;
      if (!instanceId || !owner) return;
      if (owner === session.state.activePlayer) {
        const minion = findMinion(owner, instanceId);
        if (!minion || !canMinionAttack(session, minion)) {
          commit("这个随从当前不能攻击。", true);
          return;
        }
        selectedAttackerId = selectedAttackerId === instanceId ? null : instanceId;
        selectedHandIndex = null;
        notice = selectedAttackerId ? "请选择敌方随从或敌方英雄。" : "已取消攻击选择。";
        render();
        return;
      }
      if (!selectedAttackerId) return;
      const error = dispatchGame({ type: "attack-minion", attackerId: selectedAttackerId, targetId: instanceId });
      selectedAttackerId = null;
      selectedHandIndex = null;
      commit(error ?? "攻击结算完成。", Boolean(error));
    });
  });

  bindClick(document.querySelector<HTMLElement>("[data-hero-target]"), () => {
    if (presentationLocked() || !selectedAttackerId || interactionBusy()) return;
    const error = dispatchGame({ type: "attack-hero", attackerId: selectedAttackerId });
    selectedAttackerId = null;
    selectedHandIndex = null;
    commit(error ?? "英雄受到攻击。", Boolean(error));
  });

  bindClick(document.querySelector<HTMLButtonElement>("#end-turn"), () => {
    void endTurnWithFlip();
  });

  document.querySelectorAll<HTMLElement>("[data-new-game]").forEach((element) => {
    bindClick(element, () => {
      if (interactionBusy()) return;
      const needsConfirm = element.dataset.newGame !== "instant";
      if (needsConfirm && !window.confirm("这会覆盖当前保存的对局。确定新开一局吗？")) return;
      startNewGame();
    });
  });
}

async function endTurnWithFlip(): Promise<void> {
  if (interactionBusy()) return;
  const button = document.querySelector<HTMLButtonElement>("#end-turn");
  if (!button || button.disabled) return;

  turnFlipAnimating = true;
  setPresentationLocked(true);
  hidePrivateHand();
  const flipEpoch = ++turnFlipEpoch;
  const error = dispatchGame({ type: "end-turn" });
  session = readSession();

  if (error) {
    turnFlipAnimating = false;
    commit(error, true);
    return;
  }
  if (flipEpoch !== turnFlipEpoch) { render(); return; }

  selectedAttackerId = null;
  selectedHandIndex = null;
  notice = "回合结束，进入交接。";
  render();
  await playTurnFlip(flipEpoch);
}

async function revealTurnWithFlip(): Promise<void> {
  if (interactionBusy()) return;
  const reveal = document.querySelector<HTMLButtonElement>("#reveal-turn");
  if (!reveal || reveal.disabled) return;

  turnFlipAnimating = true;
  setPresentationLocked(true);
  hidePrivateHand();
  const flipEpoch = ++turnFlipEpoch;
  const error = dispatchGame({ type: "reveal-turn" });
  session = readSession();

  if (error) {
    turnFlipAnimating = false;
    commit(error, true);
    return;
  }
  if (flipEpoch !== turnFlipEpoch) { render(); return; }

  const drawnCards = acquisitionQueue.takeDraws(session.state.activePlayer, "turn-start")
    .flatMap(batch => batch.cards);
  hiddenDrawCount = drawnCards.length;
  notice = `${playerLabel(session.state.activePlayer)}已接手。`;
  render();
  const completed = await playTurnFlip(flipEpoch, true);
  if (flipEpoch !== turnFlipEpoch) return;
  if (completed && drawnCards.length > 0) void playTurnDraw(drawnCards);
}

async function playTurnFlip(epoch: number, reveal = false): Promise<boolean> {
  let completed = false;
  try {
    const rotation = turnMotion.play();
    const orientation = reveal && presentedPlayer !== session.state.activePlayer ? handoffView.switchPublic(root.querySelector<HTMLElement>("#public-battle-view")!, () => {
      if (epoch !== turnFlipEpoch) return;
      presentedPlayer = readSession().state.activePlayer;
      render();
    }) : Promise.resolve(true);
    const [motionResult, viewResult] = await Promise.all([rotation, orientation]);
    completed = motionResult === "completed" && viewResult;
  } finally {
    if (epoch === turnFlipEpoch) {
      // Cards were already drawn by the rule command. A discarded visual
      // transition must not start new cosmetic work in the background.
      if (!completed) { hiddenDrawCount = 0; acquisitionQueue.clear(); }
      if (reveal || !completed) presentedPlayer = readSession().state.activePlayer;
      turnFlipAnimating = false;
      render();
    }
  }
  return completed;
}

function interactionBusy(): boolean {
  return animationRunning || turnFlipAnimating;
}

function startNewGame(): void {
  animationEpoch += 1;
  discardFlyingCards();
  turnFlipEpoch += 1;
  turnMotion.cancel();
  handoffView.cancelPublic();
  turnFlipAnimating = false;
  resetGame();
  session = readSession();
  presentedPlayer = session.state.activePlayer;
  selectedAttackerId = null;
  selectedHandIndex = null;
  hiddenDrawCount = 0;
  openingDealActive = true;
  animationRunning = false;
  notice = "新对局准备中：洗牌并发初始手牌。";

  render();
  void playOpeningDeal();
}

function commit(message: string, isError = false): void {
  notice = isError ? `无法执行：${message}` : message;

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
  const epoch = animationEpoch;
  await wait(reducedMotion() ? 40 : 180);
  if (epoch !== animationEpoch) return;

  const progress = () => document.querySelector<HTMLElement>("#deal-progress");
  const opponentTarget = document.querySelector<HTMLElement>(".opponent-hero");
  const activeTarget = document.querySelector<HTMLElement>("#active-hand-target");
  if (!opponentTarget || !activeTarget) {
    acquisitionQueue.clear();
    openingDealActive = false;
    animationRunning = false;
    render();
    return;
  }

  const opening = acquisitionQueue.takeDraws(undefined, "opening-hand");
  const active = session.state.activePlayer;
  const activeCards = opening.filter(batch => batch.acquisition.playerId === active).flatMap(batch => batch.cards);
  const opponentCards = opening.filter(batch => batch.acquisition.playerId !== active).flatMap(batch => batch.cards);
  // Keep the existing recipient order. The source presenter serializes this
  // pair; multi-card choreography and exact hand landing are later packages.
  const openingCount = Math.max(activeCards.length, opponentCards.length);
  for (let i = 0; i < openingCount; i += 1) {
    const label = progress();
    if (label) label.textContent = `初始手牌 ${i + 1} / ${openingCount}`;
    if (epoch !== animationEpoch) return;
    const results = await Promise.all([
      opponentCards[i] ? flyCardTo(opponentTarget, "opponent", opponentCards[i]) : Promise.resolve(true),
      activeCards[i] ? flyCardTo(activeTarget, "active", activeCards[i]) : Promise.resolve(true),
    ]);
    if (results.some(ok => !ok)) {
      if (epoch !== animationEpoch) return;
      acquisitionQueue.clear();
      break;
    }
  }

  if (epoch !== animationEpoch) return;
  const firstTurnCards = acquisitionQueue.takeDraws(active, "turn-start").flatMap(batch => batch.cards);
  const firstTurnDraw = firstTurnCards.length;
  if (firstTurnDraw > 0) {
    const label = progress();
    if (label) label.textContent = `先手摸牌 ${firstTurnDraw} 张`;
    for (let i = 0; i < firstTurnDraw; i += 1) {
      if (epoch !== animationEpoch) return;
      if (!await flyCardTo(activeTarget, "draw", firstTurnCards[i])) break;
    }
  }

  if (epoch !== animationEpoch) return;
  finishOpeningDeal();
  openingDealActive = false;
  animationRunning = false;
  notice = `发牌完成。演示牌池共 ${catalog.playableUniqueCards} 种随从。`;
  render();
}

async function playTurnDraw(cards: QueuedCard[]): Promise<void> {
  const count = cards.length;
  if (count <= 0 || animationRunning) {
    hiddenDrawCount = 0;
    render();
    return;
  }
  animationRunning = true;
  const epoch = animationEpoch;
  render();
  await wait(reducedMotion() ? 30 : 80);
  const target = document.querySelector<HTMLElement>("#active-hand-target");
  if (target) {
    for (let i = 0; i < count; i += 1) {
      if (epoch !== animationEpoch) return;
      if (!await flyCardTo(target, "draw", cards[i])) break;
    }
  }
  if (epoch !== animationEpoch) return;
  hiddenDrawCount = 0;
  animationRunning = false;
  notice = `${playerLabel(session.state.activePlayer)}摸了 ${count} 张牌。`;
  render();
}

async function flyCardTo(
  target: HTMLElement,
  kind: "opponent" | "active" | "draw",
  occurrence?: QueuedCard,
): Promise<boolean> {
  const result = await deckDrawMotion.play({ target, kind,
    ...(occurrence ? { occurrenceId: occurrence.id } : {}) });
  return result === "completed";
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
