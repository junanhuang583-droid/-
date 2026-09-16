import type { BasicGameSession } from "../core/basic-game.js";
import type { PendingUnitEffect } from "../core/deathrattle-effects.js";
import { isPendingEffect } from "./validation.js";

/** Import pending choices only. Historical death logs must never replay. */
export function migrateLegacyEffects(session: BasicGameSession, raw: string | null): void {
  session.pendingEffects ??= [];
  if (session.revision !== undefined || !raw) return;
  try {
    const legacy = JSON.parse(raw);
    if (legacy.gameId !== session.gameId || !Array.isArray(legacy.queue)) return;
    for (const effect of legacy.queue) {
      if (!isPendingEffect({ ...effect, kind: "unit" })) continue;
      if (session.pendingEffects.some((entry) => entry.id === effect.id)) continue;
      session.pendingEffects.push({ ...effect, kind: "unit" } as PendingUnitEffect);
    }
  } catch { /* Leave the original legacy key untouched for recovery. */ }
}
