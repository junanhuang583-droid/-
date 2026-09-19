import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { V2, TURN_PLATE, turnFaceRect, turnPlateEdges, turnTextureImageStyle } from '../src/application/battlefield-v2.js';
import { turnView } from '../src/web/battlefield-view.js';

describe('R1 registered thin plate, no new rule or motion state', () => {
  it('preserves the approved B3 bytes and records only a transparent-margin window', () => {
    const bytes = readFileSync('assets-source/battlefield-v2/extra/turn-core-back.webp');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('adcd3eb725ed3c15c15d18eec873f0102c56b87d7b70ddecb6c5a76f72e365af');
    expect(TURN_PLATE.crops.back).toEqual({ x:21, y:11, width:156, height:76 });
    expect(TURN_PLATE.crops.front).toEqual({ x:0, y:0, width:196, height:96 });
  });
  it('fits both visible faces uniformly without stretching the B3 emblem', () => {
    for (const face of ['front', 'back'] as const) {
      const rect = turnFaceRect(face), crop = TURN_PLATE.crops[face];
      expect(rect.width / crop.width).toBeCloseTo(rect.height / crop.height, 12);
      expect(rect.width).toBeLessThanOrEqual(V2.core.width);
      expect(rect.height).toBeLessThanOrEqual(V2.core.height);
    }
    const back = turnFaceRect('back');
    expect(back.width).toBeCloseTo(V2.core.width, 10);
    expect(V2.core.height - back.height).toBeLessThan(.5);
  });
  it('keeps both face centers on the same fixed input pivot', () => {
    for (const face of ['front', 'back'] as const) {
      const rect = turnFaceRect(face);
      expect(rect.x + rect.width / 2).toBeCloseTo(V2.turnInput.x + V2.turnInput.width / 2, 10);
      expect(rect.y + rect.height / 2).toBeCloseTo(V2.turnInput.y + V2.turnInput.height / 2, 10);
    }
    expect(turnTextureImageStyle('front')).toBe('left:0%;top:0%;width:100%;height:100%');
    expect(turnTextureImageStyle('back')).toContain('width:125.64102564102564%');
  });
  it('provides eight finite narrow perimeter planes and a shared physical depth', () => {
    expect(TURN_PLATE.depth).toBe(3);
    const edges = turnPlateEdges();
    expect(edges).toHaveLength(8);
    for (const edge of edges) {
      expect(edge).not.toMatch(/NaN|Infinity/);
      const width = Number(/width:([\d.]+)px/.exec(edge)?.[1]);
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThan(V2.core.width);
    }
  });
  it('mounts both textures on one plate while the rim remains outside the hitbox', () => {
    for (const state of ['front-ready', 'front-disabled', 'back-waiting'] as const) {
      const html = turnView(state);
      expect((html.match(/class="v2-turn-plate"/g) ?? [])).toHaveLength(1);
      expect((html.match(/data-turn-edge=/g) ?? [])).toHaveLength(8);
      expect(html).toContain('data-turn-texture="front"');
      expect(html).toContain('data-turn-texture="back"');
      expect(html).toContain('--turn-plate-depth:3px');
      expect(html.indexOf('class="v2-turn-rim"')).toBeGreaterThan(html.indexOf('</button>'));
      expect(html).toContain('结束回合');
      expect(html).toContain('等待接手');
    }
  });
});
