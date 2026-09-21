import { summonOptions } from '../core/summon-options.js';
import { SummonPlacementView } from './summon-placement-view.js';
import { applyHandFan } from './hand-fan-view.js';
import { presentationLocked, onPresentationLock } from "./presentation-lock.js";
import {
  canMinionAttack
} from "../core/basic-game.js";
import { PROTOTYPE_SPECIAL_BY_ID } from "../data/prototype-special-cards.js";
import type { CardId } from "../model/cards.js";
import type { MinionInstance, PlayerId, StatusState } from "../model/state.js";
import "./foundation-ab-v2.css";
import "./foundation-ab.css";
import { byId, catalog } from "./game-catalog.js";
import { dispatchGame, readSession, subscribeSession } from "./session-runtime.js";
import { onViewRendered } from "./view-events.js";


type GestureMode = "peek" | "play";

interface HandGesture {
  pointerId: number;
  source: HTMLElement;
  handIndex: number;
  cardId: CardId;
  startX: number;
  startY: number;
  x: number;
  y: number;
  lifted: boolean;
  mode: GestureMode;
  ghost: HTMLElement | null;
  dropSlot: HTMLElement | null;
  sacrificeReady: boolean;
}

let gesture: HandGesture | null = null;
let gestureFrame = 0;
let scheduled = false;
let bypassMinionInspector = false;
let handExpanded = false;
let lastActivePlayer: PlayerId | null = null;
const placement = new SummonPlacementView();
let keyboardPlacement: { handIndex: number; cardId: CardId; source: HTMLElement } | null = null;

document.body.classList.add("foundation-ab-enabled", "foundation-ab-v2-enabled");
onViewRendered(syncFoundation, 40);
window.addEventListener("resize", scheduleSync);
document.addEventListener("pointerdown", onGlobalHandPointerDown, true);
document.addEventListener("pointerdown", onPointerDown, true);
document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
document.addEventListener("pointerup", onPointerUp, true);
document.addEventListener("pointercancel", onPointerCancel, true);
document.addEventListener("click", onPlacementClick, true);
document.addEventListener("keydown", onPlacementKey, true);
document.addEventListener("focusin", event => {
  if (keyboardPlacement && event.target instanceof HTMLElement) placement.highlight(event.target.closest('[data-summon-legal]'));
}, true);
document.addEventListener("click", onHandToggleClick, true);
document.addEventListener("click", onMinionClick, true);
document.addEventListener("click", suppressLegacyHandClick, true);
document.addEventListener("click", closeInspectorFromOutside, true);
subscribeSession(() => cancelPlacement());
window.addEventListener('blur', () => cancelPlacement());
window.addEventListener('resize', () => cancelPlacement());
window.addEventListener('pagehide', () => cancelPlacement());
document.addEventListener('fullscreenchange', () => cancelPlacement());
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPlacement(); });
document.addEventListener('lostpointercapture', event => {
  if (gesture?.pointerId === event.pointerId) cleanupGesture();
}, true);
onPresentationLock(() => {
  cancelPlacement(); closeMinionInspector(); removeLegacyPreviews(); setHandExpanded(false);
});
scheduleSync();

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    syncFoundation();
  });
}

function syncFoundation(): void {
  const session = readSession();
  const shell = document.querySelector<HTMLElement>(".game-shell");
  if (!session || !shell) return;

  const active: PlayerId = shell.dataset.viewPlayer === "P2" ? "P2" : "P1";
  const opponent = otherPlayer(active);
  if (lastActivePlayer !== null && lastActivePlayer !== active) handExpanded = false;
  lastActivePlayer = active;
  syncHandExpandedState();
  shell.classList.add("foundation-ab-shell");
  shell.classList.toggle("foundation-active-p1", active === "P1");
  shell.classList.toggle("foundation-active-p2", active === "P2");
  markSide(".active-hero", active);
  markSide(".active-board", active);
  markSide(".opponent-hero", opponent);
  markSide(".opponent-board", opponent);
  markSide(".hand-dock", active);
  fanHand();
  removeLegacyPreviews();

  const inspector = document.querySelector<HTMLElement>("#ab-minion-inspector");
  if (inspector) {
    const id = inspector.dataset.instanceId;
    const owner = inspector.dataset.owner as PlayerId | undefined;
    if (!id || !owner || !findMinion(session, owner, id)) inspector.remove();
  }
}

