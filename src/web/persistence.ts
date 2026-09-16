import { isSession } from "../application/validation.js";
import type { BasicGameSession } from "../core/basic-game.js";

export const SAVE_KEY = "lushizhizao.basic-game.v1";
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; }

/** The v1 disk format is retained. Invalid primaries never overwrite a good backup. */
export function parseStored(value: string | null): BasicGameSession | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isSession(parsed)) return null;
    parsed.pendingEffects ??= [];
    return parsed;
  } catch { return null; }
}

export function restoreSession(storage: StoragePort): BasicGameSession | null {
  return parseStored(storage.getItem(SAVE_KEY)) ?? parseStored(storage.getItem(BACKUP_KEY));
}

export function persistSession(storage: StoragePort, session: BasicGameSession): void {
  const serialized = JSON.stringify(session);
  const previous = storage.getItem(SAVE_KEY);
  // Backup rotation may exceed quota; a primary write is still worth attempting.
  if (previous && parseStored(previous)) {
    try { storage.setItem(BACKUP_KEY, previous); } catch { /* Keep the previous backup. */ }
  }
  storage.setItem(SAVE_KEY, serialized);
}
