import type { BoardState, EndReason, GameHistory, GameMode, GameResult, Move, MoveDescription, PieceColor, PieceData, Position } from "../types";
import {
  applyMove,
  createInitialBoard,
  describeMove,
  finalResult,
  getAllLegalMoves,
  isKingInCheck,
  recordMove,
  startHistory,
} from "./board";
import { PIECE_GLYPHS } from "./boardMap";

export interface LoggedMove {
  move: Move;
  label: string;
  color: PieceColor;
}

export interface GameState {
  board: BoardState;
  turn: PieceColor;
  history: GameHistory;
  captured: PieceData[];
  log: LoggedMove[];
  result: GameResult;
  endReason: EndReason | null;
}

function otherColor(color: PieceColor): PieceColor {
  return color === "white" ? "black" : "white";
}

export function newGame(mode: GameMode): GameState {
  const board = createInitialBoard(mode);
  return { board, turn: "white", history: startHistory(board, mode), captured: [], log: [], result: null, endReason: null };
}

function squareName(mode: GameMode, { x, y }: Position): string {
  return mode === "classic" ? `${"abcdefgh"[x]}${8 - y}` : `${x}.${y}`;
}

function moveLabel(before: BoardState, mode: GameMode, move: Move, description: MoveDescription, ending: string): string {
  const piece = before[move.from.y][move.from.x]!;
  if (description.movements.length === 2) return `${move.to.x > move.from.x ? "O-O" : "O-O-O"}${ending}`;
  const separator = description.captured ? "×" : "–";
  const promotion = move.promotion ? `=${PIECE_GLYPHS[move.promotion]}` : "";
  return `${PIECE_GLYPHS[piece.type]} ${squareName(mode, move.from)}${separator}${squareName(mode, move.to)}${promotion}${ending}`;
}

/** The game after one more move. The move is assumed to be legal: see isLegalMove. */
export function stepGame(game: GameState, mode: GameMode, move: Move): GameState {
  const description = describeMove(game.board, mode, move);
  const board = applyMove(game.board, mode, move);
  const turn = otherColor(game.turn);
  const history = recordMove(game.history, game.board, board, mode, move, turn);
  const { result, drawReason } = finalResult(board, mode, turn, history);
  const isMate = Boolean(result) && !drawReason;
  const ending = isMate ? "#" : isKingInCheck(board, mode, turn) ? "+" : "";
  return {
    board,
    turn,
    history,
    result,
    endReason: isMate ? "checkmate" : drawReason,
    captured: description.captured ? [...game.captured, description.captured.piece] : game.captured,
    log: [...game.log, { move, label: moveLabel(game.board, mode, move, description, ending), color: game.turn }],
  };
}

export function isLegalMove(game: GameState, mode: GameMode, { from, to, promotion }: Move): boolean {
  return getAllLegalMoves(game.board, mode, game.turn).some((legal) => (
    legal.from.x === from.x && legal.from.y === from.y && legal.to.x === to.x && legal.to.y === to.y && legal.promotion === promotion
  ));
}

/** Plays a list of moves from the start. Returns null if one of them is not legal. */
export function replayGame(mode: GameMode, moves: Move[]): GameState | null {
  let game = newGame(mode);
  for (const move of moves) {
    if (game.result || !isLegalMove(game, mode, move)) return null;
    game = stepGame(game, mode, move);
  }
  return game;
}

export type Reconciled =
  | { kind: "same" }
  | { kind: "append"; move: Move }
  | { kind: "replace"; game: GameState }
  | { kind: "invalid" };

function sameMove(a: Move, b: Move): boolean {
  return a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y && a.promotion === b.promotion;
}

/**
 * Brings a local game in line with the moves on the server. A local move still on its way is
 * left alone, unless `trustServer` says it failed. Moves that break the rules are never played.
 */
export function reconcileMoves(game: GameState, mode: GameMode, server: Move[], trustServer = false): Reconciled {
  const local = game.log.map(({ move }) => move);
  const agree = local.slice(0, server.length).every((move, index) => sameMove(move, server[index]));
  if (agree && server.length === local.length) return { kind: "same" };
  if (agree && server.length < local.length && !trustServer) return { kind: "same" };
  if (agree && server.length === local.length + 1) {
    const move = server[server.length - 1];
    return !game.result && isLegalMove(game, mode, move) ? { kind: "append", move } : { kind: "invalid" };
  }
  const replayed = replayGame(mode, server);
  return replayed ? { kind: "replace", game: replayed } : { kind: "invalid" };
}

export function resignGame(game: GameState, loser: PieceColor): GameState {
  return { ...game, result: loser === "white" ? "black-wins" : "white-wins", endReason: "resignation" };
}

/** How many moves to take back so that it is this player's turn again. Zero means there is nothing to take back. */
export function undoCount(log: LoggedMove[], player: PieceColor): number {
  if (!log.length) return 0;
  const count = log[log.length - 1].color === player ? 1 : 2;
  return count <= log.length ? count : 0;
}
