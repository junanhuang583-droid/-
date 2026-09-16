import type { BasicGameSession } from "../core/basic-game.js";

export type ChangeReason = "command" | "new-game" | "external";
export type SessionListener = (reason: ChangeReason) => void;

/** One owner. Commands mutate drafts, and an error cannot commit a partial turn. */
export class GameStore {
  private state: BasicGameSession;
  private listeners = new Set<SessionListener>();
  private notifying = false;
  private dirty = false;

  constructor(initial: BasicGameSession, private readonly persist: (state: BasicGameSession) => void = () => { }) {
    this.state = structuredClone(initial);
  }

  read(): BasicGameSession { return structuredClone(this.state); }
  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(reduce: (draft: BasicGameSession) => string | null): string | null {
    if (this.notifying) return "状态正在同步，请稍后再试。";
    const draft = this.read();
    const error = reduce(draft);
    if (error) return error;
    this.commit(draft, "command");
    return null;
  }

  replace(next: BasicGameSession): void { this.commit(structuredClone(next), "new-game"); }

  acceptExternal(next: BasicGameSession): boolean {
    if (next.updatedAt <= this.state.updatedAt) return false;
    this.state = structuredClone(next);
    this.dirty = false;
    this.notify("external");
    return true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.persist(this.read());
    this.dirty = false;
  }

  private commit(draft: BasicGameSession, reason: ChangeReason): void {
    draft.revision = (this.state.revision ?? 0) + 1;
    const previous = Date.parse(this.state.updatedAt);
    draft.updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
    this.state = draft;
    this.dirty = true;
    // Storage failures do not roll back a valid move. The adapter reports them;
    // the store retains a dirty snapshot for the next explicit flush.
    try { this.flush(); } catch { /* Keep the dirty flag. */ }
    this.notify(reason);
  }

  private notify(reason: ChangeReason): void {
    this.notifying = true;
    try {
      for (const listener of this.listeners) {
        try { listener(reason); }
        catch (error) { console.error("Session subscriber failed after commit", error); }
      }
    }
    finally { this.notifying = false; }
  }
}
