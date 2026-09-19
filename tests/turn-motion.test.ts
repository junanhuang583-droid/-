import { describe, expect, it } from 'vitest';
import { TURN_MOTION, restPose, sampleTurnPose, turnTiming, turnSamples, turnLighting, plateTransform } from '../src/application/turn-motion.js';

const front = { angle: 0, press: 0, glow: 1 };
const back = { face: 'back', ready: false } as const;
describe('R2 optical trajectory without a rule-state owner', () => {
  it('turns one plate from 0 to 180 and back with exact rest endpoints', () => {
    for (const [from, target] of [[front, back], [restPose(back), { face: 'front', ready: true }]] as const) {
      expect(sampleTurnPose(from, target, 0)).toEqual(from);
      expect(sampleTurnPose(from, target, turnTiming(from, target).duration)).toEqual(restPose(target));
    }
  });
  it('has one monotonic rotation with a nonzero continuous velocity at 90 degrees', () => {
    const times = turnTiming(front, back), middle = times.takeUp + TURN_MOTION.rotateMs / 2;
    expect(sampleTurnPose(front, back, middle).angle).toBe(90);
    const left = (90 - sampleTurnPose(front, back, middle - .1).angle) / .1;
    const right = (sampleTurnPose(front, back, middle + .1).angle - 90) / .1;
    expect(left).toBeGreaterThan(1);
    expect(left).toBeCloseTo(right, 8);
    const frames = turnSamples(front, back);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.angle).toBeGreaterThanOrEqual(frames[i-1]!.angle);
  });
  it('continues a held press rather than releasing and pressing for a second time', () => {
    const held = { ...front, press: TURN_MOTION.pressDepth };
    expect(turnTiming(front, back).duration).toBe(380);
    expect(turnTiming(held, back).takeUp).toBe(0);
    expect(turnTiming(held, back).duration).toBe(320);
    expect(sampleTurnPose(held, back, 0).press).toBe(TURN_MOTION.pressDepth);
    const frames = turnSamples(held, back);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.press).toBeLessThanOrEqual(frames[i-1]!.press);
  });
  it('does not replay the outgoing press when revealing the front', () => {
    const from = restPose(back), target = { face: 'front', ready: true } as const;
    expect(turnTiming(from, target).takeUp).toBe(0);
    expect(Math.max(...turnSamples(from, target).map(p => p.press))).toBeLessThanOrEqual(.25);
  });
  it('retains outgoing amber until the front is facing away', () => {
    const timing = turnTiming(front, back);
    for (const portion of [0,.25,.5,.55])
      expect(sampleTurnPose(front, back, timing.takeUp + TURN_MOTION.rotateMs * portion).glow).toBe(1);
  });
  it('arrives at the real locked brightness without falsely enabling the control', () => {
    const target = { face: 'front', ready: false } as const;
    const from = restPose(back), time = turnTiming(from, target).duration;
    expect(sampleTurnPose(from, target, time)).toEqual({angle:0,press:0,glow:TURN_MOTION.blockedGlow});
    expect(restPose({ face:'front',ready:true }).glow).toBe(1);
  });
  it('uses finite bounded surface lighting with no brightness flash at either end', () => {
    for (const angle of [0,30,60,90,120,150,180]) {
      const light = turnLighting(angle);
      expect(light.shade).toBeGreaterThanOrEqual(0);
      expect(light.shade).toBeLessThanOrEqual(.27);
      expect(light.sheen).toBeLessThanOrEqual(.10);
      expect(light.shadowTransform).not.toMatch(/NaN|Infinity/);
    }
    expect(turnLighting(0).shade).toBe(0);
    expect(turnLighting(180).shade).toBeCloseTo(0,12);
    expect(plateTransform(90)).toBe('translateZ(-1.5px) rotateX(90deg)');
  });
  it('keeps exact time boundaries and orders every sample on the same timeline', () => {
    const frames = turnSamples(front, back);
    expect(frames[0]!.offset).toBe(0);
    expect(frames.at(-1)!.offset).toBe(1);
    for (let i=1;i<frames.length;i++) expect(frames[i]!.offset).toBeGreaterThan(frames[i-1]!.offset);
  });
});
