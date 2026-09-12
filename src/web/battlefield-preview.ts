import "./battlefield-preview.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("缺少 #app 根节点");

document.documentElement.classList.add("battlefield-preview-mode");
document.body.className = "battlefield-preview-body";

root.innerHTML = `
  <main class="bf-scene" aria-label="战场背景验收">
    <div class="bf-abyss" aria-hidden="true">
      <div class="bf-abyss-glow bf-abyss-glow-left"></div>
      <div class="bf-abyss-glow bf-abyss-glow-right"></div>
      <div class="bf-abyss-city bf-abyss-city-left"></div>
      <div class="bf-abyss-city bf-abyss-city-right"></div>
      <div class="bf-abyss-mist"></div>
    </div>

    <div class="bf-frame bf-frame-top" aria-hidden="true">
      <span class="bf-frame-beam"></span><span class="bf-frame-ridge"></span>
      <span class="bf-frame-crown"></span>
    </div>
    <div class="bf-frame bf-frame-bottom" aria-hidden="true">
      <span class="bf-frame-beam"></span><span class="bf-frame-ridge"></span>
      <span class="bf-frame-crown"></span>
    </div>
    <div class="bf-frame-side bf-frame-left" aria-hidden="true"></div>
    <div class="bf-frame-side bf-frame-right" aria-hidden="true"></div>

    <section class="bf-court" aria-hidden="true">
      <div class="bf-stone-noise"></div>
      <div class="bf-stone-cracks"></div>
      <svg class="bf-sigil" viewBox="0 0 1200 680" preserveAspectRatio="none">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path class="sigil-major" d="M0 340H1200"/>
          <circle class="sigil-major" cx="600" cy="340" r="132"/>
          <circle class="sigil-minor" cx="600" cy="340" r="92"/>
          <path class="sigil-major" d="M600 0V680"/>
          <path class="sigil-fine" d="M600 54L640 184L600 252L560 184Z"/>
          <path class="sigil-fine" d="M600 626L640 496L600 428L560 496Z"/>
          <path class="sigil-fine" d="M90 340L258 296L368 340L258 384Z"/>
          <path class="sigil-fine" d="M1110 340L942 296L832 340L942 384Z"/>
          <path class="sigil-minor" d="M600 84C492 100 414 168 382 262"/>
          <path class="sigil-minor" d="M600 84C708 100 786 168 818 262"/>
          <path class="sigil-minor" d="M600 596C492 580 414 512 382 418"/>
          <path class="sigil-minor" d="M600 596C708 580 786 512 818 418"/>
          <path class="sigil-diamond" d="M600 294L646 340L600 386L554 340Z"/>
          <path class="sigil-diamond" d="M600 312L628 340L600 368L572 340Z"/>
        </g>
      </svg>
      <div class="bf-court-vignette"></div>
    </section>

    <div class="bf-corner bf-corner-tl" aria-hidden="true">
      <div class="bf-pillar"></div>
      <div class="bf-banner"><span></span></div>
      <div class="bf-knight">
        <span class="bf-knight-helm"></span><span class="bf-knight-body"></span><span class="bf-knight-sword"></span>
      </div>
      <div class="bf-candles bf-candles-upper"><i></i><i></i><i></i></div>
      <div class="bf-brazier"><span class="bf-fire"></span></div>
    </div>

    <div class="bf-corner bf-corner-tr" aria-hidden="true">
      <div class="bf-pillar"></div>
      <div class="bf-banner"><span></span></div>
      <div class="bf-knight">
        <span class="bf-knight-helm"></span><span class="bf-knight-body"></span><span class="bf-knight-sword"></span>
      </div>
      <div class="bf-candles bf-candles-upper"><i></i><i></i><i></i></div>
      <div class="bf-brazier"><span class="bf-fire"></span></div>
    </div>

    <div class="bf-corner bf-corner-bl" aria-hidden="true">
      <div class="bf-banner bf-banner-lower"><span></span></div>
      <div class="bf-candles bf-candles-lower"><i></i><i></i><i></i></div>
      <div class="bf-rubble"></div>
    </div>

    <div class="bf-corner bf-corner-br" aria-hidden="true">
      <div class="bf-banner bf-banner-lower"><span></span></div>
      <div class="bf-candles bf-candles-lower"><i></i><i></i><i></i></div>
      <div class="bf-rubble"></div>
    </div>

    <div class="bf-edge-ornament bf-edge-left" aria-hidden="true"></div>
    <div class="bf-edge-ornament bf-edge-right" aria-hidden="true"></div>
  </main>
`;
