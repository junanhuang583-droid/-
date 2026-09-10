import type { CardId, Keyword } from "./cards.js";

export type PlayerId = "P1" | "P2";

export interface StatusState {
  keyword: Keyword | string;
  remainingOwnTurns?: number;
  charges?: number;
  sourceCardId?: CardId;
  /** 控制状态从该单位所属方的第几个自己的回合开始生效。 */
  activeFromOwnTurn?: number;
  /** 控制状态在该单位所属方的这个自己的回合结束后失效。 */
  expiresAfterOwnTurn?: number;
}

export interface MinionInstance {
  instanceId: string;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  currentHealth: number;
  attackModifier: number;
  attacksUsedThisTurn: number;
  summonedOnTurn: number;
  statuses: StatusState[];
}

export interface PlayerState {
  id: PlayerId;
  health: number;
  hand: CardId[];
  discardPile: CardId[];
  /** 固定5个常规随从位；特殊单位可另由 overflowMinions 承载。 */
  board: Array<MinionInstance | null>;
  overflowMinions: MinionInstance[];
  equipment: CardId | null;
  scene: CardId | null;
  normalSummonsUsedThisTurn: number;
}

export interface DeathRecord {
  turn: number;
  owner: PlayerId;
  cardId: CardId;
  instanceId: string;
  cause: "damage" | "sacrifice" | "execution" | "other";
  canRevive: boolean;
}

export interface GameState {
  turn: number;
  activePlayer: PlayerId;
  firstPlayer: PlayerId | null;
  sharedDeck: CardId[];
  players: Record<PlayerId, PlayerState>;
  deathLog: DeathRecord[];
  winner: PlayerId | "draw" | null;
}
