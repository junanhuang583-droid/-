/** Short-lived UI exclusion, never a rule state or a persistence field. */
let locked = false;
const listeners = new Set<() => void>();
export const presentationLocked = (): boolean => locked;
export function onPresentationLock(cleanup: () => void): void {
  listeners.add(cleanup);
  if (locked) cleanup();
}
export function setPresentationLocked(next: boolean): void {
  if (locked === next) return;
  locked = next;
  if (next) for (const cleanup of listeners) cleanup();
}
