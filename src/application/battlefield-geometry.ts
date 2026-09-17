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
export const FIXED_SOCKETS = { deck: { x: 180, y: 258 }, endTurn: { x: 1008, y: 258 }, scene: { x: 576, y: 270 } } as const;

export const HERO_HEIGHT = 55;
export const HERO_LINE_CLEARANCE = 6;

/** Shared dimensions and centers, expressed in authored-world pixels.
 * Percentage-only centers overlap fixed-height heroes on wide, short screens.
 * Enforce their physical extents here instead of adding another CSS override. */
export function gameplayGeometry(t: ViewportTransform) {
  const v = t.visible;
  const unitHeight = Math.min(86, v.height * .165);
  const opponentHeroY = v.y + v.height * .08;
  const activeHeroY = v.y + v.height * .705;
  const separation = HERO_HEIGHT / 2 + unitHeight / 2 + HERO_LINE_CLEARANCE;
  return {
    heroHeight: HERO_HEIGHT,
    opponentHeroY,
    opponentLineY: Math.max(v.y + v.height * .215, opponentHeroY + separation),
    activeLineY: Math.min(v.y + v.height * .54, activeHeroY - separation),
    activeHeroY,
    handBottomY: v.y + v.height,
    unitWidth: Math.min(96, v.height * .152),
    unitHeight,
    unitStep: Math.min(106, v.height * .17),
  };
}
