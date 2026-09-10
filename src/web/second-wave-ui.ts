import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import {
  choosePendingEffectTarget,
  createCatalog,
  currentPendingEffect,
  getSummonRequirement,
  summonFromHand,
  type BasicGameSession,
} from "../core/basic-game.js";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { MinionInstance, PlayerId } from "../model/state.js";
import { loadSavedSession, saveSession } from "./persistence.js";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const catalog = createCatalog(cards);
const selectedSacrifices = new Set<string>();
let pendingSummonUi: { handIndex: number; slotIndex: number; sacrificeCount: number; cardId: CardId } | null = null;
let scheduled = false;

installStyles();
document.addEventListener("click", interceptAdvancedClicks, true);
new MutationObserver(scheduleSync).observe(document.querySelector("#app") ?? document.body, { childList: true, subtree: true });
scheduleSync();

function interceptAdvancedClicks(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const emptySlot = target.closest<HTMLElement>("[data-empty-slot]");
  if (!emptySlot) return;
  const selectedCard = document.querySelector<HTMLElement>(".hand-card.selected[data-hand-index]");
  if (!selectedCard) return;

  const handIndex = Number(selectedCard.dataset.handIndex);
  const slotIndex = Number(emptySlot.dataset.emptySlot);
  if (!Number.isInteger(handIndex) || !Number.isInteger(slotIndex)) return;

  const session = loadSavedSession();
  if (!session) return;
  const cardId = session.state.players[session.state.activePlayer].hand[handIndex];
  if (!cardId) return;
  const card = catalog.cards.get(cardId);
  if (!card) return;
  const requirement = getSummonRequirement(card);
  if (requirement.unsupportedReason || requirement.sacrificeCount <= 0) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const available = session.state.players[session.state.activePlayer].board.filter(Boolean).length;
  if (available < requirement.sacrificeCount) {
    showTransientMessage(`「${card.name}」需要献祭 ${requirement.sacrificeCount} 只己方随从，但场上数量不足。`);
    return;
  }

  pendingSummonUi = { handIndex, slotIndex, sacrificeCount: requirement.sacrificeCount, cardId };
  selectedSacrifices.clear();
  renderSacrificePicker(session, card);
}

