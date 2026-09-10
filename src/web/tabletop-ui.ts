import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { MinionCardDefinition } from "../model/cards.js";
import type { PlayerId } from "../model/state.js";
import { loadSavedSession } from "./persistence.js";
import "./tabletop-ui.css";

const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const byId = new Map(cards.map((card) => [card.id, card]));
let scheduled = false;

const app = document.querySelector("#app") ?? document.body;
new MutationObserver(scheduleSync).observe(app, { childList: true, subtree: true });
window.addEventListener("storage", scheduleSync);
window.addEventListener("cardgame:session-updated", scheduleSync);
window.addEventListener("resize", scheduleSync);
scheduleSync();

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    syncTabletopUi();
  });
}

function syncTabletopUi(): void {
  const session = loadSavedSession();
  const shell = document.querySelector<HTMLElement>(".game-shell");
  if (!session || !shell) {
    removePreview();
    return;
  }

  const active = session.state.activePlayer;
  const opponent = otherPlayer(active);
  shell.classList.add("tabletop-theme");
  shell.classList.toggle("active-p1", active === "P1");
  shell.classList.toggle("active-p2", active === "P2");

  decoratePlayerPanel(".active-hero", active);
  decoratePlayerPanel(".active-board", active);
  decoratePlayerPanel(".opponent-hero", opponent);
  decoratePlayerPanel(".opponent-board", opponent);
  decoratePlayerPanel(".hand-dock", active);
  decorateHandHeading(active);
  decorateHandoff(active);
  fanHand();
  syncSelectedCardPreview(active, session.state.players[active].hand);
}

function decoratePlayerPanel(selector: string, playerId: PlayerId): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.classList.remove("player-p1", "player-p2");
  element.classList.add(playerId === "P1" ? "player-p1" : "player-p2");
  element.dataset.playerMark = playerId;
}

function decorateHandHeading(playerId: PlayerId): void {
  const heading = document.querySelector<HTMLElement>(".hand-heading");
  if (!heading) return;
  let chip = heading.querySelector<HTMLElement>(".player-turn-chip");
  if (!chip) {
    chip = document.createElement("span");
    chip.className = "player-turn-chip";
    heading.prepend(chip);
  }
  chip.textContent = `${playerId} · 当前玩家`;

  const hint = heading.querySelector<HTMLElement>("small");
  if (hint) hint.textContent = "点牌查看完整卡面；普通召唤再点空位，献祭召唤会直接选择祭品。";
}

function decorateHandoff(playerId: PlayerId): void {
  const reveal = document.querySelector<HTMLButtonElement>("#reveal-turn");
  if (!reveal) return;
  const overlay = reveal.closest<HTMLElement>(".overlay");
  const card = reveal.closest<HTMLElement>(".overlay-card");
  if (!overlay || !card) return;

  overlay.classList.add("player-handoff");
  overlay.classList.remove("handoff-p1", "handoff-p2");
  overlay.classList.add(playerId === "P1" ? "handoff-p1" : "handoff-p2");

  let badge = card.querySelector<HTMLElement>(".handoff-player-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "handoff-player-badge";
    card.prepend(badge);
  }
  badge.textContent = playerId;
}

