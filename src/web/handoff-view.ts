export type HandoffPhase = "outgoing" | "waiting" | "revealing";

/** Owns a transparent native interaction shield and a public-view crossfade.
 * Receives presentation requests only; never reads or mutates the game store. */
export class HandoffView {
  private dialog: HTMLDialogElement | null = null;
  private phase: HandoffPhase | null = null;
  private fade: Animation | null = null;
  private layer: HTMLElement | null = null;
  private generation = 0;
  private pendingSwitch: (() => void) | null = null;
  private swapped = false;

  constructor(private readonly reveal: () => void) {
    // Holding Enter must not activate a newly available turn control repeatedly.
    window.addEventListener("keydown", event => {
      if (event.repeat && (event.key === "Enter" || event.key === " ")
        && event.target instanceof Element && event.target.closest("#end-turn,#handoff-dialog")) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    const interrupt = () => { if (document.hidden) this.cancelPublic(); };
    document.addEventListener("visibilitychange", interrupt);
    window.addEventListener("pagehide", () => this.cancelPublic());
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
      if (event.matches) this.cancelPublic();
    });
  }

  sync(phase: HandoffPhase | null, player: string): void {
    this.phase = phase;
    if (!phase) {
      if (this.dialog) {
        this.dialog.close(); this.dialog.remove(); this.dialog = null;
        // Do not move focus to the end-turn button under a still-held key.
        document.querySelector<HTMLElement>("#public-battle-view")?.focus({ preventScroll: true });
      }
      return;
    }
    if (!this.dialog) {
      const dialog = document.createElement("dialog");
      dialog.id = "handoff-dialog";
      dialog.className = "handoff-dialog";
      dialog.setAttribute("aria-labelledby", "handoff-title");
      dialog.setAttribute("aria-describedby", "handoff-help");
      dialog.innerHTML = `<section class="handoff-card">
        <span class="handoff-kicker">本地双人交接</span>
        <h2 id="handoff-title" tabindex="-1" autofocus></h2>
        <p id="handoff-help">手牌已隐藏，请将设备交给下一位玩家。</p>
        <button id="reveal-turn" type="button">接手并查看手牌</button>
      </section>`;
      dialog.addEventListener("cancel", event => event.preventDefault());
      dialog.addEventListener("keydown", event => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        const target = this.phase === "waiting" ? "#reveal-turn" : "#handoff-title";
        dialog.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
      });
      dialog.querySelector<HTMLButtonElement>("#reveal-turn")!.addEventListener("click", () => {
        if (this.phase === "waiting") this.reveal();
      });
      document.body.append(dialog);
      this.dialog = dialog;
    }
    const dialog = this.dialog;
    const changed = dialog.dataset.phase !== phase;
    dialog.dataset.phase = phase;
    dialog.setAttribute("aria-busy", String(phase !== "waiting"));
    dialog.querySelector("#handoff-title")!.textContent = phase === "waiting" ? `轮到${player}` : "正在交接";
    const button = dialog.querySelector<HTMLButtonElement>("#reveal-turn")!;
    button.hidden = phase !== "waiting";
    button.disabled = phase !== "waiting";
    if (!dialog.open) dialog.showModal();
    if (changed) dialog.querySelector<HTMLElement>("#handoff-title")!.focus({ preventScroll: true });
  }

  /** Old public orientation fades out once; replace from the latest snapshot
   * at the invisible midpoint. The plate is a sibling and is never faded. */
  async switchPublic(layer: HTMLElement, replace: () => void): Promise<boolean> {
    this.cancelPublic();
    const generation = ++this.generation;
    this.layer = layer; this.pendingSwitch = replace; this.swapped = false;
    let completed = true;
    try {
      if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        || typeof layer.animate !== "function") {
        this.applySwitch();
      } else {
        this.fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 75, easing: "ease-in", fill: "forwards" });
        this.fade.id = "handoff-public-out";
        await this.fade.finished;
        if (generation !== this.generation) return false;
        layer.style.opacity = "0";
        this.fade.cancel(); this.fade = null;
        this.applySwitch();
        this.fade = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 105, easing: "ease-out", fill: "forwards" });
        this.fade.id = "handoff-public-in";
        await this.fade.finished;
      }
    } catch { completed = false; }
    finally {
      if (generation === this.generation) {
        this.applySwitch();
        this.fade?.cancel(); this.fade = null;
        layer.style.removeProperty("opacity");
        this.pendingSwitch = null; this.layer = null;
      }
    }
    return completed;
  }

  cancelPublic(): void {
    ++this.generation;
    this.fade?.cancel(); this.fade = null;
    this.layer?.style.removeProperty("opacity");
    this.pendingSwitch = null; this.layer = null;
  }
  private applySwitch(): void {
    if (this.swapped || !this.pendingSwitch) return;
    this.swapped = true;
    this.pendingSwitch();
  }
}
