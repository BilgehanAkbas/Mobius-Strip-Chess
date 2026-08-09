import type { BoardState, GameMode, GameResult, Move, PieceColor, PieceData, PieceType, Position } from "../types";
import { MOBIUS_COLUMNS, MOBIUS_ROWS } from "./mobiusGeometry";

const CLASSIC_SIZE = 8;
const PIECES: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const MOBIUS_BACK: PieceType[][] = [
  ["rook", "knight", "bishop", "queen"],
  ["king", "bishop", "knight", "rook"],
];
const PIECE_VALUE: Record<PieceType, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20_000 };

export function boardDimensions(mode: GameMode) {
  return mode === "classic" ? { columns: CLASSIC_SIZE, rows: CLASSIC_SIZE } : { columns: MOBIUS_COLUMNS, rows: MOBIUS_ROWS };
}

export function createInitialBoard(mode: GameMode): BoardState {
  const { columns, rows } = boardDimensions(mode);
  const board: BoardState = Array.from({ length: rows }, () => Array<PieceData | null>(columns).fill(null));
  if (mode === "classic") {
    for (let x = 0; x < CLASSIC_SIZE; x += 1) {
      board[0][x] = { type: PIECES[x], color: "black" };
      board[1][x] = { type: "pawn", color: "black" };
      board[6][x] = { type: "pawn", color: "white" };
      board[7][x] = { type: PIECES[x], color: "white" };
    }
    return board;
  }

  // Two armies sit on opposite sides of the loop (8 columns apart, halfway
  // around a 16-column strip) so both the "front" path and the wrap-around
  // "back" path between them are equal length — genuinely playable from
  // both directions instead of the armies starting crammed next to the seam.
  for (let y = 0; y < MOBIUS_ROWS; y += 1) {
    board[y][0] = { type: MOBIUS_BACK[0][y], color: "black" };
    board[y][1] = { type: MOBIUS_BACK[1][y], color: "black" };
    board[y][2] = { type: "pawn", color: "black" };
    board[y][3] = { type: "pawn", color: "black" };
    board[y][9] = { type: MOBIUS_BACK[0][MOBIUS_ROWS - 1 - y], color: "white" };
    board[y][8] = { type: MOBIUS_BACK[1][MOBIUS_ROWS - 1 - y], color: "white" };
    board[y][7] = { type: "pawn", color: "white" };
    board[y][6] = { type: "pawn", color: "white" };
  }
  return board;
}

