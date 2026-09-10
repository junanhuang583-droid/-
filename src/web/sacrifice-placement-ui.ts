import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { createCatalog, getSummonRequirement, type BasicGameSession } from "../core/basic-game.js";
import { summonIntoSacrificedSlot } from "../core/sacrifice-placement.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { MinionInstance } from "../model/state.js";
import { loadSavedSession, saveSession } from "./persistence.js";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const catalog = createCatalog(cards);
const selectedSacrifices = new Set<string>();
let pending: { handIndex: number; cardId: CardId; sacrificeCount: number } | null = null;
let suppressAutoOpen = false;

document.addEventListener("click", interceptSacrificeFlow, true);

function interceptSacrificeFlow(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const handCard = target.closest<HTMLElement>("[data-hand-index]");
  if (handCard) {
    if (!suppressAutoOpen) queueMicrotask(openFromSelectedHandCard);
    return;
  }

  const emptySlot = target.closest<HTMLElement>("[data-empty-slot]");
  if (!emptySlot) return;
  const selectedCard = document.querySelector<HTMLElement>(".hand-card.selected[data-hand-index]");
  if (!selectedCard) return;
  const details = sacrificeDetailsForElement(selectedCard);
  if (!details) return;

  // Sacrifice summons no longer require choosing an empty destination. Stop the
  // old empty-slot flow and open the sacrifice picker instead.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openPicker(details);
}

function openFromSelectedHandCard(): void {
  if (suppressAutoOpen || document.querySelector("#sacrifice-placement-overlay")) return;
  if (document.querySelector("#rule-choice-overlay, #unit-effect-overlay")) return;
  const selectedCard = document.querySelector<HTMLElement>(".hand-card.selected[data-hand-index]");
  if (!selectedCard) return;
  const details = sacrificeDetailsForElement(selectedCard);
  if (details) openPicker(details);
}

function sacrificeDetailsForElement(element: HTMLElement): { handIndex: number; cardId: CardId; sacrificeCount: number } | null {
  const handIndex = Number(element.dataset.handIndex);
  if (!Number.isInteger(handIndex)) return null;
  const session = loadSavedSession();
  if (!session || session.handoffRequired || session.state.winner) return null;
  const cardId = session.state.players[session.state.activePlayer].hand[handIndex];
  if (!cardId) return null;
  const card = catalog.cards.get(cardId);
  if (!card) return null;
  const requirement = getSummonRequirement(card);
  if (requirement.unsupportedReason || requirement.sacrificeCount <= 0) return null;
  return { handIndex, cardId, sacrificeCount: requirement.sacrificeCount };
}

