import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import { PROTOTYPE_SPECIAL_BY_ID } from "../data/prototype-special-cards.js";
import type { CardId, MinionCardDefinition } from "../model/cards.js";
import { loadSavedSession } from "./persistence.js";
import "./foundation-cd.css";

const cards: MinionCardDefinition[] = parseMinionCardsFromRecord(cardRecord);
const byId = new Map<CardId, MinionCardDefinition>(cards.map((card) => [card.id, card]));
const app = document.querySelector("#app") ?? document.body;
let scheduled = false;

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
    sync();
  });
}

function sync(): void {
  const session = loadSavedSession();
  const shell = document.querySelector<HTMLElement>(".game-shell");
  if (!session || !shell) {
    clearPrivateHand();
    return;
  }

  document.body.classList.add("foundation-cd-enabled", "foundation-ef-enabled");
  const privateHandoff = session.handoffRequired && !session.state.winner;
  document.body.classList.toggle("cd-handoff-private", privateHandoff);
  shell.classList.toggle("cd-handoff-private-shell", privateHandoff);

  if (privateHandoff) ensurePrivateHand(session.state.players[session.state.activePlayer].hand.length);
  else clearPrivateHand();

  decorateHand(session.state.players[session.state.activePlayer].hand);
  decorateBattleMinions(session);
  decorateSharedDeck();
}

function decorateHand(hand: CardId[]): void {
  const row = document.querySelector<HTMLElement>("#active-hand-target");
  if (!row) return;
  const elements = [...row.querySelectorAll<HTMLElement>(".hand-card")];

  elements.forEach((element, index) => {
    const cardId = hand[index];
    if (!cardId) return;
    element.classList.add("cd-card-face");

    const minion = byId.get(cardId);
    if (minion) {
      element.classList.add("cd-minion-card", "ef-frame", frameClassForSeries(minion.series));
      element.classList.remove("cd-special-card", "ef-type-attack", "ef-type-evolution");
      const renderKey = `minion:${cardId}`;
      if (element.dataset.cdRenderKey === renderKey) return;
      element.dataset.cdRenderKey = renderKey;
      const series = minion.series?.trim() || "随从";
      const attribute = minion.attributes.length ? minion.attributes.join(" · ") : "";
      element.innerHTML = `
        <span class="cd-card-series">${escapeHtml(series)}</span>
        <div class="cd-card-art" aria-hidden="true"><span>${escapeHtml(minion.name.slice(0, 1))}</span></div>
        <strong class="cd-card-name">${escapeHtml(minion.name)}</strong>
        ${attribute ? `<span class="cd-card-attribute">${escapeHtml(attribute)}</span>` : ""}
        <div class="cd-card-stats"><span class="cd-attack">${minion.attack ?? "?"}</span><span class="cd-health">${minion.health ?? "?"}</span></div>
      `;
      return;
    }

    const special = PROTOTYPE_SPECIAL_BY_ID.get(cardId);
    if (special) {
      element.classList.add(
        "cd-special-card",
        "ef-frame",
        special.type === "evolution_stone" ? "ef-type-evolution" : "ef-type-attack",
      );
      element.classList.remove("cd-minion-card", "ef-series-base", "ef-series-dragon", "ef-series-prehistoric");
      element.dataset.cdRenderKey = `special:${cardId}`;
    }
  });
}

function decorateBattleMinions(session: NonNullable<ReturnType<typeof loadSavedSession>>): void {
  document.querySelectorAll<HTMLElement>(".board-slot.minion").forEach((element) => {
    element.classList.add("cd-battle-unit", "ef-battle-unit");
    element.classList.remove("ef-series-base", "ef-series-dragon", "ef-series-prehistoric");

    const owner = element.dataset.owner as "P1" | "P2" | undefined;
    const instanceId = element.dataset.minionId;
    if (owner && instanceId) {
      const player = session.state.players[owner];
      const instance = player.board.find((minion) => minion?.instanceId === instanceId)
        ?? player.overflowMinions.find((minion) => minion.instanceId === instanceId)
        ?? null;
      const definition = instance ? byId.get(instance.cardId) : undefined;
      element.classList.add(frameClassForSeries(definition?.series));
    }

    const art = element.querySelector<HTMLElement>(".minion-art");
    art?.classList.add("cd-unit-portrait");
    const stats = element.querySelector<HTMLElement>(".minion-stats");
    stats?.classList.add("cd-unit-stats");
  });
}

function decorateSharedDeck(): void {
  document.querySelectorAll<HTMLElement>(".deck-card").forEach((element) => element.classList.add("cd-card-back"));
}

function ensurePrivateHand(count: number): void {
  let privateHand = document.querySelector<HTMLElement>("#cd-private-hand");
  if (!privateHand) {
    privateHand = document.createElement("div");
    privateHand.id = "cd-private-hand";
    privateHand.className = "cd-private-hand";
    privateHand.setAttribute("aria-hidden", "true");
    document.body.append(privateHand);
  }

  const visibleBacks = Math.max(1, Math.min(count, 10));
  const key = `${visibleBacks}:${count}`;
  if (privateHand.dataset.key === key) return;
  privateHand.dataset.key = key;
  privateHand.innerHTML = Array.from({ length: visibleBacks }, (_, index) => {
    const center = (visibleBacks - 1) / 2;
    const distance = index - center;
    const angle = Math.max(-11, Math.min(11, distance * 2.4));
    const y = Math.min(12, Math.abs(distance) * 1.6);
    return `<span class="cd-private-back cd-card-back" style="--cd-private-angle:${angle}deg;--cd-private-y:${y}px;--cd-private-z:${100 - Math.round(Math.abs(distance))}"><i>CG</i></span>`;
  }).join("");
}

function clearPrivateHand(): void {
  document.querySelector("#cd-private-hand")?.remove();
  document.body.classList.remove("cd-handoff-private");
}

function frameClassForSeries(series: string | null | undefined): string {
  const normalized = series?.trim() ?? "";
  if (normalized === "龙神") return "ef-series-dragon";
  if (normalized === "史前巨兽") return "ef-series-prehistoric";
  return "ef-series-base";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}
