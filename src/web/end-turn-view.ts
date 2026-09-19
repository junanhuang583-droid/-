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
  const button = document.querySelector<HTMLButtonElement>('#end-turn');
  if (!button) return;
  button.classList.toggle('end-turn-art-ready',required.every(name => decoded.has(name)));
  // Text always remains live/readable, including load failure and disabled state.
  // 3A-1 only proves all three core assets are available. The back face stays hidden
  // until the dedicated state/motion pass; the true button and retaining brackets stay fixed.
}
