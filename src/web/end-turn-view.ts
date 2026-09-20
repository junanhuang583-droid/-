import { v2Asset } from '../application/battlefield-v2.js';
import { onViewRendered } from './view-events.js';

const decoded = new Set<string>();
const required = ['turn-core-front-neutral','turn-core-light','turn-core-back'] as const;
for (const name of required) {
  const probe = new Image();
  probe.onload = () => { if (probe.naturalWidth > 0) decoded.add(name); sync(); };
  probe.onerror = () => { decoded.delete(name); sync(); };
  probe.src = v2Asset(name);
}
onViewRendered(sync, 90);
function sync(): void {
  syncEndTurnArt(document.querySelector<HTMLButtonElement>('#end-turn'));
}
export function syncEndTurnArt(button: HTMLButtonElement | null): void {
  if (!button) return;
  button.classList.toggle('end-turn-art-ready',required.every(name => decoded.has(name)));
  // Text always remains live/readable, including load failure and disabled state.
  // 3A-2 derives the visible front/back face from the authoritative session render.
  // This loader only gates artwork readiness; it never owns game or handoff state.
}