function openPicker(details: { handIndex: number; cardId: CardId; sacrificeCount: number }): void {
  const session = loadSavedSession();
  const card = catalog.cards.get(details.cardId);
  if (!session || !card) return;
  const player = session.state.players[session.state.activePlayer];
  const available = player.board.filter(Boolean).length;
  if (available < details.sacrificeCount) {
    showToast(`「${card.name}」需要献祭 ${details.sacrificeCount} 只己方随从，当前场上数量不足。`);
    return;
  }

  pending = details;
  selectedSacrifices.clear();
  document.querySelector("#rule-choice-overlay")?.remove();
  document.querySelector("#sacrifice-placement-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "sacrifice-placement-overlay";
  overlay.className = "sacrifice-placement-overlay";
  overlay.innerHTML = `
    <section class="sacrifice-placement-card">
      <div class="sacrifice-kicker">献祭召唤 · 落位规则</div>
      <h2>召唤「${escapeHtml(card.name)}」</h2>
      <p>选择 ${details.sacrificeCount} 只己方随从。新随从会直接落在被献祭的位置；献祭多只时，落在最左侧被献祭随从的位置。</p>
      <div class="sacrifice-placement-grid">
        ${player.board.map((minion, index) => minion ? sacrificeOption(minion, index) : "").join("")}
      </div>
      <div class="sacrifice-placement-footer">
        <span id="sacrifice-placement-count">已选 0 / ${details.sacrificeCount}</span>
        <button id="sacrifice-placement-cancel" type="button">取消</button>
        <button id="sacrifice-placement-confirm" class="primary" type="button" disabled>确认献祭并召唤</button>
      </div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-sacrifice-placement-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const instanceId = button.dataset.sacrificePlacementId;
      if (!instanceId || !pending) return;
      if (selectedSacrifices.has(instanceId)) selectedSacrifices.delete(instanceId);
      else if (selectedSacrifices.size < pending.sacrificeCount) selectedSacrifices.add(instanceId);
      button.classList.toggle("selected", selectedSacrifices.has(instanceId));
      updatePickerCount(overlay);
    });
  });

  overlay.querySelector<HTMLButtonElement>("#sacrifice-placement-cancel")?.addEventListener("click", () => {
    pending = null;
    selectedSacrifices.clear();
    overlay.remove();
  });

  overlay.querySelector<HTMLButtonElement>("#sacrifice-placement-confirm")?.addEventListener("click", () => {
    resolveSacrificeSummon(overlay);
  });
}

function updatePickerCount(overlay: HTMLElement): void {
  if (!pending) return;
  const count = overlay.querySelector<HTMLElement>("#sacrifice-placement-count");
  if (count) count.textContent = `已选 ${selectedSacrifices.size} / ${pending.sacrificeCount}`;
  const confirm = overlay.querySelector<HTMLButtonElement>("#sacrifice-placement-confirm");
  if (confirm) confirm.disabled = selectedSacrifices.size !== pending.sacrificeCount;

  const session = loadSavedSession();
  if (!session) return;
  const player = session.state.players[session.state.activePlayer];
  const selectedSlots = [...selectedSacrifices]
    .map((id) => player.board.findIndex((minion) => minion?.instanceId === id))
    .filter((slot) => slot >= 0);
  const destination = selectedSlots.length > 0 ? Math.min(...selectedSlots) : null;
  overlay.querySelectorAll<HTMLElement>("[data-sacrifice-placement-id]").forEach((option) => {
    const id = option.dataset.sacrificePlacementId;
    const slot = player.board.findIndex((minion) => minion?.instanceId === id);
    option.classList.toggle("destination", destination !== null && slot === destination && selectedSacrifices.has(id ?? ""));
  });
}

function resolveSacrificeSummon(overlay: HTMLElement): void {
  if (!pending) return;
  const fresh = loadSavedSession();
  if (!fresh) return;
  const currentCardId = fresh.state.players[fresh.state.activePlayer].hand[pending.handIndex];
  if (currentCardId !== pending.cardId) {
    showPickerError(overlay, "手牌已经发生变化，请重新选择这张牌。");
    return;
  }

  const card = catalog.cards.get(pending.cardId);
  const error = summonIntoSacrificedSlot(
    fresh,
    catalog,
    pending.handIndex,
    [...selectedSacrifices],
  );
  if (error) {
    showPickerError(overlay, error);
    return;
  }

  pending = null;
  selectedSacrifices.clear();
  overlay.remove();
  saveAndSync(fresh);
  showToast(card ? `「${card.name}」已在献祭位置召唤。` : "献祭召唤完成。");
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
    // The persisted session is still correct on engines without constructible StorageEvent.
  }
  window.dispatchEvent(new CustomEvent("cardgame:session-updated"));
}

function sacrificeOption(minion: MinionInstance, slotIndex: number): string {
  const card = catalog.cards.get(minion.cardId);
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  return `
    <button class="sacrifice-placement-option" type="button" data-sacrifice-placement-id="${escapeHtml(minion.instanceId)}">
      <small>${slotIndex + 1}号位</small>
      <strong>${escapeHtml(card?.name ?? minion.cardId)}</strong>
      <span>⚔ ${attack}　♥ ${minion.currentHealth}</span>
      <em>新随从落点</em>
    </button>
  `;
}

function showPickerError(overlay: HTMLElement, message: string): void {
  let error = overlay.querySelector<HTMLElement>(".sacrifice-placement-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "sacrifice-placement-error";
    overlay.querySelector(".sacrifice-placement-card")?.prepend(error);
  }
  error.textContent = message;
}

function showToast(message: string): void {
  document.querySelector("#sacrifice-placement-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "sacrifice-placement-toast";
  toast.className = "sacrifice-placement-toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3000);
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
