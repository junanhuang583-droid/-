import { V2, relativeRect, v2Asset } from '../application/battlefield-v2.js';
import { onViewRendered } from './view-events.js';
import './turn-socket-repair.css';

/** The old lower face bevel is baked into the otherwise approved background.
 * A small, source-derived cavity texture repairs only that residual strip.
 * It is a fixed sibling behind the button, never a face/rotation/size change. */
function syncSocketRepair(): void {
  const socket = document.querySelector<HTMLElement>('.v2-turn');
  if (!socket || socket.querySelector('.v2-turn-socket-repair')) return;
  const image = new Image();
  image.className = 'v2-turn-socket-repair';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  image.style.cssText = relativeRect(V2.socketLowerRepair, V2.turnInput);
  image.addEventListener('load', () => {
    image.classList.toggle('is-decoded', image.naturalWidth > 0);
  });
  // Optional visual repair: failure retains the original slot, not a broken
  // image icon or a game input lock. Existing face/text fallbacks are untouched.
  image.addEventListener('error', () => image.classList.remove('is-decoded'));
  image.src = v2Asset('turn-socket-lower-clean');
  socket.prepend(image);
}

onViewRendered(syncSocketRepair, 85);
queueMicrotask(syncSocketRepair);
