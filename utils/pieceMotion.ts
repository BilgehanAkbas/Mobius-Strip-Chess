import type { MoveDescription, PieceMovement } from "../types";

const HOP_HEIGHT = 0.8;
const MIN_DURATION = 0.28;
const MAX_DURATION = 0.8;
const SECONDS_PER_SQUARE = 0.06;

export function motionDuration({ dx, dy }: PieceMovement): number {
  return Math.min(MAX_DURATION, MIN_DURATION + SECONDS_PER_SQUARE * Math.hypot(dx, dy));
}

/** How long until every piece in a move has landed. */
export function moveSettleTime({ movements }: MoveDescription): number {
  return Math.max(0, ...movements.map(motionDuration));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Board coordinates at time t in 0..1, plus the height above the board. */
export function motionPoint({ from, dx, dy, jumps }: PieceMovement, t: number) {
  const eased = easeInOut(t);
  return {
    x: from.x + dx * eased,
    y: from.y + dy * eased,
    lift: jumps ? Math.sin(Math.PI * t) * HOP_HEIGHT : 0,
  };
}