export function cloneBoard(board: BoardState): BoardState {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function samePosition(a: Position | null, b: Position): boolean {
  return a?.x === b.x && a.y === b.y;
}

function inBounds(mode: GameMode, position: Position): boolean {
  const { columns, rows } = boardDimensions(mode);
  return position.x >= 0 && position.x < columns && position.y >= 0 && position.y < rows;
}

function crossesMobiusSeam(rawX: number): boolean {
  return Math.abs(Math.floor(rawX / MOBIUS_COLUMNS)) % 2 === 1;
}

/** Maps a local grid displacement across the Möbius seam; only the transverse row reverses. */
export function translatePosition(mode: GameMode, position: Position, dx: number, dy: number): Position | null {
  if (mode === "classic") {
    const target = { x: position.x + dx, y: position.y + dy };
    return inBounds(mode, target) ? target : null;
  }
  const rawX = position.x + dx;
  const x = ((rawX % MOBIUS_COLUMNS) + MOBIUS_COLUMNS) % MOBIUS_COLUMNS;
  let y = position.y + dy;
  if (crossesMobiusSeam(rawX)) y = MOBIUS_ROWS - 1 - y;
  return y >= 0 && y < MOBIUS_ROWS ? { x, y } : null;
}

function slidingMoves(board: BoardState, mode: GameMode, from: Position, directions: [number, number][], includeKing = false): Position[] {
  const piece = board[from.y][from.x];
  if (!piece) return [];
  const moves: Position[] = [];
  for (const [dx, initialDy] of directions) {
    let current = from;
    let dy = initialDy;
    const visited = new Set<string>([`${from.x},${from.y}`]);
    for (let steps = 0; steps < 64; steps += 1) {
      const rawX = current.x + dx;
      const next = translatePosition(mode, current, dx, dy);
      if (!next) break;
      if (visited.has(`${next.x},${next.y}`)) break;
      visited.add(`${next.x},${next.y}`);
      const target = board[next.y][next.x];
      if (target) {
        if (target.color !== piece.color && (includeKing || target.type !== "king")) moves.push(next);
        break;
      }
      moves.push(next);
      current = next;
      if (mode === "mobius" && crossesMobiusSeam(rawX)) dy *= -1;
    }
  }
  return moves;
}

function pawnMoves(board: BoardState, mode: GameMode, from: Position, piece: PieceData, attackOnly: boolean): Position[] {
  const { color } = piece;
  const moves: Position[] = [];
  const forward = color === "white" ? -1 : 1;
  const forwardVector: [number, number] = mode === "classic" ? [0, forward] : [forward, 0];
  const diagonals: [number, number][] = mode === "classic"
    ? [[-1, forward], [1, forward]]
    : [[forward, -1], [forward, 1]];

  for (const [dx, dy] of diagonals) {
    const target = translatePosition(mode, from, dx, dy);
    if (!target) continue;
    const occupant = board[target.y][target.x];
    if (attackOnly || (occupant && occupant.color !== color && occupant.type !== "king")) moves.push(target);
  }
  if (attackOnly) return moves;

  const oneStep = translatePosition(mode, from, forwardVector[0], forwardVector[1]);
  if (oneStep && !board[oneStep.y][oneStep.x]) {
    moves.push(oneStep);
    const twoStep = translatePosition(mode, oneStep, forwardVector[0], forwardVector[1]);
    if (!piece.hasMoved && twoStep && !board[twoStep.y][twoStep.x]) moves.push(twoStep);
  }
  return moves;
}

function pseudoMoves(board: BoardState, mode: GameMode, from: Position, attackOnly = false): Position[] {
  const piece = board[from.y]?.[from.x];
  if (!piece) return [];
  switch (piece.type) {
    case "pawn": return pawnMoves(board, mode, from, piece, attackOnly);
    case "rook": return slidingMoves(board, mode, from, [[1, 0], [-1, 0], [0, 1], [0, -1]], attackOnly);
    case "bishop": return slidingMoves(board, mode, from, [[1, 1], [1, -1], [-1, 1], [-1, -1]], attackOnly);
    case "queen": return slidingMoves(board, mode, from, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], attackOnly);
    case "knight": {
      const moves: Position[] = [];
      for (const [dx, dy] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as [number, number][]) {
        const target = translatePosition(mode, from, dx, dy);
        const occupant = target ? board[target.y][target.x] : null;
        if (target && (!occupant || (occupant.color !== piece.color && (attackOnly || occupant.type !== "king")))) moves.push(target);
      }
      return moves;
    }
    case "king": {
      const moves: Position[] = [];
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const target = translatePosition(mode, from, dx, dy);
        const occupant = target ? board[target.y][target.x] : null;
        if (target && (!occupant || (occupant.color !== piece.color && (attackOnly || occupant.type !== "king")))) moves.push(target);
      }
      return moves;
    }
  }
}

export function applyMove(board: BoardState, mode: GameMode, move: Move): BoardState {
  const next = cloneBoard(board);
  const piece = next[move.from.y][move.from.x];
  if (!piece) return next;
  next[move.from.y][move.from.x] = null;
  next[move.to.y][move.to.x] = { ...piece, hasMoved: true, type: move.promotion ?? promotionType(mode, piece, move.to) ?? piece.type };
  if (mode === "classic" && piece.type === "king" && Math.abs(move.to.x - move.from.x) === 2) {
    const rookFromX = move.to.x > move.from.x ? 7 : 0;
    const rookToX = move.to.x > move.from.x ? 5 : 3;
    const rook = next[move.from.y][rookFromX];
    next[move.from.y][rookFromX] = null;
    if (rook) next[move.from.y][rookToX] = { ...rook, hasMoved: true };
  }
  return next;
}

function promotionType(mode: GameMode, piece: PieceData, target: Position): PieceType | null {
  if (piece.type !== "pawn") return null;
  if (mode === "classic" && (target.y === 0 || target.y === 7)) return "queen";
  if (mode === "mobius" && ((piece.color === "black" && (target.x === 8 || target.x === 9)) || (piece.color === "white" && (target.x === 0 || target.x === 1)))) return "queen";
  return null;
}

function isSquareAttacked(board: BoardState, mode: GameMode, square: Position, byColor: PieceColor): boolean {
  return board.some((row, y) => row.some((piece, x) => (
    piece?.color === byColor && pseudoMoves(board, mode, { x, y }, true).some((move) => samePosition(square, move))
  )));
}

