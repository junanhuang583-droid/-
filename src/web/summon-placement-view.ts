import type { SummonOptions } from '../core/summon-options.js';
import './summon-placement-view.css';

/** Temporary optical children of existing logical slots. No snapshot ownership,
 * DOM rule inference, command dispatch or independent geometry calculations. */
export class SummonPlacementView {
  private board: HTMLElement | null = null;
  private key = '';
  private targets: HTMLElement[] = [];
  private active: HTMLElement | null = null;
  private labels = new Map<HTMLElement, string | null>();

  show(options: SummonOptions): void {
    const board = document.querySelector<HTMLElement>('.active-board');
    if (options.kind === 'blocked' || !board) { this.clear(); return; }
    const key = JSON.stringify(options);
    if (this.board === board && key === this.key) return;
    this.clear(); this.board = board; this.key = key;
    board.dataset.summonMode = options.kind;
    this.targets = options.kind === 'direct'
      ? options.slots.map(slot => board.querySelector<HTMLElement>(`[data-empty-slot="${slot}"]`)).filter((e): e is HTMLElement => Boolean(e))
      : [...board.querySelectorAll<HTMLElement>('[data-minion-id]')].filter(e => options.candidates.includes(e.dataset.minionId!));
    this.targets.forEach(target => {
      target.dataset.summonLegal = 'true';
      this.labels.set(target, target.getAttribute('aria-label'));
      if (options.kind === 'direct') target.setAttribute('aria-label', `召唤至${Number(target.dataset.emptySlot)+1}号位`);
      const mark = document.createElement('span');
      mark.className = 'summon-placement-mark'; mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<i class="summon-placement-corners"></i><i class="summon-placement-spark"></i><small class="summon-placement-caption"></small>';
      mark.querySelector('small')!.textContent = options.kind === 'direct' ? '可召唤' : '可献祭';
      target.append(mark);
    });
  }
  hit(x: number, y: number): HTMLElement | null {
    const element = document.elementFromPoint(x, y);
    return element instanceof Element ? this.targets.find(target => target.contains(element)) ?? null : null;
  }
  highlight(target: HTMLElement | null): void {
    if (this.active === target) return;
    if (this.active) {
      delete this.active.dataset.summonTarget;
      const label = this.active.querySelector('.summon-placement-caption');
      if (label) label.textContent = this.board?.dataset.summonMode === 'sacrifice' ? '可献祭' : '可召唤';
    }
    this.active = target;
    if (target) {
      target.dataset.summonTarget = 'true';
      const label = target.querySelector('.summon-placement-caption');
      if (label) label.textContent = this.board?.dataset.summonMode === 'sacrifice' ? '选择祭品' : '松手召唤';
    }
  }
  first(): HTMLElement | null { return this.targets[0] ?? null; }
  clear(): void {
    this.targets.forEach(target => {
      delete target.dataset.summonLegal; delete target.dataset.summonTarget;
      target.querySelectorAll('.summon-placement-mark').forEach(e => e.remove());
      const label = this.labels.get(target);
      if (label == null) target.removeAttribute('aria-label'); else target.setAttribute('aria-label', label);
    });
    if (this.board) delete this.board.dataset.summonMode;
    this.targets = []; this.labels.clear(); this.board = null; this.active = null; this.key = '';
  }
}
