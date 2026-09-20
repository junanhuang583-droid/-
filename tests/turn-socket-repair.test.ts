import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../assets-source/battlefield-v2/manifest.json' with { type: 'json' };
import { V2, relativeRect } from '../src/application/battlefield-v2.js';

describe('lower socket repair keeps the released plate and artwork authoritative', () => {
  it('registers a verified, local texture extension through the normal asset transport', () => {
    const asset = manifest.assets.find(a => a.id === 'turn-socket-lower-clean')!;
    const bytes = readFileSync('assets-source/battlefield-v2/extra/turn-socket-lower-clean.webp');
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
    expect(asset.worldRect).toEqual([V2.socketLowerRepair.x, V2.socketLowerRepair.y,
      V2.socketLowerRepair.width, V2.socketLowerRepair.height]);
  });
  it('leaves the original approved background and B3 bytes unchanged', () => {
    expect(manifest.assets.find(a => a.id === 'battlefield-v2-clean')!.sha256)
      .toBe('267d743ce079b1a7aa0d93371348cadd9546bd44b78c873a124330fe6100429b');
    const b3 = readFileSync('assets-source/battlefield-v2/extra/turn-core-back.webp');
    expect(createHash('sha256').update(b3).digest('hex'))
      .toBe('adcd3eb725ed3c15c15d18eec873f0102c56b87d7b70ddecb6c5a76f72e365af');
  });
  it('keeps the fix inside the existing housing and preserves the shared pivot', () => {
    const r = V2.socketLowerRepair, h = V2.housing;
    expect(r.x).toBeGreaterThan(h.x);
    expect(r.y).toBeGreaterThan(h.y);
    expect(r.x + r.width).toBeLessThan(h.x + h.width);
    expect(r.y + r.height).toBeLessThan(h.y + h.height);
    expect(V2.core.x + V2.core.width / 2).toBeCloseTo(V2.turnInput.x + V2.turnInput.width / 2, 9);
    expect(V2.core.y + V2.core.height / 2).toBeCloseTo(V2.turnInput.y + V2.turnInput.height / 2, 9);
    expect(relativeRect(r, V2.turnInput)).not.toMatch(/NaN|Infinity/);
  });
});
