/** The existing fan's one layout calculation, shared by static hands and draws.
 * All dimensions here are authored-world pixels, not a second viewport ruler. */
export interface FanSlot { index: number; left: number; width: number; overlap: number; angle: number; drop: number; z: number }
export interface FanInput { count: number; rowWidth: number; viewportWidth: number; viewportHeight: number }
export function handFan(input: FanInput): FanSlot[] {
  const { count, rowWidth, viewportWidth, viewportHeight } = input;
  if (!Number.isSafeInteger(count) || count < 0 || ![rowWidth, viewportWidth, viewportHeight].every(Number.isFinite))
    throw new Error('Invalid hand layout');
  if (!count) return [];
  const available = Math.max(260, rowWidth > 0 ? rowWidth - 12 : Math.min(viewportWidth * .82, 980));
  const width = viewportHeight <= 500 ? 82 : viewportWidth >= 1100 ? 104 : 92;
  const ratio = count >= 20 ? .90 : count >= 14 ? .84 : .78;
  const overlap = count > 1 ? Math.max(0, Math.min((count * width - available) / (count - 1), width * ratio)) : 0;
  const start = (rowWidth - (count * width - (count - 1) * overlap)) / 2;
  const center = (count - 1) / 2;
  const step = count <= 8 ? 2.05 : count <= 13 ? 1.35 : count <= 20 ? .82 : .58;
  const edge = count >= 20 ? 5 : count >= 14 ? 7 : 9;
  return Array.from({ length: count }, (_, index) => {
    const distance = index - center;
    return { index, left: start + index * (width - overlap), width,
      overlap: index ? -overlap : 0, angle: Math.max(-9, Math.min(9, distance * step)),
      drop: Math.min(edge, Math.abs(distance) * .95), z: 100 - Math.round(Math.abs(distance)) };
  });
}
