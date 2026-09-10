import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { createCatalog, getSummonRequirement, summonFromHand } from "../core/basic-game.js";
import { PROTOTYPE_SPECIAL_BY_ID } from "../data/prototype-special-cards.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { PlayerId } from "../model/state.js";
import { loadSavedSession, saveSession } from "./persistence.js";
import "./foundation-ab.css";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const catalog = createCatalog(cards);
const byId = new Map(cards.map((card) => [card.id, card]));

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
  ghost: HTMLElement | null;
  dropSlot: HTMLElement | null;
  sacrificeReady: boolean;
}

let gesture: HandGesture | null = null;
let scheduled = false;

document.body.classList.add("foundation-ab-enabled");
const app = document.querySelector("#app") ?? document.body;
new MutationObserver(scheduleSync).observe(app, { childList: true, subtree: true });
window.addEventListener("resize", scheduleSync);
window.addEventListener("storage", scheduleSync);
window.addEventListener("cardgame:session-updated", scheduleSync);
document.addEventListener("pointerdown", onPointerDown, true);
document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
document.addEventListener("pointerup", onPointerUp, true);
document.addEventListener("pointercancel", onPointerCancel, true);
document.addEventListener("click", suppressLegacyHandClick, true);
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
  const session = loadSavedSession();
  const shell = document.querySelector<HTMLElement>(".game-shell");
  if (!session || !shell) return;

  const active = session.state.activePlayer;
  const opponent = otherPlayer(active);
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
}

function markSide(selector: string, playerId: PlayerId): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.classList.remove("foundation-p1", "foundation-p2");
  element.classList.add(playerId === "P1" ? "foundation-p1" : "foundation-p2");
}

function fanHand(): void {
  const row = document.querySelector<HTMLElement>("#active-hand-target");
  if (!row) return;
  const handCards = [...row.querySelectorAll<HTMLElement>(".hand-card")];
  const count = handCards.length;
  if (count === 0) return;

  const available = Math.max(260, Math.min(window.innerWidth * 0.78, 940));
  const baseWidth = window.innerHeight <= 500 ? 78 : window.innerWidth >= 1100 ? 104 : 90;
  const natural = count * baseWidth;
  const overlap = count > 1 ? clamp((natural - available) / (count - 1), 0, baseWidth * 0.78) : 0;
  const center = (count - 1) / 2;
  const angleStep = count <= 8 ? 2.2 : count <= 13 ? 1.45 : 0.95;

  handCards.forEach((card, index) => {
    const distance = index - center;
    card.style.setProperty("--ab-width", `${baseWidth}px`);
    card.style.setProperty("--ab-overlap", index === 0 ? "0px" : `${-overlap}px`);
    card.style.setProperty("--ab-angle", `${clamp(distance * angleStep, -10, 10)}deg`);
    card.style.setProperty("--ab-y", `${Math.min(10, Math.abs(distance) * 1.15)}px`);
    card.style.setProperty("--ab-z", String(100 - Math.round(Math.abs(distance))));
  });
}

function suppressLegacyHandClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".hand-card")) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  removeLegacyPreviews();
}

