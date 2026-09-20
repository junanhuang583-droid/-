import { presentationLocked, onPresentationLock } from "./presentation-lock.js";
import { canMinionAttack } from "../core/basic-game.js";
import type { MinionInstance, PlayerId, StatusState } from "../model/state.js";
import "./attack-drag.css";
import { byId, catalog } from "./game-catalog.js";
import { dispatchGame, readSession } from "./session-runtime.js";


interface AttackGesture {
  pointerId: number;
  source: HTMLElement;
  attackerId: string;
  owner: PlayerId;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
  ghost: HTMLElement | null;
  line: HTMLElement | null;
  target: HTMLElement | null;
  targetKind: "minion" | "hero" | null;
  targetId: string | null;
}

let attackGesture: AttackGesture | null = null;
let frame = 0;
let suppressNextClick = false;

onPresentationLock(cleanup);
document.body.classList.add("attack-drag-enabled");
document.addEventListener("pointerdown", onPointerDown, true);
document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
document.addEventListener("pointerup", onPointerUp, true);
document.addEventListener("pointercancel", onPointerCancel, true);
document.addEventListener("click", suppressClickAfterDrag, true);

function onPointerDown(event: PointerEvent): void {
  if (presentationLocked() || attackGesture || (event.pointerType === "mouse" && event.button !== 0)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const source = target.closest<HTMLElement>("[data-minion-id]");
  if (!source) return;
  if (document.querySelector(".opening-deal-shield, .overlay, #sacrifice-placement-overlay, #rule-choice-overlay, #unit-effect-overlay")) return;

  const session = readSession();
  if (!session || session.handoffRequired || session.state.winner) return;
  const attackerId = source.dataset.minionId;
  const owner = source.dataset.owner as PlayerId | undefined;
  if (!attackerId || !owner || owner !== session.state.activePlayer) return;
  const attacker = findMinion(session, owner, attackerId);
  if (!attacker || !canMinionAttack(session, attacker, catalog)) return;

  attackGesture = {
    pointerId: event.pointerId,
    source,
    attackerId,
    owner,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    dragging: false,
    ghost: null,
    line: null,
    target: null,
    targetKind: null,
    targetId: null,
  };
  source.classList.add("attack-touching");
  try { source.setPointerCapture(event.pointerId); } catch { /* optional */ }
}

function onPointerMove(event: PointerEvent): void {
  if (!attackGesture || attackGesture.pointerId !== event.pointerId) return;
  const points = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  const latest = points.length ? points[points.length - 1]! : event;
  attackGesture.x = latest.clientX;
  attackGesture.y = latest.clientY;

  const dx = attackGesture.x - attackGesture.startX;
  const dy = attackGesture.y - attackGesture.startY;
  if (!attackGesture.dragging && Math.hypot(dx, dy) > 10) beginAttackDrag(attackGesture);
  if (!attackGesture.dragging) return;
  event.preventDefault();
  scheduleFrame();
}

function beginAttackDrag(current: AttackGesture): void {
  current.dragging = true;
  suppressNextClick = true;
  document.querySelector("#ab-minion-inspector")?.remove();
  document.body.classList.add("attack-drag-active");
  current.source.classList.add("attack-drag-source");

  const cardId = current.source.dataset.cardId;
  const fallbackName = current.source.querySelector("strong")?.textContent?.trim() || "攻击";
  const name = cardId ? byId.get(cardId as MinionInstance["cardId"])?.name ?? fallbackName : fallbackName;
  const ghost = document.createElement("div");
  ghost.className = "attack-drag-ghost";
  ghost.innerHTML = `<span>${escapeHtml(name.slice(0, 1))}</span><small>攻击</small>`;
  document.body.append(ghost);
  current.ghost = ghost;

  const line = document.createElement("div");
  line.className = "attack-drag-line";
  document.body.append(line);
  current.line = line;
  markLegalTargets(current);
}

function scheduleFrame(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!attackGesture?.dragging) return;
    updateVisuals(attackGesture);
    updateTarget(attackGesture);
  });
}

function updateVisuals(current: AttackGesture): void {
  if (current.ghost) {
    current.ghost.style.transform = `translate3d(${current.x}px,${current.y}px,0) translate(-50%,-50%) scale(1)`;
  }
  if (!current.line) return;
  const rect = current.source.getBoundingClientRect();
  const sx = rect.left + rect.width / 2;
  const sy = rect.top + rect.height / 2;
  const dx = current.x - sx;
  const dy = current.y - sy;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  current.line.style.left = `${sx}px`;
  current.line.style.top = `${sy}px`;
  current.line.style.width = `${length}px`;
  current.line.style.transform = `rotate(${angle}deg)`;
}

