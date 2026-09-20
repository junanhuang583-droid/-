import { TURN_PLATE } from './battlefield-v2.js';
import type { TurnControlFace } from './turn-control-state.js';

/** Cosmetic parameters only. No session, command, draw count or timer belongs here. */
export const TURN_MOTION = {
  pressDepth: 1.8, takeUpMs: 60, rotateMs: 250, settleMs: 70,
  lightMs: 120, readyGlow: 1, blockedGlow: .42,
} as const;
export interface TurnPose { angle: number; press: number; glow: number }
export interface TurnMotionTarget { face: TurnControlFace; ready: boolean }
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function restPose(target: TurnMotionTarget): TurnPose {
  return { angle: target.face === 'front' ? 0 : 180, press: 0,
    glow: target.ready ? TURN_MOTION.readyGlow : TURN_MOTION.blockedGlow };
}
export function turnTiming(from: TurnPose, to: TurnMotionTarget) {
  // Returning to the front does not replay the outgoing button press.
  const takeUp = to.face === 'back' ? TURN_MOTION.takeUpMs * (1 - clamp(from.press / TURN_MOTION.pressDepth)) : 0;
  return { takeUp, spinEnd: takeUp + TURN_MOTION.rotateMs,
    duration: takeUp + TURN_MOTION.rotateMs + TURN_MOTION.settleMs };
}
export function sampleTurnPose(from: TurnPose, target: TurnMotionTarget, time: number): TurnPose {
  const timing = turnTiming(from, target), to = restPose(target);
  if (time <= 0) return { ...from };
  if (time >= timing.duration) return to;
  const q = clamp((time - timing.takeUp) / TURN_MOTION.rotateMs);
  const enteringPress = target.face === 'back' ? TURN_MOTION.pressDepth : from.press;
  let press: number;
  if (time < timing.takeUp) press = mix(from.press, enteringPress, smooth(time / timing.takeUp));
  else if (time < timing.spinEnd) press = mix(enteringPress, .25, smooth(q));
  else press = mix(.25, 0, smooth((time - timing.spinEnd) / TURN_MOTION.settleMs));
  // The outgoing amber face keeps its appearance until it has turned away.
  const lightProgress = target.face === 'back' ? smooth((q - .55) / .45) : smooth(q);
  return { angle: mix(from.angle, to.angle, smooth(q)), press,
    glow: mix(from.glow, to.glow, lightProgress) };
}
export function plateTransform(angle: number): string {
  return `translateZ(${-TURN_PLATE.depth / 2}px) rotateX(${angle}deg)`;
}
export function turnLighting(angle: number) {
  const radians = angle * Math.PI / 180, tilt = Math.abs(Math.sin(radians));
  return { shade: .27 * tilt * tilt, sheen: .10 * Math.sin(2 * radians) ** 2,
    shadowOpacity: .22 + .08 * tilt,
    shadowTransform: `translateY(${22 * Math.abs(Math.cos(radians))}px) scaleY(${1 - .7 * tilt})` };
}
/** Dense linear keyframes sample one smooth trajectory; 90 degrees is not a seam. */
export function turnSamples(from: TurnPose, target: TurnMotionTarget) {
  const timing = turnTiming(from, target);
  const times = new Set([0, timing.takeUp, timing.spinEnd, timing.duration]);
  for (let i = 1; i < 80; i++) times.add(timing.duration * i / 80);
  return [...times].sort((a, b) => a - b).map(time => ({
    offset: time / timing.duration, ...sampleTurnPose(from, target, time),
  }));
}