function renderSacrificePicker(session: BasicGameSession, card: MinionCardDefinition): void {
  removeChoiceOverlay();
  const pending = pendingSummonUi;
  if (!pending) return;
  const player = session.state.players[session.state.activePlayer];
  const overlay = document.createElement("div");
  overlay.id = "rule-choice-overlay";
  overlay.className = "rule-choice-overlay";
  overlay.innerHTML = `
    <section class="rule-choice-card">
      <div class="choice-eyebrow">召唤条件 · 献祭</div>
      <h2>召唤「${escapeHtml(card.name)}」</h2>
      <p>选择 ${pending.sacrificeCount} 只己方随从作为献祭。献祭算死亡，会进入弃牌堆并正常触发亡语。</p>
      <div class="sacrifice-grid">
        ${player.board.map((minion, index) => minion ? sacrificeOption(minion, index) : "").join("")}
      </div>
      <div class="choice-footer">
        <span id="sacrifice-count">已选 0 / ${pending.sacrificeCount}</span>
        <button id="cancel-sacrifice" class="choice-button secondary" type="button">取消</button>
        <button id="confirm-sacrifice" class="choice-button primary" type="button" disabled>确认献祭并召唤</button>
      </div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-sacrifice-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.sacrificeId;
      if (!id) return;
      if (selectedSacrifices.has(id)) selectedSacrifices.delete(id);
      else if (selectedSacrifices.size < pending.sacrificeCount) selectedSacrifices.add(id);
      button.classList.toggle("selected", selectedSacrifices.has(id));
      const count = overlay.querySelector<HTMLElement>("#sacrifice-count");
      if (count) count.textContent = `已选 ${selectedSacrifices.size} / ${pending.sacrificeCount}`;
      const confirm = overlay.querySelector<HTMLButtonElement>("#confirm-sacrifice");
      if (confirm) confirm.disabled = selectedSacrifices.size !== pending.sacrificeCount;
    });
  });

  overlay.querySelector<HTMLButtonElement>("#cancel-sacrifice")?.addEventListener("click", () => {
    pendingSummonUi = null;
    selectedSacrifices.clear();
    removeChoiceOverlay();
  });

  overlay.querySelector<HTMLButtonElement>("#confirm-sacrifice")?.addEventListener("click", () => {
    const fresh = loadSavedSession();
    if (!fresh || !pendingSummonUi) return;
    const summonedCard = catalog.cards.get(pendingSummonUi.cardId);
    const error = summonFromHand(
      fresh,
      catalog,
      pendingSummonUi.handIndex,
      pendingSummonUi.slotIndex,
      [...selectedSacrifices],
    );
    if (error) {
      showChoiceError(overlay, error);
      return;
    }
    pendingSummonUi = null;
    selectedSacrifices.clear();
    removeChoiceOverlay();
    saveAndSync(fresh);
    showTransientMessage(summonedCard ? `已献祭并召唤「${summonedCard.name}」。` : "献祭召唤完成。");
  });
}

function sacrificeOption(minion: MinionInstance, slotIndex: number): string {
  const card = catalog.cards.get(minion.cardId);
  const name = card?.name ?? minion.cardId;
  const attack = Math.max(0, (card?.attack ?? 0) + minion.attackModifier);
  return `
    <button class="sacrifice-option" data-sacrifice-id="${escapeHtml(minion.instanceId)}" type="button">
      <small>${slotIndex + 1}号位</small>
      <strong>${escapeHtml(name)}</strong>
      <span>⚔ ${attack}　♥ ${minion.currentHealth}</span>
    </button>
  `;
}

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncSecondWaveUi();
  });
}

function syncSecondWaveUi(): void {
  const session = loadSavedSession();
  if (!session) return;
  updateModeNote();
  applyControlBadges(session);
  if (!pendingSummonUi) renderPendingEffectPicker(session);
}

function renderPendingEffectPicker(session: BasicGameSession): void {
  const effect = currentPendingEffect(session);
  const existing = document.querySelector<HTMLElement>("#rule-choice-overlay");
  if (!effect) {
    if (existing?.dataset.effectPicker === "true") existing.remove();
    return;
  }
  if (existing && existing.dataset.effectId === effect.id) return;
  removeChoiceOverlay();

  const label = effect.kind === "freeze" ? "冰冻" : "石化";
  const targetPlayer = session.state.players[effect.targetPlayer];
  const overlay = document.createElement("div");
  overlay.id = "rule-choice-overlay";
  overlay.dataset.effectPicker = "true";
  overlay.dataset.effectId = effect.id;
  overlay.className = "rule-choice-overlay";
  overlay.innerHTML = `
    <section class="rule-choice-card">
      <div class="choice-eyebrow">亡语结算 · ${label}</div>
      <h2>「${escapeHtml(effect.sourceName)}」等待选择目标</h2>
      <p>还需选择 ${effect.remainingTargets} 只${playerLabel(effect.targetPlayer)}随从。该状态从目标的下一个自己的回合开始，持续 ${effect.durationOwnTurns} 个自己的回合。</p>
      <div class="sacrifice-grid control-target-grid">
        ${targetPlayer.board.map((minion, index) => minion && !effect.selectedTargetIds.includes(minion.instanceId) ? controlTargetOption(minion, index) : "").join("")}
      </div>
      <div class="choice-footer"><span>必须先结算该亡语，才能继续行动。</span></div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-effect-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.effectTarget;
      if (!id) return;
      const fresh = loadSavedSession();
      if (!fresh) return;
      const error = choosePendingEffectTarget(fresh, catalog, id);
      if (error) {
        showChoiceError(overlay, error);
        return;
      }
      removeChoiceOverlay();
      saveAndSync(fresh);
      showTransientMessage(`${label}亡语已结算。`);
    });
  });
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
    // Older engines may not construct StorageEvent. Mutation observers still
    // resync the auxiliary UI, while the persisted state remains correct.
  }
  scheduleSync();
}

function controlTargetOption(minion: MinionInstance, slotIndex: number): string {
  const card = catalog.cards.get(minion.cardId);
  return `
    <button class="sacrifice-option control-option" data-effect-target="${escapeHtml(minion.instanceId)}" type="button">
      <small>${slotIndex + 1}号位</small>
      <strong>${escapeHtml(card?.name ?? minion.cardId)}</strong>
      <span>⚔ ${Math.max(0, (card?.attack ?? 0) + minion.attackModifier)}　♥ ${minion.currentHealth}</span>
    </button>
  `;
}

function applyControlBadges(session: BasicGameSession): void {
  const active = session.state.activePlayer;
  const opponent = otherPlayer(active);
  applyBoardBadges(".active-board", session, active);
  applyBoardBadges(".opponent-board", session, opponent);
}

function applyBoardBadges(selector: string, session: BasicGameSession, playerId: PlayerId): void {
  const slots = document.querySelectorAll<HTMLElement>(`${selector} .board-slot`);
  slots.forEach((slot, index) => {
    slot.querySelector(".control-status-strip")?.remove();
    const minion = session.state.players[playerId].board[index];
    if (!minion) return;
    const labels = controlLabels(session, minion);
    if (labels.length === 0) return;
    const strip = document.createElement("div");
    strip.className = "control-status-strip";
    strip.innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
    slot.append(strip);
  });
}

