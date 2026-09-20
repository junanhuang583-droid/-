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
  // Exact crop in the existing 2304x1296 exported background, converted to world.
  // A fixed cavity repair, never part of the rotating plate or the input box.
  socketLowerRepair: { x: 1948 / 2, y: 616 / 2, width: 316 / 2, height: 63 / 2 },
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

/** R1 solid registration, in the existing authored world plane. Both textures
 * stay on one unchanged core. The B3 sprite window removes margins, not artwork. */
export const TURN_PLATE = {
  depth: 3,
  // Pixel windows, measured against the approved native textures. They remove
  // only transparent padding; the raw assets and transport hashes stay intact.
  crops: { front: { x: 0, y: 0, width: 196, height: 96 },
    back: { x: 21, y: 11, width: 156, height: 76 } },
  pivot: { x: .5, y: .5 },
  // The cut corners follow the front's structural perimeter, not its shadows.
  outline: [[38, 0], [161, 0], [196, 24], [196, 72],
    [162, 96], [36, 96], [0, 72], [0, 24]],
  sourceSize: { width: 196, height: 96 },
} as const;

export function turnPlateStyle(): string {
  return `--turn-plate-depth:${TURN_PLATE.depth}px;--turn-plate-half-depth:${TURN_PLATE.depth / 2}px`;
}

/** Local restoration belongs to the moving B3 texture, never the fixed cavity. */
export const TURN_BACK_RAIL_ASSET = 'turn-core-back-lower-rail';

/** A uniform contain fit preserves the approved emblem's aspect ratio. */
export function turnFaceRect(face: 'front' | 'back'): Rect {
  const id = face === 'front' ? 'turn-core-front-neutral' : 'turn-core-back';
  const asset = assetManifest.assets.find(entry => entry.id === id);
  if (!asset || asset.width <= 0 || asset.height <= 0) throw new Error(`Invalid turn face: ${id}`);
  const crop = TURN_PLATE.crops[face];
  if (crop.x + crop.width > asset.width || crop.y + crop.height > asset.height)
    throw new Error(`Turn crop exceeds texture: ${id}`);
  const scale = Math.min(V2.core.width / crop.width, V2.core.height / crop.height);
  const width = crop.width * scale, height = crop.height * scale;
  return { x: V2.core.x + (V2.core.width - width) / 2,
    y: V2.core.y + (V2.core.height - height) / 2, width, height };
}

/** Eight narrow edge planes, not a second painted housing. At rest the front
 * surface is at z=0; the slab extends into the socket, never towards the rim. */
export function turnPlateEdges(): string[] {
  const points = TURN_PLATE.outline.map(([x, y]) => ({
    x: x / TURN_PLATE.sourceSize.width * V2.core.width,
    y: y / TURN_PLATE.sourceSize.height * V2.core.height,
  }));
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const dx = next.x - point.x, dy = next.y - point.y;
    return `left:${point.x}px;top:${point.y}px;width:${Math.hypot(dx, dy)}px;--edge-angle:${Math.atan2(dy, dx) * 180 / Math.PI}deg`;
  });
}

/** Clip only the texture child, never the plate/3D transform owner. */
export function turnTextureStyle(face: 'front' | 'back'): string {
  return relativeRect(turnFaceRect(face), V2.core);
}
export function turnTextureImageStyle(face: 'front' | 'back'): string {
  const crop = TURN_PLATE.crops[face];
  return relativeRect({ x: 0, y: 0, ...TURN_PLATE.sourceSize }, crop);
}