function onPointerDown(event: PointerEvent): void {
  if (gesture || (event.pointerType === "mouse" && event.button !== 0)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const source = target.closest<HTMLElement>("#active-hand-target .hand-card");
  if (!source) return;
  if (document.querySelector(".opening-deal-shield, .overlay, #sacrifice-placement-overlay, #rule-choice-overlay, #unit-effect-overlay")) return;

  const session = loadSavedSession();
  if (!session || session.handoffRequired || session.state.winner) return;
  const handIndex = resolveHandIndex(source);
  if (handIndex < 0) return;
  const cardId = session.state.players[session.state.activePlayer].hand[handIndex];
  if (!cardId) return;

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
    ghost: null,
    dropSlot: null,
    sacrificeReady: false,
  };
  source.classList.add("ab-touching");
  try { source.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
}

function onPointerMove(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  gesture.x = event.clientX;
  gesture.y = event.clientY;
  const lift = gesture.startY - event.clientY;
  const horizontal = Math.abs(event.clientX - gesture.startX);

  if (!gesture.lifted && (lift > 12 || horizontal > 14)) {
    gesture.lifted = true;
    gesture.source.classList.add("ab-drag-source");
    document.body.classList.add("ab-hand-gesture-active");
    gesture.ghost = createLiftedCard(gesture.cardId);
    document.body.append(gesture.ghost);
  }
  if (!gesture.lifted) return;

  event.preventDefault();
  updateLiftedCardPosition(gesture);
  updateDropTarget(gesture);
}

function onPointerUp(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const current = gesture;
  if (current.lifted) {
    event.preventDefault();
    void resolveGestureDrop(current);
  }
  cleanupGesture();
}

function onPointerCancel(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  cleanupGesture();
}

async function resolveGestureDrop(current: HandGesture): Promise<void> {
  const session = loadSavedSession();
  if (!session || session.handoffRequired || session.state.winner) return;
  const active = session.state.activePlayer;
  const currentCardId = session.state.players[active].hand[current.handIndex];
  if (currentCardId !== current.cardId) return;

  const minion = byId.get(current.cardId);
  if (minion) {
    const requirement = getSummonRequirement(minion);
    if (requirement.unsupportedReason) {
      if (liftDistance(current) > 70) showToast(requirement.unsupportedReason);
      return;
    }

    if (requirement.sacrificeCount > 0) {
      if (current.sacrificeReady) {
        window.dispatchEvent(new CustomEvent("cardgame:request-sacrifice", {
          detail: { handIndex: current.handIndex },
        }));
      }
      return;
    }

    if (!current.dropSlot) return;
    const slotIndex = Number(current.dropSlot.dataset.emptySlot);
    if (!Number.isInteger(slotIndex)) return;
    const error = summonFromHand(session, catalog, current.handIndex, slotIndex);
    if (error) {
      showToast(error);
      return;
    }
    saveAndSync(session);
    showToast(`已召唤「${minion.name}」。`);
    return;
  }

  const special = PROTOTYPE_SPECIAL_BY_ID.get(current.cardId);
  if (special && liftDistance(current) > 60) {
    showToast(`「${special.name}」当前可查看，但效果尚未进入本阶段的出牌实现。`);
  }
}

function updateDropTarget(current: HandGesture): void {
  current.dropSlot?.classList.remove("ab-drop-target");
  current.dropSlot = null;
  current.sacrificeReady = false;
  document.querySelector(".active-board")?.classList.remove("ab-sacrifice-drop-ready");

  const minion = byId.get(current.cardId);
  if (!minion) return;
  const requirement = getSummonRequirement(minion);
  if (requirement.unsupportedReason) return;

  const element = document.elementFromPoint(current.x, current.y);
  if (!(element instanceof Element)) return;

  if (requirement.sacrificeCount > 0) {
    const board = element.closest<HTMLElement>(".active-board");
    if (board) {
      current.sacrificeReady = true;
      board.classList.add("ab-sacrifice-drop-ready");
    }
    return;
  }

  const slot = element.closest<HTMLElement>(".active-board [data-empty-slot]");
  if (!slot || slot.hasAttribute("disabled")) return;
  current.dropSlot = slot;
  slot.classList.add("ab-drop-target");
}

function createLiftedCard(cardId: CardId): HTMLElement {
  const article = document.createElement("article");
  const minion = byId.get(cardId);
  const special = PROTOTYPE_SPECIAL_BY_ID.get(cardId);
  article.className = `ab-lift-card ${special ? "ab-lift-special" : "ab-lift-minion"}`;

  if (minion) {
    const series = minion.series?.trim() || "随从";
    const attributes = minion.attributes.length ? minion.attributes.join(" · ") : "";
    const summon = minion.summonText || "直接召唤";
    const effects = minion.effects.length
      ? minion.effects.map((effect) => `<p>${effect.name ? `<b>${escapeHtml(effect.name)}</b> ` : ""}${escapeHtml(effect.text)}</p>`).join("")
      : "<p>无额外技能</p>";
    article.innerHTML = `
      <div class="ab-lift-series">${escapeHtml(series)}</div>
      <div class="ab-lift-art"><span>${escapeHtml(minion.name.slice(0, 1))}</span></div>
      <div class="ab-lift-name"><strong>${escapeHtml(minion.name)}</strong><small>${escapeHtml(attributes)}</small></div>
      <div class="ab-lift-summon">${escapeHtml(summon)}</div>
      <div class="ab-lift-effects">${effects}</div>
      <div class="ab-lift-stats"><span>⚔ ${minion.attack ?? "?"}</span><span>♥ ${minion.health ?? "?"}</span></div>
    `;
  } else if (special) {
    article.innerHTML = `
      <div class="ab-lift-series">${escapeHtml(special.displayType)}</div>
      <div class="ab-lift-art special"><span>${special.type === "evolution_stone" ? "◇" : "⚔"}</span></div>
      <div class="ab-lift-name"><strong>${escapeHtml(special.name)}</strong></div>
      <div class="ab-lift-effects"><p>${escapeHtml(special.rulesText)}</p></div>
      <div class="ab-lift-stats single"><span>当前仅展示</span></div>
    `;
  } else {
    article.innerHTML = `<div class="ab-lift-name"><strong>${escapeHtml(cardId)}</strong></div>`;
  }
  return article;
}

function updateLiftedCardPosition(current: HandGesture): void {
  if (!current.ghost) return;
  const x = clamp(current.x, 96, window.innerWidth - 96);
  const topLimit = window.innerHeight <= 500 ? 250 : 310;
  const y = clamp(current.y - 18, topLimit, window.innerHeight - 88);
  const lift = clamp(liftDistance(current) / 130, 0, 1);
  current.ghost.style.left = `${x}px`;
  current.ghost.style.top = `${y}px`;
  current.ghost.style.setProperty("--ab-lift-scale", String(0.88 + lift * 0.12));
  current.ghost.classList.toggle("ab-lift-playing", lift > 0.72);
}

function cleanupGesture(): void {
  if (!gesture) return;
  gesture.source.classList.remove("ab-touching", "ab-drag-source");
  gesture.dropSlot?.classList.remove("ab-drop-target");
  document.querySelector(".active-board")?.classList.remove("ab-sacrifice-drop-ready");
  gesture.ghost?.remove();
  document.body.classList.remove("ab-hand-gesture-active");
  try { gesture.source.releasePointerCapture(gesture.pointerId); } catch { /* optional */ }
  gesture = null;
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

function saveAndSync(session: NonNullable<ReturnType<typeof loadSavedSession>>): void {
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
    window.dispatchEvent(new CustomEvent("cardgame:session-updated"));
  }
  window.dispatchEvent(new CustomEvent("cardgame:session-updated"));
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
  window.setTimeout(() => toast.remove(), 2600);
}

function liftDistance(current: HandGesture): number {
  return Math.max(0, current.startY - current.y);
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
