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
/** V2 fixed architectural sockets must use these image-space anchors. */
export const FIXED_SOCKETS = { deck: { x: 180, y: 258 }, endTurn: { x: 1008, y: 258 }, scene: { x: 576, y: 270 } } as const;
