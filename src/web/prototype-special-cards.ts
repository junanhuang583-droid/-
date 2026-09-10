import { PROTOTYPE_SPECIAL_BY_ID, PROTOTYPE_SPECIAL_DECK } from "../data/prototype-special-cards.js";
import type { CardId } from "../model/cards.js";
import { loadSavedSession, saveSession } from "./persistence.js";
import "./prototype-special-cards.css";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const META_KEY = "cardgame.prototype-special-cards.v1";
let scheduled = false;
let selectedSpecialIndex: number | null = null;

interface MetaState {
  gameId: string;
  injected: boolean;
}

const root = document.querySelector("#app") ?? document.body;
new MutationObserver(scheduleSync).observe(root, { childList: true, subtree: true });
window.addEventListener("storage", scheduleSync);
window.addEventListener("cardgame:session-updated", scheduleSync);
document.addEventListener("click", onDocumentClick, true);
scheduleSync();

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    sync();
  });
}

function sync(): void {
  const session = loadSavedSession();
  if (!session) {
    removePreview();
    return;
  }

  if (!document.querySelector(".game-shell.opening-deal")) {
    ensureInjected(session);
  }

  decorateDeckInfo();
  decorateSpecialCards(session.state.players[session.state.activePlayer].hand);
  syncSpecialPreview(session.state.players[session.state.activePlayer].hand);
}

function ensureInjected(session: ReturnType<typeof loadSavedSession> extends infer T ? Exclude<T, null> : never): void {
  const meta = loadMeta();
  if (meta?.gameId === session.gameId && meta.injected) return;

  session.state.sharedDeck.push(...PROTOTYPE_SPECIAL_DECK);
  shuffle(session.state.sharedDeck);
  session.log.push({
    at: new Date().toISOString(),
    turn: session.state.turn,
    text: "原型效果卡加入共享牌库：普通进化石×10、普通攻击×10。普通攻击的伤害与目标规则尚未录入，当前不可结算。",
  });
  if (session.log.length > 300) session.log.splice(0, session.log.length - 300);

  localStorage.setItem(META_KEY, JSON.stringify({ gameId: session.gameId, injected: true } satisfies MetaState));
  saveSession(session);
  dispatchSessionSync();
}

function loadMeta(): MetaState | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    if (typeof parsed.gameId === "string" && parsed.injected === true) return parsed as MetaState;
  } catch {
    // Rebuild on the next sync.
  }
  return null;
}

function decorateDeckInfo(): void {
  const group = document.querySelector<HTMLElement>(".battle-rail .rail-group");
  if (!group) return;
  let chip = group.querySelector<HTMLElement>(".prototype-deck-chip");
  if (!chip) {
    chip = document.createElement("div");
    chip.className = "prototype-deck-chip";
    group.append(chip);
  }
  chip.innerHTML = `<span>效果卡</span><b>进化石 ×10</b><b>普通攻击 ×10</b>`;
}

function decorateSpecialCards(hand: CardId[]): void {
  const row = document.querySelector<HTMLElement>("#active-hand-target");
  if (!row) return;
  const elements = [...row.querySelectorAll<HTMLButtonElement>(".hand-card")];

  elements.forEach((button, index) => {
    const id = hand[index];
    const definition = id ? PROTOTYPE_SPECIAL_BY_ID.get(id) : undefined;
    if (!definition) return;

    button.disabled = false;
    button.dataset.prototypeHandIndex = String(index);
    button.dataset.prototypeCardId = definition.id;
    button.classList.add("prototype-special-card", definition.type === "evolution_stone" ? "prototype-stone-card" : "prototype-attack-card");
    button.classList.toggle("prototype-selected", selectedSpecialIndex === index);
    button.innerHTML = `
      <span class="card-id">${escapeHtml(definition.id)}</span>
      <div class="prototype-special-art"><span>${definition.type === "evolution_stone" ? "◇" : "⚔"}</span></div>
      <strong>${escapeHtml(definition.name)}</strong>
      <div class="prototype-special-type">${escapeHtml(definition.displayType)}</div>
      <small>${definition.executable ? "可使用" : "点按查看详情"}</small>
    `;
  });
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const special = target.closest<HTMLButtonElement>(".prototype-special-card[data-prototype-hand-index]");
  if (special) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const index = Number(special.dataset.prototypeHandIndex);
    if (!Number.isInteger(index)) return;

    const selectedRegular = document.querySelector<HTMLButtonElement>(".hand-card.selected[data-hand-index]");
    if (selectedRegular) selectedRegular.click();
    selectedSpecialIndex = selectedSpecialIndex === index ? null : index;
    scheduleSync();
    return;
  }

  if (target.closest("#prototype-special-preview")) return;
  if (target.closest(".hand-card[data-hand-index]")) {
    selectedSpecialIndex = null;
    removePreview();
    return;
  }

  if (selectedSpecialIndex !== null && !target.closest(".hand-row")) {
    selectedSpecialIndex = null;
    removePreview();
    scheduleSync();
  }
}

