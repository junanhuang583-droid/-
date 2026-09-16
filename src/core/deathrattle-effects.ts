import type { CardId, MinionCardDefinition } from "../model/cards.js";
import type { PlayerId } from "../model/state.js";
import type { UnitTargetScope } from "./unit-targeting.js";

export interface PendingUnitEffect {
  id: string;
  kind: "unit";
  sourcePlayer: PlayerId;
  sourceCardId: CardId;
  sourceName: string;
  action: "damage" | "health_loss" | "heal" | "attack_buff";
  amount: number;
  scope: UnitTargetScope;
  remainingTargets: number;
  selectedKeys: string[];
  text: string;
}

export function parseUnitDeathrattle(
  card: MinionCardDefinition,
  sourcePlayer: PlayerId,
  rawText: string,
  id: string,
): PendingUnitEffect | null {
  const text = rawText.replace(/[。.]$/, "").replace(/\s+/g, "").trim();
  let match = text.match(/^死后对选中(单位|随从)造成(\d+)点伤害$/);
  if (match) return makePending(id, card, sourcePlayer, "damage", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后对(?:两个|两(?:个)?|2个)(单位|随从)各造成(\d+)点伤害$/);
  if (match) return makePending(id, card, sourcePlayer, "damage", Number(match[2]), scopeFromNoun(match[1]!), 2, text);

  match = text.match(/^死后选择一个(单位|随从)[，,]?扣(\d+)(?:点)?血$/);
  if (match) return makePending(id, card, sourcePlayer, "health_loss", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后选取(?:两个|两(?:个)?|2个)(单位|随从)[，,]?各扣(\d+)点血$/);
  if (match) return makePending(id, card, sourcePlayer, "health_loss", Number(match[2]), scopeFromNoun(match[1]!), 2, text);

  match = text.match(/^死后选定一个(单位|随从)加(\d+)血$/);
  if (match) return makePending(id, card, sourcePlayer, "heal", Number(match[2]), scopeFromNoun(match[1]!), 1, text);

  match = text.match(/^死后给指定随从加(\d+)攻击$/);
  if (match) return makePending(id, card, sourcePlayer, "attack_buff", Number(match[1]), "all_minions", 1, text);

  return null;
}

function makePending(
  id: string,
  card: MinionCardDefinition,
  sourcePlayer: PlayerId,
  action: PendingUnitEffect["action"],
  amount: number,
  scope: UnitTargetScope,
  remainingTargets: number,
  text: string,
): PendingUnitEffect {
  return {
    id,
    kind: "unit",
    sourcePlayer,
    sourceCardId: card.id,
    sourceName: card.name,
    action,
    amount,
    scope,
    remainingTargets,
    selectedKeys: [],
    text,
  };
}

function scopeFromNoun(noun: string): UnitTargetScope {
  return noun === "随从" ? "all_minions" : "all_units";
}

