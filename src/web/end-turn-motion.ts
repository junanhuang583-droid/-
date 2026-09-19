import { plateTransform, restPose, TURN_MOTION, turnLighting, turnSamples, turnTiming,
  type TurnMotionTarget, type TurnPose } from '../application/turn-motion.js';

/** Owns only short-lived presentation. It cannot read/write a game or dispatch a command. */
export class EndTurnMotion {
  private button: HTMLButtonElement | null = null;
  private core: HTMLElement | null = null;
  private plate: HTMLElement | null = null;
  private target: TurnMotionTarget = { face: 'front', ready: false };
  private origin: TurnPose = restPose(this.target);
  private tracks = new Set<Animation>();
  private pressTrack: Animation | null = null;
  private input = new AbortController();
  private generation = 0;
  private playing = false;

  capture(): TurnPose | null {
    if (!this.plate || !this.core || !this.button?.isConnected) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(this.plate).transform);
    const angle = Math.atan2(m.m23, m.m22) * 180 / Math.PI;
    const press = -new DOMMatrixReadOnly(getComputedStyle(this.core).transform).m43;
    const light = this.button.querySelector<HTMLElement>('.v2-turn-light');
    return { angle: angle < -.01 ? angle + 360 : Math.max(0, angle),
      press: Math.max(0, press), glow: light ? Number(getComputedStyle(light).opacity) : this.origin.glow };
  }

  mount(button: HTMLButtonElement | null, target: TurnMotionTarget, carry: TurnPose | null, turning: boolean): void {
    this.generation++;
    this.cancel();
    this.input.abort();
    this.input = new AbortController();
    this.playing = false;
    this.button = button;
    this.core = button?.querySelector('.v2-turn-core') ?? null;
    this.plate = button?.querySelector('.v2-turn-plate') ?? null;
    this.target = target;
    const end = restPose(target);
    this.origin = turning && carry ? carry : { ...end, glow: carry?.glow ?? end.glow };
    this.paint(this.origin);
    if (!button || !this.core || !this.plate) return;
    this.bindPress(button);
    if (!turning) this.fadeGlow(this.origin.glow, end.glow);
  }

  cancel(): void {
    // Rejects finished promises; play() handles cancellation and always releases its caller.
    for (const animation of this.tracks) animation.cancel();
    this.tracks.clear();
    this.pressTrack = null;
  }

  async play(): Promise<'completed' | 'interrupted'> {
    const button = this.button, core = this.core, plate = this.plate;
    const generation = this.generation;
    if (!button || !core || !plate) return 'interrupted';
    const from = this.origin, to = restPose(this.target);
    this.cancel();
    this.playing = true;
    button.dataset.turnFlipping = 'true';
    button.setAttribute('aria-busy', 'true');
    let result: 'completed' | 'interrupted' = 'completed';
    const owned: Animation[] = [];
    try {
      if (document.hidden || this.reduced() || typeof plate.animate !== 'function' || from.angle === to.angle) {
        result = document.hidden ? 'interrupted' : 'completed';
        this.paint(to);
      } else {
        const frames = turnSamples(from, this.target);
        const duration = turnTiming(from, this.target).duration;
        const add = (element: Element | null, keyframes: Keyframe[], id: string) => {
          if (!element) return;
          const a = this.track(element, keyframes, { duration, fill: 'both', easing: 'linear' }, id);
          owned.push(a);
        };
        // One 0 -> 180 (or 180 -> 0) animation. Never replace a face at 90 degrees.
        add(plate, frames.map(p => ({ offset: p.offset, transform: plateTransform(p.angle) })), 'turn-plate-rotation');
        add(core, frames.map(p => ({ offset: p.offset, transform: `translateZ(${-p.press}px)` })), 'turn-plate-seat');
        add(button.querySelector('.v2-turn-light'), frames.map(p => ({ offset: p.offset, opacity: p.glow })), 'turn-plate-glow');
        for (const [i, element] of [...button.querySelectorAll('.v2-turn-shade')].entries())
          add(element, frames.map(p => ({ offset: p.offset, opacity: turnLighting(p.angle).shade })), `turn-plate-shade-${i}`);
        for (const [i, element] of [...button.querySelectorAll('.v2-turn-sheen')].entries())
          add(element, frames.map(p => ({ offset: p.offset, opacity: turnLighting(p.angle).sheen })), `turn-plate-sheen-${i}`);
        add(button.querySelector('.v2-turn-contact'), frames.map(p => ({ offset: p.offset,
          opacity: turnLighting(p.angle).shadowOpacity, transform: turnLighting(p.angle).shadowTransform })), 'turn-plate-contact');
        // All tracks share exactly the same clock, including after a busy browser frame.
        const start = document.timeline.currentTime;
        if (typeof start === 'number') owned.forEach(a => { a.startTime = start; });
        await Promise.all(owned.map(a => a.finished));
      }
    } catch {
      result = 'interrupted';
    } finally {
      owned.forEach(a => { a.cancel(); this.tracks.delete(a); });
      if (generation === this.generation && button === this.button) {
        this.playing = false;
        this.paint(to);
        delete button.dataset.turnFlipping;
        button.removeAttribute('aria-busy');
      }
    }
    return result;
  }

  private paint(pose: TurnPose): void {
    if (!this.button || !this.core || !this.plate) return;
    this.plate.style.transform = plateTransform(pose.angle);
    this.core.style.transform = pose.press > .001 ? `translateZ(${-pose.press}px)` : 'none';
    const light = this.button.querySelector<HTMLElement>('.v2-turn-light');
    if (light) light.style.opacity = String(pose.glow);
    const lighting = turnLighting(pose.angle);
    this.button.querySelectorAll<HTMLElement>('.v2-turn-shade').forEach(e => { e.style.opacity = String(lighting.shade); });
    this.button.querySelectorAll<HTMLElement>('.v2-turn-sheen').forEach(e => { e.style.opacity = String(lighting.sheen); });
    const shadow = this.button.querySelector<HTMLElement>('.v2-turn-contact');
    if (shadow) { shadow.style.opacity = String(lighting.shadowOpacity); shadow.style.transform = lighting.shadowTransform; }
  }

  private track(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions, id: string): Animation {
    const animation = element.animate(frames, options);
    animation.id = id;
    // Attach a rejection handler immediately, even for a synchronous cancellation.
    void animation.finished.catch(() => undefined);
    this.tracks.add(animation);
    return animation;
  }

  private fadeGlow(from: number, to: number): void {
    const light = this.button?.querySelector<HTMLElement>('.v2-turn-light');
    if (!light) return;
    light.style.opacity = String(to);
    if (this.reduced() || Math.abs(from - to) < .001 || typeof light.animate !== 'function') return;
    const animation = this.track(light, [{ opacity: from }, { opacity: to }],
      { duration: TURN_MOTION.lightMs, easing: 'ease-out' }, 'turn-ready-light');
    void animation.finished.catch(() => undefined).finally(() => { this.tracks.delete(animation); });
  }

  private press(depth: number): void {
    if (!this.core || this.playing) return;
    const core = this.core;
    const from = this.capture()?.press ?? 0;
    if (this.pressTrack) { this.pressTrack.cancel(); this.tracks.delete(this.pressTrack); }
    this.pressTrack = null;
    core.style.transform = depth > 0 ? `translateZ(${-depth}px)` : 'none';
    if (this.reduced()) { core.style.transform = 'none'; return; }
    if (typeof core.animate !== 'function') return;
    const animation = this.track(core, [{ transform: `translateZ(${-from}px)` }, { transform: `translateZ(${-depth}px)` }],
      { duration: TURN_MOTION.takeUpMs, easing: 'ease-out' }, 'turn-button-press');
    this.pressTrack = animation;
    void animation.finished.catch(() => undefined).finally(() => {
      this.tracks.delete(animation);
      if (this.pressTrack === animation) this.pressTrack = null;
    });
  }

  private bindPress(button: HTMLButtonElement): void {
    const { signal } = this.input;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const release = () => this.press(0);
    button.addEventListener('pointerdown', event => {
      if (event.isPrimary && event.button === 0 && !button.disabled) this.press(TURN_MOTION.pressDepth);
    }, { signal });
    button.addEventListener('pointerleave', release, { signal });
    window.addEventListener('pointerup', release, { signal });
    window.addEventListener('pointercancel', release, { signal });
    window.addEventListener('blur', release, { signal });
    button.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && !button.disabled) this.press(TURN_MOTION.pressDepth);
    }, { signal });
    window.addEventListener('keyup', event => {
      if (event.key === 'Enter' || event.key === ' ') release();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.cancel(); release(); }
    }, { signal });
    window.addEventListener('pagehide', () => this.cancel(), { signal });
    media.addEventListener('change', () => { if (media.matches) this.cancel(); }, { signal });
  }
  private reduced(): boolean { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
}
