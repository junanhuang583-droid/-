import type { BaseCardDefinition, CardId } from "../model/cards.js";

export interface PrototypeSpecialCard extends BaseCardDefinition {
  id: CardId;
  type: "attack" | "evolution_stone";
  copies: number;
  displayType: string;
  rulesText: string;
  executable: boolean;
}

/**
 * Temporary browser-prototype cards.
 *
 * These are deliberately NOT written into the canonical handwritten-card
 * record. The user has confirmed the demo quantities (10 + 10), while the
 * ordinary attack card's actual damage/target rules have not been recorded.
 */
export const PROTOTYPE_SPECIAL_CARDS: PrototypeSpecialCard[] = [
  {
    id: "X001",
    name: "普通进化石",
    type: "evolution_stone",
    attributes: [],
    copies: 10,
    notes: ["原型效果卡。数量10颗。正式卡面与编号可在后续录入时调整。"],
    displayType: "效果卡 · 进化资源",
    rulesText: "用于支付牌面写有“进化石”的召唤／进化条件。当前版本先加入共享牌库与手牌；正式进化动作将在进化系统接入时消耗它。",
    executable: false,
  },
  {
    id: "A001",
    name: "普通攻击",
    type: "attack",
    attributes: [],
    copies: 10,
    notes: ["原型普通攻击牌。数量10张。伤害与目标规则尚未录入。"],
    displayType: "普通攻击牌",
    rulesText: "伤害数值、合法目标与其他攻击规则尚未录入，因此当前版本只作为实体牌进入共享牌库与手牌，不执行效果。",
    executable: false,
  },
];

export const PROTOTYPE_SPECIAL_BY_ID = new Map<CardId, PrototypeSpecialCard>(
  PROTOTYPE_SPECIAL_CARDS.map((card) => [card.id, card]),
);

export const PROTOTYPE_SPECIAL_DECK: CardId[] = PROTOTYPE_SPECIAL_CARDS.flatMap((card) =>
  Array.from({ length: card.copies }, () => card.id),
);
