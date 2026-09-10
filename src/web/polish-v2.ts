import type { BasicGameSession } from "../core/basic-game.js";
import type { PlayerId } from "../model/state.js";
import { loadSavedSession } from "./persistence.js";
import "./polish-v2.css";

interface Snapshot {
  gameId: string;
  activePlayer: PlayerId;
  health: Record<PlayerId, number>;
  boards: Record<PlayerId, Array<{ id: string; health: number } | null>>;
}

let previous: Snapshot | null = null;
let scheduled = false;
const root = document.querySelector("#app") ?? document.body;

new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
window.addEventListener("storage", schedule);
window.addEventListener("cardgame:session-updated", schedule);
schedule();

function schedule(): void {
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
  if (!session || !shell) return;

  shell.classList.add("polished-battlefield");
  const next = snapshot(session);

  if (!previous || previous.gameId !== next.gameId) {
    previous = next;
    return;
  }

  if (previous.activePlayer !== next.activePlayer) {
    flashClass(shell, "fx-turn-shift", 520);
  }

  for (const playerId of ["P1", "P2"] as const) {
    if (next.health[playerId] < previous.health[playerId]) {
      flashClass(heroElement(playerId, next.activePlayer), "fx-hero-hit", 430);
    } else if (next.health[playerId] > previous.health[playerId]) {
      flashClass(heroElement(playerId, next.activePlayer), "fx-hero-heal", 520);
    }

    for (let index = 0; index < 5; index += 1) {
      const before = previous.boards[playerId][index];
      const after = next.boards[playerId][index];
      const slot = boardSlotElement(playerId, next.activePlayer, index);
      if (!slot) continue;

      if (!before && after) {
        flashClass(slot, "fx-minion-summon", 500);
      } else if (before && !after) {
        flashClass(slot, "fx-minion-death", 480);
      } else if (before && after && before.id === after.id && after.health < before.health) {
        flashClass(slot, "fx-minion-hit", 380);
      } else if (before && after && before.id === after.id && after.health > before.health) {
        flashClass(slot, "fx-minion-heal", 480);
      } else if (before && after && before.id !== after.id) {
        flashClass(slot, "fx-minion-transform", 520);
      }
    }
  }

  previous = next;
}

function snapshot(session: BasicGameSession): Snapshot {
  return {
    gameId: session.gameId,
    activePlayer: session.state.activePlayer,
    health: {
      P1: session.state.players.P1.health,
      P2: session.state.players.P2.health,
    },
    boards: {
      P1: session.state.players.P1.board.map((minion) => minion ? { id: minion.instanceId, health: minion.currentHealth } : null),
      P2: session.state.players.P2.board.map((minion) => minion ? { id: minion.instanceId, health: minion.currentHealth } : null),
    },
  };
}

function heroElement(playerId: PlayerId, activePlayer: PlayerId): HTMLElement | null {
  return document.querySelector<HTMLElement>(playerId === activePlayer ? ".active-hero" : ".opponent-hero");
}

function boardSlotElement(playerId: PlayerId, activePlayer: PlayerId, index: number): HTMLElement | null {
  const selector = playerId === activePlayer ? ".active-board .board-slot" : ".opponent-board .board-slot";
  return document.querySelectorAll<HTMLElement>(selector)[index] ?? null;
}

function flashClass(element: HTMLElement | null, className: string, duration: number): void {
  if (!element) return;
  element.classList.remove(className);
  // Force a new animation even if the same event fires twice quickly.
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}
