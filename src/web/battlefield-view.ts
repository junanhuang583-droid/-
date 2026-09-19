import { V2, deckSlices, relativeRect, sourceRect, fixedRect, v2Asset } from '../application/battlefield-v2.js';
import type { PlayerId } from '../model/state.js';
import { turnControlAriaLabel, turnControlDisabled, turnFace, type TurnControlState } from '../application/turn-control-state.js';

const img = (asset: string, className: string, style = '') =>
  `<img class="${className}" src="${v2Asset(asset)}" alt="" aria-hidden="true" draggable="false" style="${style}" />`;

export function battlefieldBackground(): string {
  return `<div id="battlefield-background" aria-hidden="true">${img('battlefield-v2-clean','v2-background')}</div>`;
}
export function deckView(count: number): string {
  const slices = deckSlices(count);
  const countFont = count >= 10000 ? Math.max(12, 92 / String(count).length) : 22;
  return `<div class="v2-deck" data-battlefield-anchor="shared-deck" data-remaining="${count}" aria-label="共享牌库，剩余${count}张" style="${fixedRect(V2.deck)}">
    <div id="deck-source" class="v2-deck-source" style="${relativeRect(V2.card,V2.deck)}" data-visual-layers="${slices.length}">
      ${slices.map(slice => img('card-back-deck','v2-deck-slice',`transform:translate(${slice.dx}px,${slice.dy}px);z-index:${slice.index+1}`)).join('')}
    </div>
    ${img('deck-rim','v2-deck-rim',relativeRect(V2.deckRim,V2.deck))}
    <strong class="v2-deck-count" data-deck-count="${count}" style="${relativeRect(V2.count,V2.deck)};font-size:${countFont}px">${count}</strong>
  </div>`;
}
export function turnView(state: TurnControlState): string {
  const face = turnFace(state);
  const disabled = turnControlDisabled(state);
  const frontHidden = face !== "front";
  const backHidden = face !== "back";
  return `<div class="v2-turn" data-battlefield-anchor="turn-actions" data-turn-state="${state}" style="${fixedRect(V2.turnInput)}">
    <button id="end-turn" type="button" data-turn-state="${state}" aria-label="${turnControlAriaLabel(state)}" ${disabled?'disabled':''}>
      <span class="v2-turn-core" data-flip-axis="x" data-turn-face="${face}" style="${relativeRect(V2.core,V2.turnInput)}">
        <span class="v2-turn-face v2-turn-face-front" data-turn-face-panel="front" aria-hidden="${frontHidden}">
          ${img('turn-core-front-neutral','v2-turn-neutral')}${img('turn-core-light','v2-turn-light')}
          <span class="end-turn-label">结束回合</span>
        </span>
        <span class="v2-turn-face v2-turn-face-back" data-turn-face-panel="back" aria-hidden="${backHidden}">
          ${img('turn-core-back','v2-turn-back')}
          <span class="end-turn-back-fallback">等待接手</span>
        </span>
      </span>
    </button>
    ${img('turn-rim','v2-turn-rim',relativeRect(V2.housing,V2.turnInput))}
  </div>`;
}
export function heroView(playerId: PlayerId, isActive: boolean, health: number, handCount: number, isTarget: boolean): string {
  const role=isActive?'active':'opponent';
  const group=isActive?V2.activeHero:V2.opponentHero;
  const badge=isActive?sourceRect(872,786,67,81):sourceRect(872,166,64,72);
  const window=isActive?sourceRect(751,685,164,168):sourceRect(757,77,152,141);
  const tag=isTarget?'button':'div';
  return `<${tag} class="hero-panel ${role}-hero v2-hero ${isTarget?'hero-target-ready':''}" data-owner="${playerId}" data-battlefield-anchor="${role}-hero" ${isTarget?`data-hero-target="${playerId}" type="button"`:''} aria-label="玩家${playerId==='P1'?1:2}，生命${health}，手牌${handCount}" style="--hero-aspect:${group.width/group.height}">
    ${img(`hero-${role}-blank`,'v2-hero-blank')}
    <div class="hero-portrait" style="${relativeRect(window,group)}"><span>${playerId==='P1'?'1':'2'}</span></div>
    ${img(`hero-${role}-frame`,'v2-hero-frame')}
    <div class="v2-hero-health" style="${relativeRect(badge,group)}">
      ${img(`hero-${role}-health`,'v2-health-art')}
      <strong data-health="${health}">${health}</strong>
    </div>
    <span class="v2-hero-status">${isActive?'当前回合':'等待'} · 手牌 ${handCount}</span>
  </${tag}>`;
}
