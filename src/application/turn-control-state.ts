export type TurnControlState = "front-ready" | "front-disabled" | "back-waiting";
export type TurnControlFace = "front" | "back";

export interface TurnControlInputs {
  /** Core hot-seat privacy state. This always wins over temporary UI locks. */
  handoffRequired: boolean;
  /** Winner, pending effects, deal/draw animation or any other non-handoff lock. */
  blocked: boolean;
}

/**
 * Presentation state is derived from the authoritative session on every render.
 * It is deliberately not stored, so the control can never become a second game
 * state source that disagrees with the saved hot-seat handoff.
 */
export function deriveTurnControlState(input: TurnControlInputs): TurnControlState {
  if (input.handoffRequired) return "back-waiting";
  return input.blocked ? "front-disabled" : "front-ready";
}

export function turnFace(state: TurnControlState): TurnControlFace {
  return state === "back-waiting" ? "back" : "front";
}

export function turnControlDisabled(state: TurnControlState): boolean {
  return state !== "front-ready";
}

export function turnControlAriaLabel(state: TurnControlState): string {
  return state === "back-waiting" ? "等待下一位玩家接手" : "结束回合";
}
