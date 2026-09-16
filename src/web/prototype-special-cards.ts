import { PROTOTYPE_SPECIAL_BY_ID } from "../data/prototype-special-cards.js";
import type { CardId } from "../model/cards.js";
import "./prototype-special-cards.css";
import { readSession } from "./session-runtime.js";
import { onViewRendered } from "./view-events.js";

let scheduled = false;
let selectedSpecialIndex: number | null = null;


onViewRendered(sync, 20);
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
  const session = readSession();
  if (!session) {
    removePreview();
    return;
  }



  decorateDeckInfo();
  decorateSpecialCards(session.state.players[session.state.activePlayer].hand);
  syncSpecialPreview(session.state.players[session.state.activePlayer].hand);
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

    const state = readSession();
    button.disabled = state.handoffRequired || Boolean(state.state.winner) || Boolean(document.querySelector(".opening-deal, .draw-animating"));
    button.dataset.prototypeHandIndex = String(index);
    button.dataset.prototypeCardId = definition.id;
    button.classList.add(
      "prototype-special-card",
      "ef-frame",
      definition.type === "evolution_stone" ? "prototype-stone-card" : "prototype-attack-card",
      definition.type === "evolution_stone" ? "ef-type-evolution" : "ef-type-attack",
    );
    button.classList.toggle("prototype-selected", selectedSpecialIndex === index);
    button.innerHTML = `
      <span class="card-id">${escapeHtml(definition.id)}</span>
      <div class="prototype-special-art"><span>${definition.type === "evolution_stone" ? "◇" : "攻"}</span></div>
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