function controlLabels(session: BasicGameSession, minion: MinionInstance): string[] {
  const ownTurn = session.turnsStarted[minion.controller];
  const labels: string[] = [];
  for (const status of minion.statuses) {
    if (status.keyword !== "sleep" && status.keyword !== "freeze" && status.keyword !== "petrify") continue;
    if (status.expiresAfterOwnTurn !== undefined && status.expiresAfterOwnTurn < ownTurn) continue;
    const label = status.keyword === "sleep" ? "沉睡" : status.keyword === "freeze" ? "冰冻" : "石化";
    labels.push(label);
  }
  return [...new Set(labels)];
}

function updateModeNote(): void {
  const note = document.querySelector<HTMLElement>(".mode-note");
  if (!note || note.dataset.secondWave === "true") return;
  note.dataset.secondWave = "true";
  note.textContent = "已启用：扣血召唤、迅疾、快攻、嘲讽、狂妄、守护、甲一/甲二、吸血、献祭、死亡/亡语框架、汲取底层、沉睡/冰冻/石化状态。当前可自动结算潮汐鱼人→鱼仔，以及冰晶/眼墙的控制亡语；需要未确认目标范围的亡语仍不会擅自执行。进化、装备和场景暂未启用。";
}

function showChoiceError(overlay: HTMLElement, message: string): void {
  let error = overlay.querySelector<HTMLElement>(".choice-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "choice-error";
    overlay.querySelector(".rule-choice-card")?.prepend(error);
  }
  error.textContent = message;
}

function showTransientMessage(message: string): void {
  const existing = document.querySelector<HTMLElement>("#second-wave-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "second-wave-toast";
  toast.className = "second-wave-toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function removeChoiceOverlay(): void {
  document.querySelector("#rule-choice-overlay")?.remove();
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function playerLabel(playerId: PlayerId): string {
  return playerId === "P1" ? "玩家1" : "玩家2";
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

function installStyles(): void {
  if (document.querySelector("#second-wave-style")) return;
  const style = document.createElement("style");
  style.id = "second-wave-style";
  style.textContent = `
    .rule-choice-overlay{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(8,7,6,.76);backdrop-filter:blur(8px)}
    .rule-choice-card{width:min(720px,92vw);max-height:88dvh;overflow:auto;border:1px solid rgba(189,147,84,.72);border-radius:18px;padding:18px;background:linear-gradient(180deg,rgba(41,33,26,.98),rgba(22,18,15,.99));box-shadow:0 24px 70px rgba(0,0,0,.55);color:#eee1cf}
    .rule-choice-card h2{margin:5px 0 6px;font-size:clamp(18px,3vw,28px)}
    .rule-choice-card p{margin:0 0 14px;color:#cdbfae;font-size:12px;line-height:1.55}
    .choice-eyebrow{color:#d6ae70;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .sacrifice-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
    .sacrifice-option{min-height:84px;border:1px solid rgba(137,108,70,.75);border-radius:12px;padding:8px;background:rgba(30,25,20,.92);color:#eadcca;display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-align:left}
    .sacrifice-option small{color:#998978;font-size:9px}.sacrifice-option strong{font-size:12px}.sacrifice-option span{font-size:10px;color:#d7c6ae}
    .sacrifice-option.selected{border-color:#db7c67;background:rgba(92,42,35,.9);box-shadow:0 0 0 2px rgba(219,124,103,.2) inset}
    .control-option{border-color:rgba(103,154,191,.78)}
    .choice-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:14px;font-size:11px;color:#b9a894}.choice-footer>span{margin-right:auto}
    .choice-button{border-radius:10px;padding:9px 13px;font-weight:800;font-size:11px}.choice-button.primary{border:1px solid #bd8f4d;background:#9a682f;color:#fff1d8}.choice-button.secondary{border:1px solid #75634d;background:#29221b;color:#ddd0be}.choice-button:disabled{opacity:.38}
    .choice-error{margin-bottom:10px;padding:8px 10px;border:1px solid rgba(207,91,74,.62);border-radius:10px;background:rgba(91,34,29,.72);font-size:11px;color:#ffd2c9}
    .second-wave-toast{position:fixed;z-index:145;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:9px 13px;border:1px solid rgba(194,145,77,.65);border-radius:999px;background:rgba(25,20,16,.96);color:#f0dfc8;font-size:11px;box-shadow:0 14px 34px rgba(0,0,0,.42)}
    .control-status-strip{position:absolute;z-index:7;right:4px;top:4px;display:flex;gap:2px;pointer-events:none}.control-status-strip span{padding:2px 4px;border:1px solid rgba(105,170,218,.72);border-radius:999px;background:rgba(22,50,70,.9);color:#d8f1ff;font-size:6px;font-weight:900}
    @media (max-height:520px){.rule-choice-card{padding:12px;width:min(760px,94vw)}.rule-choice-card p{margin-bottom:9px}.sacrifice-option{min-height:62px;padding:6px}.choice-footer{margin-top:9px}.sacrifice-grid{gap:5px}}
    @media (max-width:700px){.sacrifice-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;
  document.head.append(style);
}