function markSide(selector: string, playerId: PlayerId): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.classList.remove("foundation-p1", "foundation-p2");
  element.classList.add(playerId === "P1" ? "foundation-p1" : "foundation-p2");
}

function fanHand(): void {
  const row = document.querySelector<HTMLElement>("#active-hand-target");
  if (row) applyHandFan(row);
}

function onPointerDown(event: PointerEvent): void {
  if (presentationLocked()) return;
  if (gesture || (event.pointerType === "mouse" && event.button !== 0)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const source = target.closest<HTMLElement>("#active-hand-target .hand-card");
  if (!source || source.hasAttribute("disabled")) return;
  if (document.querySelector(".opening-deal-shield, .draw-animating, .overlay, #sacrifice-placement-overlay, #rule-choice-overlay, #unit-effect-overlay")) return;

  const session = readSession();
  if (presentationLocked() || !session || session.handoffRequired || session.state.winner) return;
  const handIndex = resolveHandIndex(source);
  if (handIndex < 0) return;
  const cardId = session.state.players[session.state.activePlayer].hand[handIndex];
  if (!cardId) return;

  cancelPlacement();
  closeMinionInspector();
  setHandExpanded(true);
  gesture = {
    pointerId: event.pointerId,
    source,
    handIndex,
    cardId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    lifted: false,
    mode: "peek",
    ghost: null,
    dropSlot: null,
    sacrificeReady: false,
  };
  source.classList.add("ab-touching");
  applyHandFocus(source);
  try { source.setPointerCapture(event.pointerId); } catch { /* optional */ }
}

function onPointerMove(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const points = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  const latest = points.length > 0 ? points[points.length - 1]! : event;
  gesture.x = latest.clientX;
  gesture.y = latest.clientY;

  const lift = gesture.startY - gesture.y;
  const horizontal = Math.abs(gesture.x - gesture.startX);
  if (!gesture.lifted && (lift > 6 || horizontal > 10)) {
    gesture.lifted = true;
    gesture.source.classList.add("ab-drag-source");
    document.body.classList.add("ab-hand-peek-active");
    gesture.ghost = createLiftedCard(gesture.cardId);
    document.body.append(gesture.ghost);
  }
  if (!gesture.lifted) return;

  event.preventDefault();
  scheduleGestureFrame();
}

function scheduleGestureFrame(): void {
  if (gestureFrame) return;
  gestureFrame = requestAnimationFrame(() => {
    gestureFrame = 0;
    if (!gesture?.lifted) return;
    updateGestureMode(gesture);
    if (gesture.mode === "play") updateDropTarget(gesture);
    else clearDropTarget(gesture);
    updateLiftedCardPosition(gesture);
  });
}

function updateGestureMode(current: HandGesture): void {
  const board = document.querySelector<HTMLElement>(".active-board");
  const minion = byId.get(current.cardId);
  const canEnterPlay = Boolean(minion);
  const boardBottom = board?.getBoundingClientRect().bottom ?? window.innerHeight * 0.68;
  const nextMode: GestureMode = canEnterPlay && current.y <= boardBottom + 18 ? "play" : "peek";
  if (nextMode === current.mode) return;

  current.mode = nextMode;
  document.body.classList.toggle("ab-hand-peek-active", nextMode === "peek");
  document.body.classList.toggle("ab-hand-gesture-active", nextMode === "play");
  current.ghost?.classList.toggle("ab-v2-play", nextMode === "play");
  current.ghost?.classList.toggle("ab-v2-peek", nextMode === "peek");
  updateGestureLabel(current);
}

function updateLiftedCardPosition(current: HandGesture): void {
  if (!current.ghost) return;
  const halfWidth = Math.min(110, Math.max(82, current.ghost.offsetWidth / 2));
  const x = clamp(current.x, halfWidth + 8, window.innerWidth - halfWidth - 8);
  const fingerGap = current.mode === "play" ? 10 : 18;
  const y = clamp(current.y - fingerGap, 170, window.innerHeight - 38);
  const liftProgress = easeOut(clamp(liftDistance(current) / 92, 0, 1));
  const scale = current.mode === "play" ? 0.92 : 0.82 + liftProgress * 0.18;
  current.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%) scale(${scale})`;
  current.ghost.classList.toggle("ab-v2-play", current.mode === "play");
  current.ghost.classList.toggle("ab-v2-peek", current.mode === "peek");
  updateGestureLabel(current);
}

function updateGestureLabel(current: HandGesture): void {
  const label = current.ghost?.querySelector<HTMLElement>(".ab-gesture-state");
  if (!label) return;
  if (current.mode === "peek") {
    label.textContent = "查看中 · 继续向上拖进入出牌";
    return;
  }
  const options = summonOptions(readSession(), catalog, current.handIndex, current.cardId);
  if (options.kind === 'blocked') label.textContent = options.reason;
  else if (options.kind === 'sacrifice') label.textContent = current.sacrificeReady
    ? `松手选择${options.count}只祭品` : '献祭召唤 · 拖入己方战场';
  else label.textContent = current.dropSlot ? `松手召唤 · ${Number(current.dropSlot.dataset.emptySlot)+1}号位` : '出牌 · 拖到亮起的空位';
}

function onPointerUp(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const current = gesture;
  if (current.lifted) {
    event.preventDefault();
    // Resolve the actual release position, not a target cached by an older rAF.
    current.x = event.clientX; current.y = event.clientY;
    updateGestureMode(current);
    if (current.mode === "play") { updateDropTarget(current); resolveGestureDrop(current); }
  }
  cleanupGesture();
}

function onPointerCancel(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  cleanupGesture();
}

function resolveGestureDrop(current: HandGesture): void {
  if (presentationLocked()) return;
  const options = summonOptions(readSession(), catalog, current.handIndex, current.cardId);
  if (options.kind === 'blocked') { showToast(options.reason); return; }
  if (options.kind === 'sacrifice') {
    if (current.sacrificeReady) window.dispatchEvent(new CustomEvent('cardgame:request-sacrifice', { detail: { handIndex: current.handIndex } }));
    return;
  }
  const slot = current.dropSlot?.dataset.emptySlot;
  if (slot === undefined || !options.slots.includes(Number(slot))) return;
  const error = dispatchGame({ type: 'summon', handIndex: current.handIndex, cardId: current.cardId, slotIndex: Number(slot) });
  if (error) showToast(error);
}

function updateDropTarget(current: HandGesture): void {
  current.dropSlot = null; current.sacrificeReady = false;
  const options = summonOptions(readSession(), catalog, current.handIndex, current.cardId);
  placement.show(options);
  const hit = placement.hit(current.x, current.y);
  placement.highlight(hit);
  if (options.kind === 'direct') current.dropSlot = hit;
  else if (options.kind === 'sacrifice') {
    const board = document.querySelector<HTMLElement>('.active-board')?.getBoundingClientRect();
    current.sacrificeReady = Boolean(board && current.x >= board.left && current.x <= board.right && current.y >= board.top && current.y <= board.bottom);
  }
}

function clearDropTarget(current: HandGesture): void {
  current.dropSlot = null; current.sacrificeReady = false;
  placement.clear();
}

function cancelPlacement(restoreFocus = false): void {
  const source = keyboardPlacement?.source;
  keyboardPlacement = null;
  cleanupGesture(); placement.clear();
  if (restoreFocus && source?.isConnected) source.focus({ preventScroll: true });
}

/** Native keyboard selection supplements the existing swipe-to-view/drag-to-play
 * touch gesture. Tap/ordinary click on a hand keeps its existing semantics. */
function onPlacementKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && (gesture || keyboardPlacement)) {
    event.preventDefault(); event.stopImmediatePropagation(); cancelPlacement(true); return;
  }
  if (presentationLocked()) return;
  // Holding the selection key must not confirm the newly focused slot.
  if (keyboardPlacement && event.repeat && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (keyboardPlacement && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const slots = [...document.querySelectorAll<HTMLElement>('.active-board [data-summon-legal]')];
    const index = slots.indexOf(document.activeElement as HTMLElement);
    const next = slots[(index + (event.key === 'ArrowRight' ? 1 : slots.length-1)) % slots.length];
    if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
    return;
  }
  if (!['Enter', ' '].includes(event.key) || !target?.closest('#active-hand-target .hand-card')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.repeat || document.querySelector('#sacrifice-placement-overlay,#rule-choice-overlay,#unit-effect-overlay')) return;
  const source = target.closest<HTMLButtonElement>('.hand-card')!;
  if (source.disabled) return;
  const handIndex = resolveHandIndex(source), cardId = readSession().state.players[readSession().state.activePlayer].hand[handIndex];
  cancelPlacement();
  if (!cardId) return;
  const options = summonOptions(readSession(), catalog, handIndex, cardId);
  if (options.kind === 'blocked') { showToast(options.reason); return; }
  if (options.kind === 'sacrifice') {
    window.dispatchEvent(new CustomEvent('cardgame:request-sacrifice', { detail: { handIndex } })); return;
  }
  keyboardPlacement = { handIndex, cardId, source };
  placement.show(options); placement.first()?.focus({ preventScroll: true });
}

function onPlacementClick(event: MouseEvent): void {
  if (!keyboardPlacement) return;
  const target = event.target instanceof Element ? event.target : null;
  const slot = target?.closest<HTMLElement>('.active-board [data-empty-slot][data-summon-legal]');
  if (!slot) { cancelPlacement(); return; }
  event.preventDefault(); event.stopImmediatePropagation();
  const intent = keyboardPlacement, slotIndex = Number(slot.dataset.emptySlot);
  const options = summonOptions(readSession(), catalog, intent.handIndex, intent.cardId);
  cancelPlacement();
  if (presentationLocked() || options.kind !== 'direct' || !options.slots.includes(slotIndex)) return;
  const error = dispatchGame({ type: 'summon', handIndex: intent.handIndex, cardId: intent.cardId, slotIndex });
  if (error) showToast(error);
}

function createLiftedCard(cardId: CardId): HTMLElement {
  const article = document.createElement("article");
  const minion = byId.get(cardId);
  const special = PROTOTYPE_SPECIAL_BY_ID.get(cardId);
  const frameClass = minion
    ? frameClassForSeries(minion.series)
    : special?.type === "evolution_stone"
      ? "ef-type-evolution"
      : "ef-type-attack";
  article.className = `ab-lift-card ab-v2-gesture-card ab-v2-peek ef-frame ${frameClass} ${special ? "ab-lift-special" : "ab-lift-minion"}`;

  if (minion) {
    const series = minion.series?.trim() || "随从";
    const attributes = minion.attributes.length ? minion.attributes.join(" · ") : "";
    const summon = minion.summonText || "直接召唤";
    const effects = minion.effects.length
      ? minion.effects.map((effect) => `<p>${effect.name ? `<b>${escapeHtml(effect.name)}</b> ` : ""}${escapeHtml(effect.text)}</p>`).join("")
      : "<p>无额外技能</p>";
    article.innerHTML = `
      <div class="ab-gesture-state">查看中 · 继续向上拖进入出牌</div>
      <div class="ab-lift-series">${escapeHtml(series)}</div>
      <div class="ab-lift-art"><span>${escapeHtml(minion.name.slice(0, 1))}</span></div>
      <div class="ab-lift-name"><strong>${escapeHtml(minion.name)}</strong><small>${escapeHtml(attributes)}</small></div>
      <div class="ab-lift-summon">${escapeHtml(summon)}</div>
      <div class="ab-lift-effects">${effects}</div>
      <div class="ab-lift-stats"><span>${minion.attack ?? "?"}</span><span>${minion.health ?? "?"}</span></div>
    `;
  } else if (special) {
    article.innerHTML = `
      <div class="ab-gesture-state">查看中 · 当前效果尚未开放出牌</div>
      <div class="ab-lift-series">${escapeHtml(special.displayType)}</div>
      <div class="ab-lift-art special"><span>${special.type === "evolution_stone" ? "◇" : "攻"}</span></div>
      <div class="ab-lift-name"><strong>${escapeHtml(special.name)}</strong></div>
      <div class="ab-lift-effects"><p>${escapeHtml(special.rulesText)}</p></div>
      <div class="ab-lift-stats single"><span>当前仅展示</span></div>
    `;
  } else {
    article.innerHTML = `<div class="ab-gesture-state">查看</div><div class="ab-lift-name"><strong>${escapeHtml(cardId)}</strong></div>`;
  }
  return article;
}

function frameClassForSeries(series: string | null | undefined): string {
  const normalized = series?.trim() ?? "";
  if (normalized === "龙神") return "ef-series-dragon";
  if (normalized === "史前巨兽") return "ef-series-prehistoric";
  return "ef-series-base";
}

function onHandToggleClick(event: MouseEvent): void {
  if (presentationLocked()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest<HTMLElement>(".stage04-hand-toggle");
  if (!toggle) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  setHandExpanded(!handExpanded);
}

function onGlobalHandPointerDown(event: PointerEvent): void {
  if (keyboardPlacement && (!(event.target instanceof Element) || !event.target.closest('[data-summon-legal]'))) cancelPlacement();
  if (!handExpanded || gesture) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".hand-dock, .ab-lift-card")) return;
  setHandExpanded(false);
}

function setHandExpanded(expanded: boolean): void {
  handExpanded = expanded;
  syncHandExpandedState();
  requestAnimationFrame(fanHand);
}

function syncHandExpandedState(): void {
  document.body.classList.toggle("stage04-hand-expanded", handExpanded);
  const toggle = document.querySelector<HTMLElement>(".stage04-hand-toggle");
  toggle?.setAttribute("aria-expanded", handExpanded ? "true" : "false");
  toggle?.classList.toggle("is-expanded", handExpanded);
}

function suppressLegacyHandClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(".hand-card")) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  removeLegacyPreviews();
}

function onMinionClick(event: MouseEvent): void {
  if (presentationLocked()) return;
  if (bypassMinionInspector) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#ab-minion-inspector")) return;
  const minionElement = target.closest<HTMLElement>("[data-minion-id]");
  if (!minionElement) return;

  // Once an attacker has already been deliberately selected, enemy clicks remain attacks.
  if (minionElement.classList.contains("enemy-target")) return;

  const instanceId = minionElement.dataset.minionId;
  const owner = minionElement.dataset.owner as PlayerId | undefined;
  if (!instanceId || !owner) return;
  const session = readSession();
  if (!session) return;
  const minion = findMinion(session, owner, instanceId);
  if (!minion) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showMinionInspector(minionElement, minion, owner, session);
}

function showMinionInspector(anchor: HTMLElement, minion: MinionInstance, owner: PlayerId, session: NonNullable<ReturnType<typeof readSession>>): void {
  closeMinionInspector();
  const card = byId.get(minion.cardId);
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  const baseHealth = card?.health ?? minion.currentHealth;
  const fast = minion.statuses.some((status) => status.keyword === "fast_attack");
  const maxAttacks = fast ? 2 : 1;
  const remaining = Math.max(0, maxAttacks - minion.attacksUsedThisTurn);
  const activeOwner = owner === session.state.activePlayer;
  const canAttackNow = activeOwner && !session.handoffRequired && canMinionAttack(session, minion, catalog);
  const statusHtml = minion.statuses.length
    ? minion.statuses.map((status) => `<span class="ab-status-chip">${escapeHtml(formatStatus(status, session, minion))}</span>`).join("")
    : `<span class="ab-status-empty">当前无额外状态</span>`;
  const skills = card?.effects.length
    ? card.effects.map((effect) => `<p>${effect.name ? `<b>${escapeHtml(effect.name)}：</b>` : ""}${escapeHtml(effect.text)}</p>`).join("")
    : `<p>无额外技能</p>`;

  const inspector = document.createElement("aside");
  inspector.id = "ab-minion-inspector";
  inspector.className = owner === "P1" ? "ab-minion-inspector inspector-p1" : "ab-minion-inspector inspector-p2";
  inspector.dataset.instanceId = minion.instanceId;
  inspector.dataset.owner = owner;
  inspector.innerHTML = `
    <div class="ab-inspector-head">
      <div><small>${owner === session.state.activePlayer ? "己方随从" : "敌方随从"}</small><strong>${escapeHtml(card?.name ?? minion.cardId)}</strong></div>
      <button type="button" class="ab-inspector-close" aria-label="关闭">×</button>
    </div>
    <div class="ab-inspector-stats">
      <span>⚔ <b>${attack}</b>${minion.attackModifier !== 0 ? `<small> (${minion.attackModifier > 0 ? "+" : ""}${minion.attackModifier})</small>` : ""}</span>
      <span>♥ <b>${minion.currentHealth}</b><small> / ${baseHealth}</small></span>
    </div>
    <div class="ab-inspector-action-state">${canAttackNow ? `可攻击 · 剩余 ${remaining}/${maxAttacks} 次` : actionStateText(minion, session, owner, remaining, maxAttacks)}</div>
    <div class="ab-inspector-statuses">${statusHtml}</div>
    <div class="ab-inspector-skills">${skills}</div>
    ${canAttackNow ? `<button type="button" class="ab-inspector-attack">选择攻击</button>` : ""}
  `;
  document.body.append(inspector);
  positionInspector(anchor, inspector);

  inspector.querySelector<HTMLButtonElement>(".ab-inspector-close")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    inspector.remove();
  });
  inspector.querySelector<HTMLButtonElement>(".ab-inspector-attack")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    inspector.remove();
    bypassMinionInspector = true;
    anchor.click();
    queueMicrotask(() => { bypassMinionInspector = false; });
  });
}

function actionStateText(minion: MinionInstance, session: NonNullable<ReturnType<typeof readSession>>, owner: PlayerId, remaining: number, max: number): string {
  if (owner !== session.state.activePlayer) return "等待对方回合";
  if (session.handoffRequired) return "等待回合交接";
  if (minion.summonedOnTurn === session.state.turn && !minion.statuses.some((status) => status.keyword === "haste")) return "刚上场 · 本回合不能攻击";
  if (remaining <= 0) return `本回合攻击已用完 ${max}/${max}`;
  if (minion.statuses.some((status) => ["sleep", "freeze", "petrify"].includes(status.keyword))) return "当前受控制状态影响";
  return `当前不可攻击 · 剩余 ${remaining}/${max} 次`;
}

function formatStatus(status: StatusState, session: NonNullable<ReturnType<typeof readSession>>, minion: MinionInstance): string {
  const labels: Record<string, string> = {
    fast_attack: "快攻",
    haste: "迅疾",
    taunt: "嘲讽",
    arrogance: "狂妄",
    guard: "守护",
    armor_1: "甲一",
    armor_2: "甲二",
    lifesteal: "吸血",
    drain: "汲取",
    spirit: "灵体",
    stealth: "隐匿",
    scout: "侦察",
    sure_hit: "必中",
    execution: "必杀",
    sleep: "沉睡",
    freeze: "冰冻",
    petrify: "石化",
    deathrattle: "亡语",
  };
  const base = labels[status.keyword] ?? status.keyword;
  if (status.keyword === "guard") return `${base}${(status.charges ?? 0) > 0 ? ` ×${status.charges}` : " · 已消耗"}`;
  if (status.activeFromOwnTurn !== undefined && status.expiresAfterOwnTurn !== undefined) {
    const ownTurn = session.turnsStarted[minion.controller];
    if (ownTurn < status.activeFromOwnTurn) return `${base} · 下回合生效`;
    if (ownTurn <= status.expiresAfterOwnTurn) return `${base} · 生效中`;
  }
  if (status.remainingOwnTurns !== undefined) return `${base} · ${status.remainingOwnTurns}回合`;
  return base;
}

function positionInspector(anchor: HTMLElement, inspector: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = inspector.offsetWidth || 230;
  const height = inspector.offsetHeight || 220;
  const margin = 10;
  const preferRight = rect.right + width + margin <= window.innerWidth;
  const left = preferRight ? rect.right + 8 : rect.left - width - 8;
  const top = clamp(rect.top + rect.height / 2 - height / 2, margin, Math.max(margin, window.innerHeight - height - margin));
  inspector.style.left = `${clamp(left, margin, window.innerWidth - width - margin)}px`;
  inspector.style.top = `${top}px`;
}

function closeInspectorFromOutside(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#ab-minion-inspector, [data-minion-id]")) return;
  closeMinionInspector();
}

function closeMinionInspector(): void {
  document.querySelector("#ab-minion-inspector")?.remove();
}

function findMinion(session: NonNullable<ReturnType<typeof readSession>>, owner: PlayerId, instanceId: string): MinionInstance | null {
  const player = session.state.players[owner];
  return player.board.find((minion) => minion?.instanceId === instanceId) ?? player.overflowMinions.find((minion) => minion.instanceId === instanceId) ?? null;
}

function applyHandFocus(source: HTMLElement): void {
  const row = source.parentElement;
  if (!row) return;
  const cards = [...row.querySelectorAll<HTMLElement>(".hand-card")];
  const sourceIndex = cards.indexOf(source);
  if (sourceIndex < 0 || cards.length < 8) return;

  const maxShift = cards.length >= 20 ? 28 : cards.length >= 14 ? 22 : 16;
  cards.forEach((card, index) => {
    const delta = index - sourceIndex;
    if (delta === 0) {
      card.style.setProperty("--stage04-focus-x", "0px");
      return;
    }
    const distance = Math.abs(delta);
    const shift = Math.max(0, maxShift - (distance - 1) * 6);
    card.style.setProperty("--stage04-focus-x", `${delta < 0 ? -shift : shift}px`);
  });
}

function clearHandFocus(): void {
  document.querySelectorAll<HTMLElement>("#active-hand-target .hand-card").forEach((card) => {
    card.style.removeProperty("--stage04-focus-x");
  });
}

function cleanupGesture(): void {
  const current = gesture;
  if (!current) return;
  gesture = null;
  const collapseAfterPlay = current.lifted && current.mode === 'play';
  if (gestureFrame) cancelAnimationFrame(gestureFrame);
  gestureFrame = 0;
  current.source.classList.remove('ab-touching', 'ab-drag-source');
  clearHandFocus(); clearDropTarget(current); current.ghost?.remove();
  document.body.classList.remove('ab-hand-peek-active', 'ab-hand-gesture-active');
  try { current.source.releasePointerCapture(current.pointerId); } catch { /* optional */ }
  if (collapseAfterPlay) setHandExpanded(false);
}

function resolveHandIndex(source: HTMLElement): number {
  const explicit = source.dataset.handIndex ?? source.dataset.prototypeHandIndex;
  if (explicit !== undefined) {
    const value = Number(explicit);
    if (Number.isInteger(value)) return value;
  }
  const row = source.parentElement;
  if (!row) return -1;
  return [...row.querySelectorAll<HTMLElement>(".hand-card")].indexOf(source);
}

function removeLegacyPreviews(): void {
  document.querySelector("#selected-card-preview")?.remove();
  document.querySelector("#prototype-special-preview")?.remove();
}

function showToast(message: string): void {
  document.querySelector("#ab-foundation-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "ab-foundation-toast";
  toast.className = "ab-foundation-toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

function liftDistance(current: HandGesture): number {
  return Math.max(0, current.startY - current.y);
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '\"': "&quot;",
  })[char] ?? char);
}
