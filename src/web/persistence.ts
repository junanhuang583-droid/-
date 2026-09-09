import type { BasicGameSession } from "../core/basic-game.js";

const SAVE_KEY = "lushizhizao.basic-game.v1";
const BACKUP_KEY = "lushizhizao.basic-game.v1.backup";

export function loadSavedSession(): BasicGameSession | null {
  return parseStored(localStorage.getItem(SAVE_KEY)) ?? parseStored(localStorage.getItem(BACKUP_KEY));
}

export function saveSession(session: BasicGameSession): void {
  session.updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(session);
  const previous = localStorage.getItem(SAVE_KEY);
  if (previous) localStorage.setItem(BACKUP_KEY, previous);
  localStorage.setItem(SAVE_KEY, serialized);
}

export function clearSavedSession(): void {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(BACKUP_KEY);
}

export function installPersistenceGuards(getSession: () => BasicGameSession): () => void {
  const saveNow = () => {
    try {
      saveSession(getSession());
    } catch (error) {
      console.error("保存对局失败", error);
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") saveNow();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", saveNow);
  window.addEventListener("beforeunload", saveNow);
  const timer = window.setInterval(saveNow, 5000);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", saveNow);
    window.removeEventListener("beforeunload", saveNow);
    window.clearInterval(timer);
  };
}

function parseStored(value: string | null): BasicGameSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BasicGameSession>;
    if (parsed.schemaVersion !== 1 || !parsed.state || !parsed.gameId) return null;
    return parsed as BasicGameSession;
  } catch {
    return null;
  }
}
