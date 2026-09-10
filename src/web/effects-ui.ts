import cardRecord from "../../docs/卡牌游戏记录_v0.5.md?raw";
import { parseMinionCardsFromRecord } from "../data/parse-card-record.js";
import type { Keyword } from "../model/cards.js";

const LABELS: Partial<Record<Keyword, string>> = {
  haste: "迅疾",
  fast_attack: "快攻",
  taunt: "嘲讽",
  arrogance: "狂妄",
  guard: "守护",
  armor_1: "甲一",
  armor_2: "甲二",
  lifesteal: "吸血",
};

const cards = parseMinionCardsFromRecord(cardRecord);
const byId = new Map(cards.map((card) => [card.id, card]));
const byName = new Map(cards.map((card) => [card.name, card]));
let scheduled = false;

installStyles();
applyEnhancements();
new MutationObserver(() => scheduleEnhancements()).observe(document.querySelector("#app") ?? document.body, {
  childList: true,
  subtree: true,
});

function scheduleEnhancements(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyEnhancements();
  });
}

function applyEnhancements(): void {
  const note = document.querySelector<HTMLElement>(".mode-note");
  if (note && note.dataset.firstWave !== "true") {
    note.dataset.firstWave = "true";
    note.textContent = "已启用：扣血召唤、迅疾、快攻、嘲讽、狂妄、守护、甲一/甲二、吸血。进化石、献祭、亡语、汲取、沉睡/冰冻/石化、装备和场景等仍暂不结算。";
  }

  document.querySelectorAll<HTMLElement>(".hand-card").forEach((element) => {
    if (element.querySelector(".implemented-keywords")) return;
    const id = element.querySelector<HTMLElement>(".card-id")?.textContent?.trim();
    const card = id ? byId.get(id as `C${string}`) : undefined;
    appendBadges(element, card?.effects.flatMap((effect) => effect.keyword ? [effect.keyword] : []) ?? []);
  });

  document.querySelectorAll<HTMLElement>(".board-slot.minion").forEach((element) => {
    if (element.querySelector(".implemented-keywords")) return;
    const name = element.querySelector("strong")?.textContent?.trim();
    const card = name ? byName.get(name) : undefined;
    appendBadges(element, card?.effects.flatMap((effect) => effect.keyword ? [effect.keyword] : []) ?? []);
  });
}

function appendBadges(target: HTMLElement, keywords: Keyword[]): void {
  const labels = [...new Set(keywords.map((keyword) => LABELS[keyword]).filter((label): label is string => Boolean(label)))];
  if (labels.length === 0) return;
  const strip = document.createElement("div");
  strip.className = "implemented-keywords";
  strip.innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
  target.append(strip);
}

function installStyles(): void {
  if (document.querySelector("#effects-ui-style")) return;
  const style = document.createElement("style");
  style.id = "effects-ui-style";
  style.textContent = `
    .implemented-keywords{position:absolute;left:4px;right:4px;top:4px;z-index:4;display:flex;flex-wrap:wrap;gap:2px;pointer-events:none}
    .implemented-keywords span{padding:1px 3px;border:1px solid rgba(215,174,101,.55);border-radius:999px;background:rgba(18,15,12,.82);color:#ebd6ae;font-size:6px;font-weight:800;line-height:1.2}
    .hand-card,.board-slot.minion{position:relative}
    @media (min-height:600px){.implemented-keywords span{font-size:7px;padding:2px 4px}}
  `;
  document.head.append(style);
}