export function isKingInCheck(board: BoardState, mode: GameMode, color: PieceColor): boolean {
  let king: Position | null = null;
  board.forEach((row, y) => row.forEach((piece, x) => {
    if (piece?.type === "king" && piece.color === color) king = { x, y };
  }));
  return !king || isSquareAttacked(board, mode, king, color === "white" ? "black" : "white");
}

function castleMoves(board: BoardState, from: Position, color: PieceColor): Position[] {
  const king = board[from.y][from.x];
  if (!king || king.type !== "king" || king.hasMoved || from.x !== 4 || isKingInCheck(board, "classic", color)) return [];
  const enemy = color === "white" ? "black" : "white";
  const moves: Position[] = [];
  const kingSideRook = board[from.y][7];
  if (
    kingSideRook?.type === "rook" && kingSideRook.color === color && !kingSideRook.hasMoved &&
    !board[from.y][5] && !board[from.y][6] &&
    !isSquareAttacked(board, "classic", { x: 5, y: from.y }, enemy) &&
    !isSquareAttacked(board, "classic", { x: 6, y: from.y }, enemy)
  ) moves.push({ x: 6, y: from.y });
  const queenSideRook = board[from.y][0];
  if (
    queenSideRook?.type === "rook" && queenSideRook.color === color && !queenSideRook.hasMoved &&
    !board[from.y][1] && !board[from.y][2] && !board[from.y][3] &&
    !isSquareAttacked(board, "classic", { x: 3, y: from.y }, enemy) &&
    !isSquareAttacked(board, "classic", { x: 2, y: from.y }, enemy)
  ) moves.push({ x: 2, y: from.y });
  return moves;
}

export function getValidMoves(board: BoardState, mode: GameMode, from: Position): Position[] {
  const piece = board[from.y]?.[from.x];
  if (!piece) return [];
  const candidates = [
    ...pseudoMoves(board, mode, from),
    ...(mode === "classic" && piece.type === "king" ? castleMoves(board, from, piece.color) : []),
  ];
  return candidates.filter((to) => !isKingInCheck(applyMove(board, mode, { from, to }), mode, piece.color));
}

export function getAllLegalMoves(board: BoardState, mode: GameMode, color: PieceColor): Move[] {
  const moves: Move[] = [];
  board.forEach((row, y) => row.forEach((piece, x) => {
    if (piece?.color === color) getValidMoves(board, mode, { x, y }).forEach((to) => moves.push({ from: { x, y }, to }));
  }));
  return moves;
}

export function getGameResult(board: BoardState, mode: GameMode, sideToMove: PieceColor): GameResult {
  if (getAllLegalMoves(board, mode, sideToMove).length) return null;
  if (!isKingInCheck(board, mode, sideToMove)) return "draw";
  return sideToMove === "white" ? "black-wins" : "white-wins";
}

function evaluate(board: BoardState, mode: GameMode, perspective: PieceColor): number {
  let score = 0;
  board.forEach((row) => row.forEach((piece) => {
    if (piece) score += piece.color === perspective ? PIECE_VALUE[piece.type] : -PIECE_VALUE[piece.type];
  }));
  const opponent: PieceColor = perspective === "white" ? "black" : "white";
  return score + (getAllLegalMoves(board, mode, perspective).length - getAllLegalMoves(board, mode, opponent).length) * 3;
}

function minimax(board: BoardState, mode: GameMode, side: PieceColor, root: PieceColor, depth: number, alpha: number, beta: number): number {
  const result = getGameResult(board, mode, side);
  if (result) return result === "draw" ? 0 : (result === `${root}-wins` ? 1_000_000 + depth : -1_000_000 - depth);
  if (depth === 0) return evaluate(board, mode, root);
  const moves = getAllLegalMoves(board, mode, side);
  const nextSide: PieceColor = side === "white" ? "black" : "white";
  if (side === root) {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, minimax(applyMove(board, mode, move), mode, nextSide, root, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, minimax(applyMove(board, mode, move), mode, nextSide, root, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function findBestMove(board: BoardState, mode: GameMode, color: PieceColor, depth = 2): Move | null {
  const moves = getAllLegalMoves(board, mode, color);
  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const target = board[move.to.y][move.to.x];
    const captureBonus = target ? PIECE_VALUE[target.type] : 0;
    const score = minimax(applyMove(board, mode, move), mode, color === "white" ? "black" : "white", color, depth - 1, -Infinity, Infinity) + captureBonus / 1000;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}
