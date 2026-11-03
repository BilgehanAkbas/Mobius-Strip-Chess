import type { BoardState, GameHistory, GameMode, Move, PieceColor, PieceData, PieceType } from "../types";
import { applyMove, getAllLegalMoves, hasInsufficientMaterial, isKingInCheck, positionKey } from "./board";

export type BotLevel = "easy" | "hard";

export interface BotOptions {
  level?: BotLevel;
  history?: GameHistory | null;
  /** Hard level only: the deepest search and how long it may take. */
  maxDepth?: number;
  timeMs?: number;
  random?: () => number;
}

const MATE = 1_000_000;
const MAX_QUIESCENCE_PLIES = 6;
const QUIET_PLIES_TO_DRAW = 100;
const REPETITIONS_TO_DRAW = 3;
const REPEAT_PENALTY = 25;
const EASY_NOISE = 90;
const NODES_PER_TIME_CHECK = 256;
const TAKE_IT_NOW_BONUS = 30;

const VALUES: Record<GameMode, Record<PieceType, number>> = {
  classic: { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0 },
  // On four rows a bishop reaches about 6 squares and a rook about 18, so the usual values do not hold.
  mobius: { pawn: 100, knight: 300, bishop: 230, rook: 560, queen: 950, king: 0 },
};

const ENDGAME_MATERIAL = 1500;
const HUNT_MATERIAL_LEAD = 300;
const HUNT_EDGE_WEIGHT = 16;
const HUNT_DISTANCE_WEIGHT = 8;

class OutOfTime extends Error {}

interface Search {
  mode: GameMode;
  deadline: number;
  nodes: number;
}

function otherColor(color: PieceColor): PieceColor {
  return color === "white" ? "black" : "white";
}

function mobiusPawnSteps(piece: PieceData, x: number): number {
  const start = piece.color === "white" ? (piece.direction === 1 ? 3 : 0) : (piece.direction === 1 ? 11 : 8);
  return (((x - start) * (piece.direction ?? 1)) % 16 + 16) % 16;
}

function mobiusSquareBonus(piece: PieceData, x: number, y: number, endgame: boolean): number {
  const innerRow = y === 1 || y === 2 ? 1 : 0;
  switch (piece.type) {
    case "pawn": {
      const steps = mobiusPawnSteps(piece, x);
      return steps * steps * 2;
    }
    case "knight": return innerRow * 14;
    case "bishop": return innerRow * 6;
    case "king": return endgame ? innerRow * 12 : (1 - innerRow) * 10;
    default: return 0;
  }
}

function classicSquareBonus(piece: PieceData, x: number, y: number, endgame: boolean): number {
  const center = 7 - Math.abs(x - 3.5) - Math.abs(y - 3.5);
  const rank = piece.color === "white" ? 7 - y : y;
  switch (piece.type) {
    case "pawn": return rank * rank * 2 + (x === 3 || x === 4 ? 10 : 0);
    case "knight": return center * 6 - 18;
    case "bishop": return center * 3;
    case "rook": return rank === 6 ? 15 : 0;
    case "queen": return center;
    case "king": return endgame ? center * 6 : (rank === 0 ? 15 : -20) - center * 3;
  }
}

/** Own pieces next to a king shield it, while the game still has heavy material on the board. */
function kingShelter(board: BoardState, mode: GameMode, color: PieceColor, kingX: number, kingY: number): number {
  const columns = board[0].length;
  let shelter = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const row = board[kingY + dy];
    if (!row) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = mode === "mobius" ? (kingX + dx + columns) % columns : kingX + dx;
      if ((dx || dy) && row[x]?.color === color) shelter += 1;
    }
  }
  return shelter * 7;
}

/** How to finish a won ending: drive the lone king to the edge and bring the own king next to it. */
function huntBonus(mode: GameMode, loser: [number, number], winner: [number, number]): number {
  const [loserX, loserY] = loser;
  const [winnerX, winnerY] = winner;
  const edge = mode === "classic"
    ? Math.max(Math.abs(loserX - 3.5), Math.abs(loserY - 3.5))
    : Math.abs(loserY - 1.5) * 2;
  const across = Math.abs(loserX - winnerX);
  const dx = mode === "mobius" ? Math.min(across, 16 - across) : across;
  const distance = Math.max(dx, Math.abs(loserY - winnerY));
  return edge * HUNT_EDGE_WEIGHT - distance * HUNT_DISTANCE_WEIGHT;
}

/** Score from the point of view of the side to move. */
function evaluate(board: BoardState, mode: GameMode, side: PieceColor): number {
  const values = VALUES[mode];
  let material = 0;
  let nonPawnMaterial = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      material += piece.color === side ? values[piece.type] : -values[piece.type];
      if (piece.type !== "pawn") nonPawnMaterial += values[piece.type];
    }
  }
  const endgame = nonPawnMaterial < ENDGAME_MATERIAL;
  let position = 0;
  let ownKing: [number, number] | null = null;
  let enemyKing: [number, number] | null = null;
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const piece = board[y][x];
      if (!piece) continue;
      if (piece.type === "king") {
        if (piece.color === side) ownKing = [x, y];
        else enemyKing = [x, y];
      }
      let bonus = mode === "mobius" ? mobiusSquareBonus(piece, x, y, endgame) : classicSquareBonus(piece, x, y, endgame);
      if (piece.type === "king" && !endgame) bonus += kingShelter(board, mode, piece.color, x, y);
      position += piece.color === side ? bonus : -bonus;
    }
  }
  if (endgame && Math.abs(material) >= HUNT_MATERIAL_LEAD && ownKing && enemyKing) {
    position += material > 0 ? huntBonus(mode, enemyKing, ownKing) : -huntBonus(mode, ownKing, enemyKing);
  }
  return material + position;
}

