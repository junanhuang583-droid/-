import { V2_ANCHORS } from "./battlefield-v2.js";
export const BATTLEFIELD = { width: 1152, height: 648 } as const;
export interface ViewportTransform {
  scale: number; offsetX: number; offsetY: number;
  visible: { x: number; y: number; width: number; height: number };
}
export function battlefieldTransform(width: number, height: number): ViewportTransform {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid viewport dimensions");
  const scale = Math.max(width / BATTLEFIELD.width, height / BATTLEFIELD.height);
  const offsetX = (width - BATTLEFIELD.width * scale) / 2;
  const offsetY = (height - BATTLEFIELD.height * scale) / 2;
  return { scale, offsetX, offsetY, visible: { x: -offsetX / scale, y: -offsetY / scale, width: width / scale, height: height / scale } };
}
export function worldToScreen(t: ViewportTransform, x: number, y: number) {
  return { x: t.offsetX + x * t.scale, y: t.offsetY + y * t.scale };
}
export function screenToWorld(t: ViewportTransform, x: number, y: number) {
  return { x: (x - t.offsetX) / t.scale, y: (y - t.offsetY) / t.scale };
}
/** Fixed architectural sockets use image coordinates. V2 must jointly approve
 * these anchors and its crop-safe artwork; responsive gameplay rows are not
 * architectural sockets and may move inside the visible image crop. */
export const FIXED_SOCKETS = { deck: V2_ANCHORS.deck, endTurn: V2_ANCHORS.endTurn, scene: { x: 576, y: 270 } } as const;

export const HERO_HEIGHT = 132;
export const HERO_LINE_CLEARANCE = 8;

/** Fit complete V2 portrait groups inside the visible crop. Enforce actual
 * frame extents, minion rows, scene clearance and the collapsed hand band. */
export function gameplayGeometry(t: ViewportTransform) {
  const v = t.visible;
  const unitHeight = Math.min(78, v.height * .12);
  const topMargin = 6;
  const sceneTop = FIXED_SOCKETS.scene.y - 15;
  const heroHeight = Math.max(48, Math.min(HERO_HEIGHT, v.height * .215,
    sceneTop - v.y - unitHeight - topMargin - HERO_LINE_CLEARANCE - 4));
  const opponentHeroY = v.y + topMargin + heroHeight / 2;
  const opponentLineY = opponentHeroY + heroHeight / 2 + HERO_LINE_CLEARANCE + unitHeight / 2;
  const activeHeroY = v.y + v.height - 68 - heroHeight / 2;
  const activeLineY = activeHeroY - heroHeight / 2 - HERO_LINE_CLEARANCE - unitHeight / 2;
  return {
    heroHeight, opponentHeroY, opponentLineY, activeLineY, activeHeroY,
    handBottomY: v.y + v.height,
    unitWidth: Math.min(88, v.height * .135),
    unitHeight,
    unitStep: Math.min(104, v.height * .165),
  };
}
