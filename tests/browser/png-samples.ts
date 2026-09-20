import { inflateSync } from 'node:zlib';

/** Decode the 8-bit RGB/RGBA PNG screenshots produced by Playwright.
 * Test-only pixel reader, not another screenshot or graphics dependency. */
export function pngPixels(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Not PNG');
  let width = 0, height = 0, channels = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const content = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      width = content.readUInt32BE(0); height = content.readUInt32BE(4);
      if (content[8] !== 8 || ![2,6].includes(content[9]!) || content[12] !== 0) throw new Error('Unsupported screenshot PNG');
      channels = content[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') data.push(content);
    offset += size + 12;
  }
  if (!width || !height || !channels) throw new Error('Missing PNG header');
  const raw = inflateSync(Buffer.concat(data)), stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error('Invalid screenshot length');
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)]!;
    if (type > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= channels ? out[index - channels]! : 0;
      const b = y > 0 ? out[index - stride]! : 0;
      const c = y > 0 && x >= channels ? out[index - stride - channels]! : 0;
      const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
      const predictor = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a+b)>>1
        : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[index] = (raw[y*(stride+1)+1+x]! + predictor) & 255;
    }
  }
  return { width, height, rgb(x: number, y: number): [number, number, number] {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('Pixel outside screenshot');
    const i = (y * width + x) * channels;
    return [out[i]!, out[i+1]!, out[i+2]!];
  }};
}
