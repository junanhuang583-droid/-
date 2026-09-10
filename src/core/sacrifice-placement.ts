import {
  summonFromHand,
  type BasicGameCatalog,
  type BasicGameSession,
} from "./basic-game.js";

/**
 * Sacrifice summons occupy the slot of the sacrificed minion. When multiple
 * minions are sacrificed, the new minion occupies the left-most sacrificed
 * slot. This wrapper keeps the existing summon/death/deathrattle pipeline
 * intact, including the full-board case.
 */
export function summonIntoSacrificedSlot(
  session: BasicGameSession,
  catalog: BasicGameCatalog,
  handIndex: number,
  sacrificeInstanceIds: string[],
): string | null {
  const player = session.state.players[session.state.activePlayer];
  const sacrifices = [...new Set(sacrificeInstanceIds)];
  if (sacrifices.length === 0) return "至少需要选择一只献祭随从。";

  const sacrificeSlots = sacrifices.map((instanceId) =>
    player.board.findIndex((minion) => minion?.instanceId === instanceId),
  );
  if (sacrificeSlots.some((slot) => slot < 0)) return "献祭目标必须仍在己方场上。";

  const destinationSlot = Math.min(...sacrificeSlots);
  const destinationMinion = player.board[destinationSlot];
  if (!destinationMinion) return "最左侧献祭位置已经发生变化，请重新选择。";

  // summonFromHand requires the destination to be empty before it performs the
  // sacrifices. Temporarily move the left-most sacrifice to a sixth working
  // slot so the normal death/deathrattle pipeline can still find and kill it.
  // Nothing is persisted until the board is restored to five normal slots.
  const normalBoardLength = player.board.length;
  player.board.push(destinationMinion);
  player.board[destinationSlot] = null;

  const error = summonFromHand(
    session,
    catalog,
    handIndex,
    destinationSlot,
    sacrifices,
  );

  if (error) {
    const temporaryOccupant = player.board[normalBoardLength] ?? destinationMinion;
    player.board.length = normalBoardLength;
    if (player.board[destinationSlot] === null) player.board[destinationSlot] = temporaryOccupant;
    return error;
  }

  // A deathrattle from the moved sacrifice may have created a token in the
  // temporary sixth slot. Preserve it by moving it to a normal empty slot, or
  // to the existing overflow area if the five normal slots are still full.
  const temporaryOccupant = player.board[normalBoardLength] ?? null;
  player.board.length = normalBoardLength;
  if (temporaryOccupant) {
    const emptySlot = player.board.findIndex((minion) => minion === null);
    if (emptySlot >= 0) player.board[emptySlot] = temporaryOccupant;
    else player.overflowMinions.push(temporaryOccupant);
  }

  return null;
}