function fanHand(): void {
  const row = document.querySelector<HTMLElement>("#active-hand-target");
  if (!row) return;
  const handCards = [...row.querySelectorAll<HTMLElement>(".hand-card[data-hand-index]")];
  const count = handCards.length;
  if (count === 0) return;

  const rowWidth = Math.max(160, row.getBoundingClientRect().width - 14);
  const baseWidth = window.innerHeight <= 520 ? 72 : window.innerWidth >= 1100 ? 96 : 84;
  const totalWidth = count * baseWidth;
  const overlap = count > 1
    ? Math.max(0, Math.min(baseWidth * 0.78, (totalWidth - rowWidth) / (count - 1)))
    : 0;
  const center = (count - 1) / 2;
  const angleStep = count <= 7 ? 2.2 : count <= 12 ? 1.55 : 1.05;

  handCards.forEach((element, index) => {
    const distance = index - center;
    const angle = clamp(distance * angleStep, -11, 11);
    const curve = Math.min(10, Math.abs(distance) * 1.25);
    const z = 50 - Math.round(Math.abs(distance));
    element.style.setProperty("--fan-card-width", `${baseWidth}px`);
    element.style.setProperty("--fan-overlap", index === 0 ? "0px" : `${-overlap}px`);
    element.style.setProperty("--fan-angle", `${angle}deg`);
    element.style.setProperty("--fan-y", `${curve}px`);
    element.style.setProperty("--fan-z", String(z));
  });
}

function syncSelectedCardPreview(playerId: PlayerId, hand: Array<`C${string}` | `T${string}` | `E${string}` | `S${string}` | `A${string}` | `X${string}`>): void {
  const selected = document.querySelector<HTMLElement>(".hand-card.selected[data-hand-index]");
  if (!selected) {
    removePreview();
    return;
  }

  const handIndex = Number(selected.dataset.handIndex);
  if (!Number.isInteger(handIndex)) {
    removePreview();
    return;
  }
  const cardId = hand[handIndex];
  const card = cardId ? byId.get(cardId) : null;
  if (!card) {
    removePreview();
    return;
  }

  let preview = document.querySelector<HTMLElement>("#selected-card-preview");
  const previewKey = `${playerId}:${handIndex}:${card.id}`;
  if (!preview || preview.dataset.previewKey !== previewKey) {
    preview?.remove();
    preview = document.createElement("article");
    preview.id = "selected-card-preview";
    preview.className = `selected-card-preview ${playerId === "P1" ? "preview-p1" : "preview-p2"}`;
    preview.dataset.previewKey = previewKey;
    preview.innerHTML = renderFullCard(card);
    document.body.append(preview);
  }

  positionPreview(selected, preview);
}

function renderFullCard(card: MinionCardDefinition): string {
  const attributes = card.attributes.length > 0 ? card.attributes.join(" · ") : "属性未记录";
  const summon = card.summonText ?? "直接召唤";
  const effects = card.effects.length > 0
    ? card.effects.map((effect) => {
        const name = effect.name ? `<b>${escapeHtml(effect.name)}：</b>` : "";
        return `<p>${name}${escapeHtml(effect.text)}</p>`;
      }).join("")
    : "<p>无额外效果</p>";

  return `
    <div class="preview-meta"><span>${escapeHtml(card.id)}</span><span>随从</span></div>
    <div class="preview-art"><span>${escapeHtml(card.name.slice(0, 1))}</span></div>
    <div class="preview-title"><strong>${escapeHtml(card.name)}</strong><span class="preview-attrs">${escapeHtml(attributes)}</span></div>
    <div class="preview-summon">召唤：${escapeHtml(summon)}</div>
    <div class="preview-effects">${effects}</div>
    <div class="preview-stats"><span>⚔ ${card.attack ?? "?"}</span><span>♥ ${card.health ?? "?"}</span></div>
  `;
}

function positionPreview(selected: HTMLElement, preview: HTMLElement): void {
  const selectedRect = selected.getBoundingClientRect();
  const width = preview.offsetWidth || 180;
  const height = preview.offsetHeight || 240;
  const margin = 8;
  const desiredX = selectedRect.left + selectedRect.width / 2;
  const minX = width / 2 + margin;
  const maxX = window.innerWidth - width / 2 - margin;
  const left = clamp(desiredX, minX, Math.max(minX, maxX));
  const desiredTop = selectedRect.top - height - 7;
  const top = clamp(desiredTop, margin, Math.max(margin, window.innerHeight - height - margin));
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function removePreview(): void {
  document.querySelector("#selected-card-preview")?.remove();
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
