import type { Keyword } from "../model/cards.js";
import { byId } from "./game-catalog.js";
import { onViewRendered } from "./view-events.js";
import "./effects-ui.css";

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

onViewRendered(applyEnhancements, 50);

function applyEnhancements(): void {
  document.querySelectorAll<HTMLElement>(".hand-card, .board-slot.minion").forEach((element) => {
    if (element.querySelector(".implemented-keywords")) return;
    const id = element.dataset.cardId;
    const card = id ? byId.get(id as `C${string}`) : undefined;
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
