import { BATTLEFIELD, FIXED_SOCKETS, battlefieldTransform } from "../application/battlefield-geometry.js";
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
  plane.style.width = `${BATTLEFIELD.width}px`;
  plane.style.height = `${BATTLEFIELD.height}px`;
  plane.style.transform = `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})`;
  for (const [key, value] of Object.entries({
    "deck-x": FIXED_SOCKETS.deck.x, "deck-y": FIXED_SOCKETS.deck.y,
    "end-turn-x": FIXED_SOCKETS.endTurn.x, "end-turn-y": FIXED_SOCKETS.endTurn.y,
    "scene-y": FIXED_SOCKETS.scene.y,
    "view-left": v.x, "view-top": v.y, "view-width": v.width, "view-height": v.height,
    "opponent-hero-y": v.y + v.height * .08,
    "opponent-line-y": v.y + v.height * .215,
    "active-line-y": v.y + v.height * .54,
    "active-hero-y": v.y + v.height * .705,
    "hand-bottom-y": v.y + v.height,
    "unit-width": Math.min(96, v.height * .152),
    "unit-height": Math.min(86, v.height * .165),
    "unit-step": Math.min(106, v.height * .17),
  })) plane.style.setProperty(`--${key}`, `${value}px`);
  plane.style.setProperty("--world-scale", String(t.scale));
  plane.dataset.viewportScale = String(t.scale);
}
