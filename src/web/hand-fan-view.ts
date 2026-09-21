import { handFan, type FanSlot } from '../application/hand-fan.js';

export function measureHandFan(row: HTMLElement, count: number): FanSlot[] {
  return handFan({ count, rowWidth: row.clientWidth,
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
}
export function applyHandFan(row: HTMLElement): void {
  const cards = [...row.querySelectorAll<HTMLElement>('.hand-card')];
  const slots = measureHandFan(row, cards.length);
  cards.forEach((card, i) => {
    const slot = slots[i]!;
    card.style.setProperty('--ab-width', `${slot.width}px`);
    card.style.setProperty('--ab-overlap', `${slot.overlap}px`);
    card.style.setProperty('--ab-angle', `${slot.angle}deg`);
    card.style.setProperty('--ab-y', `${slot.drop}px`);
    card.style.setProperty('--ab-z', String(slot.z));
    card.style.removeProperty('--stage04-focus-x');
  });
}
