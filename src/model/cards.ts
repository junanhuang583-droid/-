export type CardId = `C${string}` | `T${string}` | `E${string}` | `S${string}` | `A${string}` | `X${string}`;

export type CardType =
  | "minion"
  | "token_minion"
  | "equipment"
  | "scene"
  | "attack"
  | "effect"
  | "trap"
  | "evolution_stone"
  | "other";

export interface TextEffect {
  /** 原卡上的技能名；没有独立名称时可省略。 */
  name?: string;
  /** 忠实保留的原始效果文本。 */
  text: string;
  /** 尚未程序化的效果不应被引擎擅自解释。 */
  implementation: "raw" | "keyword" | "scripted";
  keyword?: Keyword;
}

export type Keyword =
  | "fast_attack"
  | "haste"
  | "taunt"
  | "arrogance"
  | "deathrattle"
  | "guard"
  | "armor_1"
  | "armor_2"
  | "lifesteal"
  | "drain"
  | "spirit"
  | "stealth"
  | "scout"
  | "sure_hit"
  | "execution"
  | "sleep"
  | "freeze"
  | "petrify";

export interface BaseCardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  series?: string;
  attributes: string[];
  copies: number | null;
  notes: string[];
}

export interface MinionCardDefinition extends BaseCardDefinition {
  type: "minion" | "token_minion";
  health: number | null;
  attack: number | null;
  healing: number | null;
  summonText: string | null;
  effects: TextEffect[];
}

export type CardDefinition = MinionCardDefinition | BaseCardDefinition;

export function isMinionCard(card: CardDefinition): card is MinionCardDefinition {
  return card.type === "minion" || card.type === "token_minion";
}
