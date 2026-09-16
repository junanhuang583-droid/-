import endTurnUrl from "./assets/ui-stage07/end-turn-device.webp";
import { onViewRendered } from "./view-events.js";

let available = false;
const probe = new Image();
probe.onload = () => { available = probe.naturalWidth > 0; sync(); };
probe.onerror = () => { available = false; sync(); };
probe.src = endTurnUrl;
onViewRendered(sync, 90);
function sync(): void {
  const button = document.querySelector<HTMLButtonElement>("#end-turn");
  if (!button) return;
  button.classList.toggle("end-turn-art-ready", available);
  button.style.setProperty("--end-turn-art", `url("${endTurnUrl}")`);
  // The real text remains available to assistive technology, and visible when
  // the asset is missing or corrupt. No invisible-but-clickable controls.
}
