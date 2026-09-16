import { currentPendingUnitEffect, unitEffectTargets, type BasicGameSession, type UnitEffectTarget as TargetView } from "../core/basic-game.js";
import type { PendingUnitEffect } from "../core/deathrattle-effects.js";
import { otherPlayer } from "../core/unit-targeting.js";
import type { PlayerId } from "../model/state.js";
import { catalog } from "./game-catalog.js";
import { dispatchGame, readSession, subscribeSession } from "./session-runtime.js";

installStyles();
subscribeSession(() => queueMicrotask(sync));
queueMicrotask(sync);
function sync(): void {
  const session = readSession();
  const effect = currentPendingUnitEffect(session);
  if (session.handoffRequired || !effect) { removeOurOverlay(); return; }
  renderEffectPicker(session, effect);
}

function renderEffectPicker(session: BasicGameSession, effect: PendingUnitEffect): void {
  const existing = document.querySelector<HTMLElement>("#unit-effect-overlay");
  if (existing?.dataset.effectId === `${effect.id}:${effect.remainingTargets}:${session.revision ?? 0}`) return;
  removeOurOverlay();

  const targets = unitEffectTargets(session, catalog, effect);
  if (targets.length === 0) return;

  const overlay = document.createElement("div");
  overlay.id = "unit-effect-overlay";
  overlay.dataset.effectId = `${effect.id}:${effect.remainingTargets}:${session.revision ?? 0}`;
  overlay.className = "unit-effect-overlay";
  overlay.innerHTML = `
    <section class="unit-effect-card">
      <div class="unit-effect-eyebrow">亡语结算 · 单位目标</div>
      <h2>「${escapeHtml(effect.sourceName)}」</h2>
      <p>${escapeHtml(effect.text)}。还需选择 ${effect.remainingTargets} 个不同目标。敌方存在嘲讽时，选择敌方单位仍必须先选嘲讽随从；己方单位不受该限制。</p>
      <div class="unit-target-groups">
        ${targetGroup(effect.sourcePlayer, targets, true)}
        ${targetGroup(effect.sourcePlayer, targets, false)}
      </div>
      <div class="unit-effect-footer">
        <span>${actionLabel(effect)} · 数值 ${effect.amount}</span>
        <small>“单位”包含双方英雄与双方随从</small>
      </div>
    </section>
  `;
  document.body.append(overlay);

  overlay.querySelectorAll<HTMLButtonElement>("[data-unit-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.unitTarget;
      if (!key) return;
      const error = dispatchGame({ type: "choose-unit", effectId: effect.id, targetKey: key });
      if (error) showOverlayError(error);
    });
  });
}


function targetGroup(sourcePlayer: PlayerId, targets: TargetView[], friendly: boolean): string {
  const playerId = friendly ? sourcePlayer : otherPlayer(sourcePlayer);
  const group = targets.filter((target) => target.playerId === playerId);
  if (group.length === 0) return "";
  return `
    <div class="unit-target-group">
      <strong>${friendly ? "我方" : "敌方"}</strong>
      <div class="unit-target-grid">
        ${group.map(targetButton).join("")}
      </div>
    </div>
  `;
}

function targetButton(target: TargetView): string {
  return `
    <button type="button" class="unit-target-option ${target.kind === "hero" ? "hero-option" : ""} ${target.isTaunt ? "taunt-option" : ""}" data-unit-target="${escapeHtml(target.key)}">
      <small>${target.kind === "hero" ? "英雄" : target.isTaunt ? "随从 · 嘲讽" : "随从"}</small>
      <strong>${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(target.detail)}</span>
    </button>
  `;
}

function actionLabel(effect: PendingUnitEffect): string {
  if (effect.action === "damage") return "伤害";
  if (effect.action === "health_loss") return "扣血";
  if (effect.action === "heal") return "加血";
  return "加攻击";
}

function showOverlayError(message: string): void {
  const card = document.querySelector<HTMLElement>("#unit-effect-overlay .unit-effect-card");
  if (!card) return;
  let error = card.querySelector<HTMLElement>(".unit-effect-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "unit-effect-error";
    card.prepend(error);
  }
  error.textContent = message;
}

function removeOurOverlay(): void {
  document.querySelector("#unit-effect-overlay")?.remove();
}

function playerLabel(playerId: PlayerId): string {
  return playerId === "P1" ? "玩家1" : "玩家2";
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

function installStyles(): void {
  if (document.querySelector("#unit-effects-style")) return;
  const style = document.createElement("style");
  style.id = "unit-effects-style";
  style.textContent = `
    .unit-effect-overlay{position:fixed;inset:0;z-index:145;display:grid;place-items:center;padding:max(12px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(7,6,5,.8);backdrop-filter:blur(9px)}
    .unit-effect-card{width:min(800px,94vw);max-height:90dvh;overflow:auto;border:1px solid rgba(203,156,85,.78);border-radius:18px;padding:17px;background:linear-gradient(180deg,rgba(43,34,26,.99),rgba(20,17,14,.99));box-shadow:0 25px 80px rgba(0,0,0,.62);color:#eee0cd}
    .unit-effect-card h2{margin:4px 0 5px;font-size:clamp(18px,3vw,28px)}
    .unit-effect-card p{margin:0 0 12px;color:#cdbda8;font-size:11px;line-height:1.5}
    .unit-effect-eyebrow{color:#e0b16c;font-size:9px;font-weight:900;letter-spacing:.12em}
    .unit-target-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}.unit-target-group>strong{display:block;margin:0 0 5px;font-size:11px;color:#d9c7af}
    .unit-target-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .unit-target-option{min-height:74px;border:1px solid rgba(125,99,68,.8);border-radius:11px;padding:7px;background:rgba(31,26,21,.94);color:#eddfcc;display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left}
    .unit-target-option:active{transform:translateY(1px)}.unit-target-option.hero-option{border-color:rgba(166,112,72,.9);background:rgba(48,30,24,.95)}.unit-target-option.taunt-option{box-shadow:inset 0 0 0 1px rgba(210,174,93,.45)}
    .unit-target-option small{font-size:8px;color:#9e8b77}.unit-target-option strong{font-size:11px}.unit-target-option span{font-size:9px;color:#c9b99f}
    .unit-effect-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:11px;padding-top:9px;border-top:1px solid rgba(143,112,75,.35);font-size:10px;color:#d8c6ab}.unit-effect-footer small{color:#998774}
    .unit-effect-error{margin-bottom:8px;padding:7px 9px;border:1px solid rgba(194,88,75,.65);border-radius:8px;background:rgba(97,34,27,.38);color:#ffd7cf;font-size:10px}
    @media (orientation:landscape) and (max-height:460px){.unit-effect-card{padding:10px 12px;border-radius:12px}.unit-effect-card h2{font-size:17px}.unit-effect-card p{font-size:9px;margin-bottom:7px}.unit-target-option{min-height:55px;padding:5px}.unit-target-grid{gap:4px}.unit-effect-footer{margin-top:6px;padding-top:6px}}
    @media (max-width:650px){.unit-target-groups{grid-template-columns:1fr}.unit-target-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;
  document.head.append(style);
}
