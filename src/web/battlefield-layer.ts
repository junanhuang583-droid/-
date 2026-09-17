import { BATTLEFIELD, FIXED_SOCKETS, battlefieldTransform, gameplayGeometry } from "../application/battlefield-geometry.js";
import "./battlefield-layout.css";
import { onViewRendered } from "./view-events.js";

let lastViewport: Element | null = null;
const observer = new ResizeObserver(syncViewport);
onViewRendered(syncViewport, 0);
window.addEventListener("resize", syncViewport);
document.addEventListener("fullscreenchange", syncViewport);

function syncViewport(): void {
  const viewport = document.querySelector<HTMLElement>(".battlefield-viewport");
  const plane = document.querySelector<HTMLElement>(".battlefield-coordinate-layer");
  if (!viewport || !plane) return;
  if (lastViewport !== viewport) { observer.disconnect(); observer.observe(viewport); lastViewport = viewport; }
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  const t = battlefieldTransform(width, height);
  const v = t.visible;
  const layout = gameplayGeometry(t);
  plane.style.width = `${BATTLEFIELD.width}px`;
  plane.style.height = `${BATTLEFIELD.height}px`;
  plane.style.transform = `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})`;
  for (const [key, value] of Object.entries({
    "deck-x": FIXED_SOCKETS.deck.x, "deck-y": FIXED_SOCKETS.deck.y,
    "end-turn-x": FIXED_SOCKETS.endTurn.x, "end-turn-y": FIXED_SOCKETS.endTurn.y,
    "scene-y": FIXED_SOCKETS.scene.y,
    "view-left": v.x, "view-top": v.y, "view-width": v.width, "view-height": v.height,
    "hero-height": layout.heroHeight,
    "opponent-hero-y": layout.opponentHeroY,
    "opponent-line-y": layout.opponentLineY,
    "active-line-y": layout.activeLineY,
    "active-hero-y": layout.activeHeroY,
    "hand-bottom-y": layout.handBottomY,
    "unit-width": layout.unitWidth,
    "unit-height": layout.unitHeight,
    "unit-step": layout.unitStep,
  })) plane.style.setProperty(`--${key}`, `${value}px`);
  plane.style.setProperty("--world-scale", String(t.scale));
  plane.dataset.viewportScale = String(t.scale);
}
