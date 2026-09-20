import {
  controlEffectTargets,
  currentPendingEffect,
  type BasicGameSession
} from "../core/basic-game.js";
import type { MinionInstance, PlayerId } from "../model/state.js";
import { catalog } from "./game-catalog.js";
import { dispatchGame, readSession, subscribeSession } from "./session-runtime.js";
import { onViewRendered } from "./view-events.js";

let scheduled = false;

installStyles();
subscribeSession(scheduleSync);
onViewRendered(scheduleSync, 60);
scheduleSync();

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    syncSecondWaveUi();
  });
}

function syncSecondWaveUi(): void {
  const session = readSession();
  if (!session) return;

  applyControlBadges(session);
  if (!session.handoffRequired && !session.state.winner) renderPendingEffectPicker(session);
  else removeChoiceOverlay();
}

function renderPendingEffectPicker(session: BasicGameSession): void {
  const effect = currentPendingEffect(session);
  const existing = document.querySelector<HTMLElement>("#rule-choice-overlay");
  if (!effect) {
    if (existing?.dataset.effectPicker === "true") existing.remove();
    return;
  }
  if (existing && existing.dataset.effectId === `${effect.id}:${effect.remainingTargets}:${session.revision ?? 0}`) return;
  removeChoiceOverlay();

  const label = effect.kind === "freeze" ? "冰冻" : "石化";
  const targetPlayer = session.state.players[effect.targetPlayer];
  const allowed = new Set(controlEffectTargets(session, catalog, effect).map((m) => m.instanceId));
  const overlay = document.createElement("div");
  overlay.id = "rule-choice-overlay";
  overlay.dataset.effectPicker = "true";
  overlay.dataset.effectId = `${effect.id}:${effect.remainingTargets}:${session.revision ?? 0}`;
  overlay.className = "rule-choice-overlay";
  overlay.innerHTML = `
    <section class="rule-choice-card">
      <div class="choice-eyebrow">亡语结算 · ${label}</div>
      <h2>「${escapeHtml(effect.sourceName)}」等待选择目标</h2>
      <p>还需选择 ${effect.remainingTargets} 只${playerLabel(effect.targetPlayer)}随从。该状态从目标的下一个自己的回合开始，持续 ${effect.durationOwnTurns} 个自己的回合。</p>
      <div class="sacrifice-grid control-target-grid">
        ${targetPlayer.board.map((minion, index) => minion && allowed.has(minion.instanceId) ? controlTargetOption(minion, index) : "").join("")}
      </div>
      <div class="choice-footer"><span>必须先结算该亡语，才能继续行动。</span></div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-effect-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.effectTarget;
      if (!id) return;
      const fresh = readSession();
      if (!fresh) return;
      const error = dispatchGame({ type: "choose-control", effectId: effect.id, targetId: id });
      if (error) {
        showChoiceError(overlay, error);
        return;
      }
      removeChoiceOverlay();

      showTransientMessage(`${label}亡语已结算。`);
    });
  });
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
  const active: PlayerId = document.querySelector<HTMLElement>(".game-shell")?.dataset.viewPlayer === "P2" ? "P2" : "P1";
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