function moveOrderScore(board: BoardState, mode: GameMode, move: Move): number {
  const values = VALUES[mode];
  const attacker = board[move.from.y][move.from.x];
  const victim = board[move.to.y][move.to.x];
  let score = move.promotion ? values[move.promotion] : 0;
  if (victim && attacker) score += 10 * values[victim.type] - values[attacker.type];
  return score;
}

function orderMoves(board: BoardState, mode: GameMode, moves: Move[]): Move[] {
  return moves
    .map((move) => ({ move, score: moveOrderScore(board, mode, move) }))
    .sort((a, b) => b.score - a.score)
    .map(({ move }) => move);
}

function checkTime(search: Search) {
  search.nodes += 1;
  if (search.nodes % NODES_PER_TIME_CHECK === 0 && performance.now() > search.deadline) throw new OutOfTime();
}

/** Plays out captures so a position is not judged in the middle of an exchange. */
function quiesce(board: BoardState, search: Search, side: PieceColor, alpha: number, beta: number, ply: number, depthLeft: number): number {
  checkTime(search);
  const { mode } = search;
  const moves = getAllLegalMoves(board, mode, side);
  if (!moves.length) return isKingInCheck(board, mode, side) ? -MATE + ply : 0;
  if (hasInsufficientMaterial(board)) return 0;

  const standPat = evaluate(board, mode, side);
  if (depthLeft === 0 || standPat >= beta) return standPat;
  let best = standPat;
  let floor = Math.max(alpha, standPat);
  const forcing = moves.filter((move) => board[move.to.y][move.to.x] || move.promotion === "queen");
  for (const move of orderMoves(board, mode, forcing)) {
    const score = -quiesce(applyMove(board, mode, move), search, otherColor(side), -beta, -floor, ply + 1, depthLeft - 1);
    if (score > best) best = score;
    if (score > floor) floor = score;
    if (floor >= beta) break;
  }
  return best;
}

function negamax(board: BoardState, search: Search, side: PieceColor, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return quiesce(board, search, side, alpha, beta, ply, MAX_QUIESCENCE_PLIES);
  checkTime(search);
  const { mode } = search;
  const moves = getAllLegalMoves(board, mode, side);
  if (!moves.length) return isKingInCheck(board, mode, side) ? -MATE + ply : 0;
  if (hasInsufficientMaterial(board)) return 0;

  let best = -Infinity;
  let floor = alpha;
  for (const move of orderMoves(board, mode, moves)) {
    const score = -negamax(applyMove(board, mode, move), search, otherColor(side), depth - 1, -beta, -floor, ply + 1);
    if (score > best) best = score;
    if (score > floor) floor = score;
    if (floor >= beta) break;
  }
  return best;
}

/** What the game history says about playing this move, on top of the search score. */
function historyAdjustedScore(score: number, board: BoardState, after: BoardState, mode: GameMode, move: Move, side: PieceColor, history: GameHistory | null | undefined): number {
  if (!history) return score;
  const seen = history.positions[positionKey(after, mode, otherColor(side))] ?? 0;
  if (seen + 1 >= REPETITIONS_TO_DRAW) return 0;
  const resetsClock = board[move.to.y][move.to.x] || board[move.from.y][move.from.x]?.type === "pawn";
  if (!resetsClock && history.quietPlies + 1 >= QUIET_PLIES_TO_DRAW) return 0;
  return seen > 0 ? score - REPEAT_PENALTY : score;
}

function findEasyMove(board: BoardState, mode: GameMode, side: PieceColor, moves: Move[], random: () => number): Move {
  let bestMove = moves[0];
  let bestScore = -Infinity;
  const search: Search = { mode, deadline: Infinity, nodes: 0 };
  for (const move of moves) {
    const noise = random() * EASY_NOISE;
    const score = -negamax(applyMove(board, mode, move), search, otherColor(side), 0, -Infinity, Infinity, 1) + noise;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

/** Deepens one ply at a time and keeps the result of the deepest search that finished in time. */
export function findBestMove(board: BoardState, mode: GameMode, color: PieceColor, options: BotOptions = {}): Move | null {
  const { level = "hard", history, maxDepth = 8, timeMs = 700, random = Math.random } = options;
  const legal = getAllLegalMoves(board, mode, color);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  if (level === "easy") return findEasyMove(board, mode, color, legal, random);

  const search: Search = { mode, deadline: performance.now() + timeMs, nodes: 0 };
  let ordered = orderMoves(board, mode, legal);
  let bestMove = ordered[0];

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const scored: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    try {
      for (const move of ordered) {
        const after = applyMove(board, mode, move);
        const raw = -negamax(after, depth === 1 ? { ...search, deadline: Infinity } : search, otherColor(color), depth - 1, -Infinity, -(alpha - TAKE_IT_NOW_BONUS), 1);
        // Without this, a promotion or capture still in reach next turn can be put off forever.
        const eager = move.promotion || board[move.to.y][move.to.x] ? TAKE_IT_NOW_BONUS : 0;
        const score = historyAdjustedScore(raw + eager, board, after, mode, move, color, history);
        scored.push({ move, score });
        if (score > alpha) alpha = score;
      }
    } catch (error) {
      if (error instanceof OutOfTime) break;
      throw error;
    }
    scored.sort((a, b) => b.score - a.score);
    ordered = scored.map(({ move }) => move);
    bestMove = ordered[0];
    if (scored[0].score >= MATE - depth) break;
  }
  return bestMove;
}
