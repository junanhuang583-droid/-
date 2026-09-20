import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../assets-source/battlefield-v2/manifest.json' with { type: 'json' };
import { TURN_BACK_RAIL_ASSET, TURN_PLATE, V2, turnFaceRect } from '../src/application/battlefield-v2.js';
import { turnView } from '../src/web/battlefield-view.js';

describe('completed moving back-face lower rail', () => {
  it('ships the checksum-registered lossless derivative while preserving the original B3', () => {
    const asset = manifest.assets.find(a => a.id === TURN_BACK_RAIL_ASSET)!;
    const bytes = readFileSync(`assets-source/battlefield-v2/${asset.transport}`);
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
    const original = readFileSync('assets-source/battlefield-v2/extra/turn-core-back.webp');
    expect(createHash('sha256').update(original).digest('hex'))
      .toBe('adcd3eb725ed3c15c15d18eec873f0102c56b87d7b70ddecb6c5a76f72e365af');
  });
  it('keeps the same registration, proportions and shared pivot', () => {
    expect(TURN_PLATE.crops.back).toEqual({ x:21, y:11, width:156, height:76 });
    const rect = turnFaceRect('back');
    expect(rect.width).toBeCloseTo(V2.core.width, 10);
    expect(rect.width / 156).toBeCloseTo(rect.height / 76, 10);
    expect(rect.x + rect.width / 2).toBeCloseTo(V2.core.x + V2.core.width / 2, 10);
    expect(rect.y + rect.height / 2).toBeCloseTo(V2.core.y + V2.core.height / 2, 10);
  });
  it('binds one completed back image inside the moving plate, not a fixed cover', () => {
    const html = turnView('back-waiting');
    expect((html.match(/class="v2-turn-back-lower-rail"/g) ?? [])).toHaveLength(1);
    expect(html).toContain(`${TURN_BACK_RAIL_ASSET}.webp`);
    expect(html.indexOf(`${TURN_BACK_RAIL_ASSET}.webp`)).toBeGreaterThan(html.indexOf('class="v2-turn-plate"'));
    expect(html.indexOf(`${TURN_BACK_RAIL_ASSET}.webp`)).toBeLessThan(html.indexOf('</button>'));
    expect(html.indexOf('class="v2-turn-rim"')).toBeGreaterThan(html.indexOf('</button>'));
  });
});