function updateTarget(current: AttackGesture): void {
  current.target?.classList.remove("attack-drop-target");
  current.target = null;
  current.targetKind = null;
  current.targetId = null;

  const element = document.elementFromPoint(current.x, current.y);
  if (!(element instanceof Element)) return;

  const enemyMinion = element.closest<HTMLElement>("[data-minion-id].attack-legal-target");
  if (enemyMinion) {
    current.target = enemyMinion;
    current.targetKind = "minion";
    current.targetId = enemyMinion.dataset.minionId ?? null;
  } else {
    const hero = element.closest<HTMLElement>(".opponent-hero.attack-legal-target");
    if (hero) {
      current.target = hero;
      current.targetKind = "hero";
    }
  }

  current.target?.classList.add("attack-drop-target");
  current.ghost?.classList.toggle("attack-target-locked", Boolean(current.target));
  current.line?.classList.toggle("attack-target-locked", Boolean(current.target));
}

function markLegalTargets(current: AttackGesture): void {
  clearLegalTargets();
  const session = readSession();
  if (!session) return;
  const attacker = findMinion(session, current.owner, current.attackerId);
  if (!attacker) return;
  const enemy = otherPlayer(current.owner);
  const arrogant = hasKeyword(attacker, "arrogance", session);
  const enemyTaunts = session.state.players[enemy].board.filter((m): m is MinionInstance => Boolean(m && hasKeyword(m, "taunt", session)));
  const tauntLocks = !arrogant && enemyTaunts.length > 0;

  document.querySelectorAll<HTMLElement>(".opponent-board [data-minion-id]").forEach((element) => {
    const id = element.dataset.minionId;
    const minion = id ? findMinion(session, enemy, id) : null;
    if (!minion) return;
    const legal = !tauntLocks || hasKeyword(minion, "taunt", session);
    element.classList.toggle("attack-legal-target", legal);
    element.classList.toggle("attack-blocked-target", !legal);
  });
  document.querySelector<HTMLElement>(".opponent-hero")?.classList.toggle("attack-legal-target", !tauntLocks);
}

function onPointerUp(event: PointerEvent): void {
  if (!attackGesture || attackGesture.pointerId !== event.pointerId) return;
  const current = attackGesture;
  if (current.dragging) {
    event.preventDefault();
    resolveAttack(current);
  }
  cleanup();
}

function onPointerCancel(event: PointerEvent): void {
  if (!attackGesture || attackGesture.pointerId !== event.pointerId) return;
  cleanup();
}

function resolveAttack(current: AttackGesture): void {
  if (presentationLocked() || !current.targetKind) return;
  const session = readSession();
  if (!session || session.handoffRequired || session.state.winner) return;
  if (!findMinion(session, current.owner, current.attackerId)) return;

  let error: string | null = null;
  if (current.targetKind === "hero") {
    error = dispatchGame({ type: "attack-hero", attackerId: current.attackerId });
  } else if (current.targetId) {
    error = dispatchGame({ type: "attack-minion", attackerId: current.attackerId, targetId: current.targetId });
  }

  if (error) {
    showToast(error);
    return;
  }

}

function suppressClickAfterDrag(event: MouseEvent): void {
  if (!suppressNextClick) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("[data-minion-id], .opponent-hero")) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  suppressNextClick = false;
}

function cleanup(): void {
  if (!attackGesture) return;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  attackGesture.source.classList.remove("attack-touching", "attack-drag-source");
  attackGesture.target?.classList.remove("attack-drop-target");
  attackGesture.ghost?.remove();
  attackGesture.line?.remove();
  clearLegalTargets();
  document.body.classList.remove("attack-drag-active");
  try { attackGesture.source.releasePointerCapture(attackGesture.pointerId); } catch { /* optional */ }
  attackGesture = null;
  window.setTimeout(() => { suppressNextClick = false; }, 100);
}

function clearLegalTargets(): void {
  document.querySelectorAll(".attack-legal-target,.attack-blocked-target,.attack-drop-target").forEach((element) => {
    element.classList.remove("attack-legal-target", "attack-blocked-target", "attack-drop-target");
  });
}

function hasKeyword(minion: MinionInstance, keyword: string, session: NonNullable<ReturnType<typeof readSession>>): boolean {
  if (isStatusActive(minion.statuses, "petrify", session, minion.controller)) return false;
  return minion.statuses.some((status) => status.keyword === keyword && (keyword !== "guard" || (status.charges ?? 0) > 0));
}

function isStatusActive(statuses: StatusState[], keyword: string, session: NonNullable<ReturnType<typeof readSession>>, player: PlayerId): boolean {
  const ownTurn = session.turnsStarted[player];
  return statuses.some((status) => {
    if (status.keyword !== keyword) return false;
    if (status.activeFromOwnTurn !== undefined && status.expiresAfterOwnTurn !== undefined) {
      return ownTurn >= status.activeFromOwnTurn && ownTurn <= status.expiresAfterOwnTurn;
    }
    return (status.remainingOwnTurns ?? 0) > 0;
  });
}

function findMinion(session: NonNullable<ReturnType<typeof readSession>>, owner: PlayerId, instanceId: string): MinionInstance | null {
  const player = session.state.players[owner];
  return player.board.find((minion) => minion?.instanceId === instanceId) ?? player.overflowMinions.find((minion) => minion.instanceId === instanceId) ?? null;
}

function showToast(message: string): void {
  document.querySelector("#attack-drag-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "attack-drag-toast";
  toast.className = "attack-drag-toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}
