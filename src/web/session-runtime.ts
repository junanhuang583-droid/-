import { GameStore, type SessionListener } from "../application/game-store.js";
import { migrateLegacyEffects } from "../application/session-migration.js";
import { createBasicGame, settlePendingEffects } from "../core/basic-game.js";
import { applyCommand, type GameCommand } from "../core/commands.js";
import { PROTOTYPE_SPECIAL_DECK } from "../data/prototype-special-cards.js";
import { cards, catalog } from "./game-catalog.js";
import { parseStored, persistSession, restoreSession, SAVE_KEY } from "./persistence.js";

let storageWarning = "";
let restored = null;
try { restored = restoreSession(localStorage); }
catch { storageWarning = "浏览器存储不可用，本次对局暂时只保存在内存中。"; }
if (restored) {
  let legacy: string | null = null;
  try { legacy = localStorage.getItem("cardgame.unit-effects.v1"); } catch { /* Optional v1 migration. */ }
  migrateLegacyEffects(restored, legacy);
  // Never inject prototype cards a second time into an old game.
  if (restored.demoSpecialsAdded === undefined) {
    // Old saves used a second key. Existing special cards are additional
    // evidence when the old key was lost. Never inject twice.
    let meta: { gameId?: string; injected?: boolean } | null = null;
    try { meta = JSON.parse(localStorage.getItem("cardgame.prototype-special-cards.v1") ?? "null"); } catch { /* Optional legacy metadata. */ }
    const cardsInSave = [...restored.state.sharedDeck,
    ...restored.state.players.P1.hand, ...restored.state.players.P2.hand,
    ...restored.state.players.P1.discardPile, ...restored.state.players.P2.discardPile];
    restored.demoSpecialsAdded = (meta?.gameId === restored.gameId && meta.injected === true)
      || cardsInSave.some((id) => PROTOTYPE_SPECIAL_DECK.includes(id));
  }
}
export const wasSessionRestored = restored !== null;
export const gameStore = new GameStore(restored ?? createBasicGame(cards), (session) => {
  try { persistSession(localStorage, session); storageWarning = ""; }
  catch (error) {
    storageWarning = "自动保存失败；当前对局仍在内存中，请不要关闭页面。";
    window.dispatchEvent(new CustomEvent("cardgame:storage-error", { detail: storageWarning }));
    throw error;
  }
});
export const readSession = () => gameStore.read();
export const subscribeSession = (listener: SessionListener) => gameStore.subscribe(listener);
export const persistenceWarning = () => storageWarning;
export function dispatchGame(command: GameCommand): string | null {
  try {
    const disk = parseStored(localStorage.getItem(SAVE_KEY));
    if (disk && gameStore.acceptExternal(disk)) return "对局已在另一窗口更新，请根据最新状态重新操作。";
  } catch { /* The in-memory game remains playable while storage is unavailable. */ }
  return gameStore.dispatch((draft) => applyCommand(draft, catalog, command));
}
export function resetGame(): void { gameStore.replace(createBasicGame(cards)); }

/** Demo extras stay after opening draws, as in the existing prototype. */
export function finishOpeningDeal(): void {
  if (readSession().demoSpecialsAdded) return;
  gameStore.dispatch((draft) => {
    if (draft.demoSpecialsAdded) return null;
    draft.demoSpecialsAdded = true;
    draft.state.sharedDeck.push(...PROTOTYPE_SPECIAL_DECK);
    draft.log.push({
      at: new Date().toISOString(), turn: draft.state.turn,
      text: "演示效果卡加入共享牌库：普通进化石×10、普通攻击×10。仅供查看，效果尚未实现。"
    });
    if (draft.log.length > 300) draft.log.splice(0, draft.log.length - 300);
    for (let i = draft.state.sharedDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [draft.state.sharedDeck[i], draft.state.sharedDeck[j]] = [draft.state.sharedDeck[j]!, draft.state.sharedDeck[i]!];
    }
    return null;
  });
}

window.addEventListener("storage", (event) => {
  // Only real cross-document updates. Same-tab modules use store subscriptions.
  if (!event.isTrusted || event.key !== SAVE_KEY) return;
  const next = parseStored(event.newValue);
  if (next) gameStore.acceptExternal(next);
});
const flush = () => { try { gameStore.flush(); } catch { /* Warning is shown by the adapter. */ } };
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
// Persist the initial state once, including migrated target queues.
gameStore.dispatch((draft) => { settlePendingEffects(draft, catalog); return null; });
if (wasSessionRestored && !readSession().demoSpecialsAdded) finishOpeningDeal();