function syncSpecialPreview(hand: CardId[]): void {
  if (selectedSpecialIndex === null) {
    removePreview();
    return;
  }
  const id = hand[selectedSpecialIndex];
  const definition = id ? PROTOTYPE_SPECIAL_BY_ID.get(id) : undefined;
  if (!definition) {
    selectedSpecialIndex = null;
    removePreview();
    return;
  }

  const selected = document.querySelector<HTMLElement>(`.prototype-special-card[data-prototype-hand-index="${selectedSpecialIndex}"]`);
  if (!selected) return;

  let preview = document.querySelector<HTMLElement>("#prototype-special-preview");
  const key = `${selectedSpecialIndex}:${definition.id}`;
  if (!preview || preview.dataset.previewKey !== key) {
    preview?.remove();
    preview = document.createElement("article");
    preview.id = "prototype-special-preview";
    preview.className = `prototype-special-preview ${definition.type === "evolution_stone" ? "special-preview-stone" : "special-preview-attack"}`;
    preview.dataset.previewKey = key;
    preview.innerHTML = `
      <button type="button" class="prototype-preview-close" aria-label="收起详情">×</button>
      <div class="prototype-preview-meta"><span>${escapeHtml(definition.id)}</span><span>原型牌 · 数量 ${definition.copies}</span></div>
      <div class="prototype-preview-art"><span>${definition.type === "evolution_stone" ? "◇" : "⚔"}</span></div>
      <div class="prototype-preview-title"><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.displayType)}</small></div>
      <div class="prototype-preview-scroll">
        <div class="prototype-preview-section"><b>效果</b><p>${escapeHtml(definition.rulesText)}</p></div>
        <div class="prototype-preview-section"><b>当前实现</b><p>${definition.executable ? "已经可以执行。" : "已进入共享牌库与手牌展示，但尚不执行未确认的规则。"}</p></div>
        ${definition.notes.map((note) => `<div class="prototype-preview-section"><b>记录</b><p>${escapeHtml(note)}</p></div>`).join("")}
      </div>
      <div class="prototype-preview-foot">↕ 文字过长时可上下滑动</div>
    `;
    document.body.append(preview);
    preview.querySelector<HTMLButtonElement>(".prototype-preview-close")?.addEventListener("click", () => {
      selectedSpecialIndex = null;
      removePreview();
      scheduleSync();
    });
  }

  positionPreview(selected, preview);
}

function positionPreview(selected: HTMLElement, preview: HTMLElement): void {
  const rect = selected.getBoundingClientRect();
  const width = preview.offsetWidth || 220;
  const height = preview.offsetHeight || 320;
  const margin = 8;
  const desiredX = rect.left + rect.width / 2;
  const left = clamp(desiredX, width / 2 + margin, window.innerWidth - width / 2 - margin);
  const top = clamp(rect.top - height - 8, margin, Math.max(margin, window.innerHeight - height - margin));
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function removePreview(): void {
  document.querySelector("#prototype-special-preview")?.remove();
}

function dispatchSessionSync(): void {
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
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
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
