import assetManifest from "../../assets-source/battlefield-v2/manifest.json" with { type: "json" };
/** Approved 1672x941 master -> 1152x648 authored plane. This module is the
 * only owner of V2 registration; cropped textures never infer their own size. */
export const MASTER_TO_WORLD = 144 / 209;
export interface Rect { x: number; y: number; width: number; height: number }
export function sourceRect(x: number, y: number, width: number, height: number): Rect {
  return { x: x * MASTER_TO_WORLD, y: (y - .25) * MASTER_TO_WORLD,
    width: width * MASTER_TO_WORLD, height: height * MASTER_TO_WORLD };
}
export const V2 = {
  deck: sourceRect(8,244,284,348),
  card: sourceRect(48,297,142,177),
  deckRim: sourceRect(24,270,210,233),
  count: sourceRect(76,495,100,38),
  housing: sourceRect(1368,338,296,194),
  core: sourceRect(1430,384,196,96),
  turnInput: sourceRect(1416,376,224,112),
  opponentHero: sourceRect(686,4,299,278),
  activeHero: sourceRect(690,610,308,294),
} as const;
export const V2_ANCHORS = {
  deck: { x: 126 * MASTER_TO_WORLD, y: (376-.25) * MASTER_TO_WORLD },
  endTurn: { x: 1528 * MASTER_TO_WORLD, y: (432-.25) * MASTER_TO_WORLD },
} as const;
export interface DeckSlice { index: number; dx: number; dy: number }
/** Visual thickness is bounded independently of the actual card count. */
export function deckSlices(count: number): DeckSlice[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid remaining deck count');
  const layers = Math.min(4, count);
  const dx = (count > 12 ? 1.5 : 1) * MASTER_TO_WORLD;
  const dy = (count > 12 ? 2.5 : 1.5) * MASTER_TO_WORLD;
  return Array.from({ length: layers }, (_, index) => {
    const depth = layers - 1 - index;
    return { index, dx: depth * dx, dy: depth * dy };
  });
}
/** Percent registration inside responsive source-canvas groups, not screen space. */
export function relativeRect(child: Rect, parent: Rect): string {
  return `left:${(child.x-parent.x)/parent.width*100}%;top:${(child.y-parent.y)/parent.height*100}%;width:${child.width/parent.width*100}%;height:${child.height/parent.height*100}%`;
}
export function fixedRect(r: Rect): string {
  return `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;
}
export const v2Asset = (name: string): string => `./assets/battlefield-v2/${assetManifest.version}/${name}.webp`;
