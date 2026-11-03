import type { BoardState, DrawReason, GameHistory, GameMode, GameResult, Move, MoveDescription, PieceColor, PieceData, PieceMovement, PieceType, Position } from "../types";
import { MOBIUS_COLUMNS, MOBIUS_ROWS } from "./boardSize";

const PROMOTION_CHOICES: PieceType[] = ["queen", "rook", "bishop", "knight"];
const REPETITIONS_TO_DRAW = 3;
const QUIET_PLIES_TO_DRAW = 100;

const CLASSIC_SIZE = 8;
const PIECES: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const MOBIUS_QUEEN_COLUMN: PieceType[] = ["rook", "knight", "bishop", "queen"];
const MOBIUS_KING_COLUMN: PieceType[] = ["rook", "knight", "bishop", "king"];
const ROOK_DIRECTIONS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRECTIONS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL_DIRECTIONS: [number, number][] = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];
const KNIGHT_JUMPS: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

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

  // White holds columns 0-3 and black mirrors it on 8-11, leaving two equal
  // 4-column fronts. Pawns flank the army and march outward on both sides.
  for (let y = 0; y < MOBIUS_ROWS; y += 1) {
    board[y][0] = { type: "pawn", color: "white", direction: -1 };
    board[y][1] = { type: MOBIUS_QUEEN_COLUMN[y], color: "white", direction: -1 };
    board[y][2] = { type: MOBIUS_KING_COLUMN[y], color: "white", direction: 1 };
    board[y][3] = { type: "pawn", color: "white", direction: 1 };
    board[y][8] = { type: "pawn", color: "black", direction: -1 };
    board[y][9] = { type: MOBIUS_KING_COLUMN[y], color: "black", direction: -1 };
    board[y][10] = { type: MOBIUS_QUEEN_COLUMN[y], color: "black", direction: 1 };
    board[y][11] = { type: "pawn", color: "black", direction: 1 };
  }
  return board;
}

export function samePosition(a: Position | null, b: Position): boolean {
  return a?.x === b.x && a.y === b.y;
}

function inBounds(mode: GameMode, position: Position): boolean {
  const { columns, rows } = boardDimensions(mode);
  return position.x >= 0 && position.x < columns && position.y >= 0 && position.y < rows;
}

/** The Möbius playing surface closes up after 16 columns with rows unchanged: both faces form one loop. */
export function translatePosition(mode: GameMode, position: Position, dx: number, dy: number): Position | null {
  if (mode === "classic") {
    const target = { x: position.x + dx, y: position.y + dy };
    return inBounds(mode, target) ? target : null;
  }
  const y = position.y + dy;
  if (y < 0 || y >= MOBIUS_ROWS) return null;
  return { x: (position.x + dx + MOBIUS_COLUMNS) % MOBIUS_COLUMNS, y };
}

function slidingMoves(board: BoardState, mode: GameMode, from: Position, directions: [number, number][]): Position[] {
  const piece = board[from.y][from.x];
  if (!piece) return [];
  const moves: Position[] = [];
  for (const [dx, dy] of directions) {
    let next = translatePosition(mode, from, dx, dy);
    while (next) {
      // Around the loop the other direction may already have got here, and it went on from here too.
      // A full lap also ends here, on the moving piece's own square.
      if (mode === "mobius" && moves.some((move) => samePosition(move, next!))) break;
      const target: PieceData | null = board[next.y][next.x];
      if (target) {
        if (target.color !== piece.color && target.type !== "king") moves.push(next);
        break;
      }
      moves.push(next);
      next = translatePosition(mode, next, dx, dy);
    }
  }
  return moves;
}

function pawnForward(piece: PieceData): number {
  return piece.direction ?? (piece.color === "white" ? -1 : 1);
}

/** The pawn that would be taken if this pawn captured onto the empty square, if any. */
function enPassantVictim(board: BoardState, mode: GameMode, target: Position, piece: PieceData): Position | null {
  const forward = pawnForward(piece);
  const victim = mode === "classic"
    ? { x: target.x, y: target.y - forward }
    : translatePosition(mode, target, -forward, 0);
  if (!victim) return null;
  const pawn = board[victim.y]?.[victim.x];
  return pawn?.doubleStepped && pawn.color !== piece.color ? victim : null;
}

function isDoubleStep(mode: GameMode, { from, to }: Move): boolean {
  if (mode === "classic") return Math.abs(to.y - from.y) === 2;
  const distance = (to.x - from.x + MOBIUS_COLUMNS) % MOBIUS_COLUMNS;
  return distance === 2 || distance === MOBIUS_COLUMNS - 2;
}

function enPassantCapture(board: BoardState, mode: GameMode, { from, to }: Move): Position | null {
  const piece = board[from.y][from.x];
  if (piece?.type !== "pawn" || board[to.y][to.x]) return null;
  const isDiagonal = mode === "classic" ? to.x !== from.x : to.y !== from.y;
  return isDiagonal ? enPassantVictim(board, mode, to, piece) : null;
}

function pawnMoves(board: BoardState, mode: GameMode, from: Position, piece: PieceData): Position[] {
  const { color } = piece;
  const moves: Position[] = [];
  const forward = pawnForward(piece);
  const forwardVector: [number, number] = mode === "classic" ? [0, forward] : [forward, 0];
  const diagonals: [number, number][] = mode === "classic"
    ? [[-1, forward], [1, forward]]
    : [[forward, -1], [forward, 1]];

  for (const [dx, dy] of diagonals) {
    const target = translatePosition(mode, from, dx, dy);
    if (!target) continue;
    const occupant = board[target.y][target.x];
    const canCapture = occupant
      ? occupant.color !== color && occupant.type !== "king"
      : Boolean(enPassantVictim(board, mode, target, piece));
    if (canCapture) moves.push(target);
  }

  const oneStep = translatePosition(mode, from, forwardVector[0], forwardVector[1]);
  if (oneStep && !board[oneStep.y][oneStep.x]) {
    moves.push(oneStep);
    const twoStep = translatePosition(mode, oneStep, forwardVector[0], forwardVector[1]);
    if (!piece.hasMoved && twoStep && !board[twoStep.y][twoStep.x]) moves.push(twoStep);
  }
  return moves;
}

function steppingMoves(board: BoardState, mode: GameMode, from: Position, piece: PieceData, steps: [number, number][]): Position[] {
  const moves: Position[] = [];
  for (const [dx, dy] of steps) {
    const target = translatePosition(mode, from, dx, dy);
    const occupant = target ? board[target.y][target.x] : null;
    if (target && (!occupant || (occupant.color !== piece.color && occupant.type !== "king"))) moves.push(target);
  }
  return moves;
}

function pseudoMoves(board: BoardState, mode: GameMode, from: Position): Position[] {
  const piece = board[from.y]?.[from.x];
  if (!piece) return [];
  switch (piece.type) {
    case "pawn": return pawnMoves(board, mode, from, piece);
    case "rook": return slidingMoves(board, mode, from, ROOK_DIRECTIONS);
    case "bishop": return slidingMoves(board, mode, from, BISHOP_DIRECTIONS);
    case "queen": return slidingMoves(board, mode, from, ALL_DIRECTIONS);
    case "knight": return steppingMoves(board, mode, from, piece, KNIGHT_JUMPS);
    case "king": return steppingMoves(board, mode, from, piece, ALL_DIRECTIONS);
  }
}

export function applyMove(board: BoardState, mode: GameMode, move: Move): BoardState {
  // Pieces are never changed in place, so the copy can share them with the old board.
  const next = board.map((row) => row.slice());
  const piece = next[move.from.y][move.from.x];
  if (!piece) return next;
  const captured = enPassantCapture(board, mode, move);
  if (captured) next[captured.y][captured.x] = null;
  // The right to capture en passant lasts one turn only.
  for (const row of next) {
    row.forEach((other, x) => {
      if (other?.doubleStepped) row[x] = { ...other, doubleStepped: false };
    });
  }
  next[move.from.y][move.from.x] = null;
  const moved: PieceData = { ...piece, hasMoved: true, type: move.promotion ?? promotionType(mode, piece, move.to) ?? piece.type };
  if (piece.type === "pawn" && isDoubleStep(mode, move)) moved.doubleStepped = true;
  next[move.to.y][move.to.x] = moved;
  if (mode === "classic" && piece.type === "king" && Math.abs(move.to.x - move.from.x) === 2) {
    const rookFromX = move.to.x > move.from.x ? 7 : 0;
    const rookToX = move.to.x > move.from.x ? 5 : 3;
    const rook = next[move.from.y][rookFromX];
    next[move.from.y][rookFromX] = null;
    if (rook) next[move.from.y][rookToX] = { ...rook, hasMoved: true };
  }
  return next;
}

function mobiusPathDx(board: BoardState, { from, to }: Move, piece: PieceData): number {
  const forward = (to.x - from.x + MOBIUS_COLUMNS) % MOBIUS_COLUMNS;
  const shorter = forward <= MOBIUS_COLUMNS / 2 ? forward : forward - MOBIUS_COLUMNS;
  if (to.y !== from.y || (piece.type !== "rook" && piece.type !== "queen")) return shorter;
  // A rook or queen may have had to go the long way around the row.
  const step = Math.sign(shorter);
  for (let distance = 1; distance < Math.abs(shorter); distance += 1) {
    if (board[from.y][(from.x + step * distance + MOBIUS_COLUMNS) % MOBIUS_COLUMNS]) return shorter - step * MOBIUS_COLUMNS;
  }
  return shorter;
}

/** What a move looks like on the board. Call it with the board from before the move. */
export function describeMove(board: BoardState, mode: GameMode, move: Move): MoveDescription {
  const { from, to } = move;
  const piece = board[from.y][from.x];
  if (!piece) return { movements: [], captured: null };
  const target = board[to.y][to.x];
  const passedVictim = enPassantCapture(board, mode, move);
  const main: PieceMovement = {
    from,
    to,
    dx: mode === "mobius" ? mobiusPathDx(board, move, piece) : to.x - from.x,
    dy: to.y - from.y,
    jumps: piece.type === "knight",
  };
  const movements = [main];
  if (mode === "classic" && piece.type === "king" && Math.abs(to.x - from.x) === 2) {
    const rookFromX = to.x > from.x ? 7 : 0;
    const rookToX = to.x > from.x ? 5 : 3;
    movements.push({ from: { x: rookFromX, y: from.y }, to: { x: rookToX, y: from.y }, dx: rookToX - rookFromX, dy: 0, jumps: false });
  }
  if (passedVictim) return { movements, captured: { piece: board[passedVictim.y][passedVictim.x]!, at: passedVictim } };
  return { movements, captured: target ? { piece: target, at: to } : null };
}

export function isPromotionMove(board: BoardState, mode: GameMode, { from, to }: Move): boolean {
  const piece = board[from.y]?.[from.x];
  return Boolean(piece && promotionType(mode, piece, to));
}

function promotionType(mode: GameMode, piece: PieceData, target: Position): PieceType | null {
  if (piece.type !== "pawn") return null;
  if (mode === "classic") return target.y === 0 || target.y === 7 ? "queen" : null;
  // Six squares from either start column, the same distance as classic chess.
  const promotionColumn = piece.color === "white" ? (piece.direction === 1 ? 9 : 10) : (piece.direction === 1 ? 1 : 2);
  return target.x === promotionColumn ? "queen" : null;
}

function sliderAttacks(board: BoardState, mode: GameMode, square: Position, byColor: PieceColor, directions: [number, number][], slider: PieceType): boolean {
  for (const [dx, dy] of directions) {
    let next = translatePosition(mode, square, dx, dy);
    while (next && !samePosition(next, square)) {
      const piece: PieceData | null = board[next.y][next.x];
      if (piece) {
        if (piece.color === byColor && (piece.type === slider || piece.type === "queen")) return true;
        break;
      }
      next = translatePosition(mode, next, dx, dy);
    }
  }
  return false;
}

/** Looks outward from the square, which is far cheaper than generating every enemy move. */
function isSquareAttacked(board: BoardState, mode: GameMode, square: Position, byColor: PieceColor): boolean {
  const attackerAt = (dx: number, dy: number, type: PieceType) => {
    const target = translatePosition(mode, square, dx, dy);
    const piece = target ? board[target.y][target.x] : null;
    return piece?.color === byColor && piece.type === type ? piece : null;
  };
  if (KNIGHT_JUMPS.some(([dx, dy]) => attackerAt(dx, dy, "knight"))) return true;
  if (ALL_DIRECTIONS.some(([dx, dy]) => attackerAt(dx, dy, "king"))) return true;
  for (const [dx, dy] of BISHOP_DIRECTIONS) {
    const pawn = attackerAt(dx, dy, "pawn");
    if (pawn && (mode === "classic" ? dy : dx) === -pawnForward(pawn)) return true;
  }
  return sliderAttacks(board, mode, square, byColor, ROOK_DIRECTIONS, "rook")
    || sliderAttacks(board, mode, square, byColor, BISHOP_DIRECTIONS, "bishop");
}

export function findKing(board: BoardState, color: PieceColor): Position | null {
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const piece = board[y][x];
      if (piece?.type === "king" && piece.color === color) return { x, y };
    }
  }
  return null;
}

export function isKingInCheck(board: BoardState, mode: GameMode, color: PieceColor): boolean {
  const king = findKing(board, color);
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
    if (piece?.color !== color) return;
    getValidMoves(board, mode, { x, y }).forEach((to) => {
      const move = { from: { x, y }, to };
      if (isPromotionMove(board, mode, move)) PROMOTION_CHOICES.forEach((promotion) => moves.push({ ...move, promotion }));
      else moves.push(move);
    });
  }));
  return moves;
}

/** No sequence of moves can mate: lone knight, or only bishops all on one square color. */
export function hasInsufficientMaterial(board: BoardState): boolean {
  const others: { piece: PieceData; squareColor: number }[] = [];
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const piece = board[y][x];
      if (!piece || piece.type === "king") continue;
      if (piece.type !== "bishop" && piece.type !== "knight") return false;
      others.push({ piece, squareColor: (x + y) % 2 });
    }
  }
  if (others.length <= 1) return true;
  return others.every(({ piece, squareColor }) => piece.type === "bishop" && squareColor === others[0].squareColor);
}

export function getGameResult(board: BoardState, mode: GameMode, sideToMove: PieceColor): GameResult {
  if (hasInsufficientMaterial(board)) return "draw";
  if (getAllLegalMoves(board, mode, sideToMove).length) return null;
  if (!isKingInCheck(board, mode, sideToMove)) return "draw";
  return sideToMove === "white" ? "black-wins" : "white-wins";
}

function castlingRights(board: BoardState, color: PieceColor): string {
  const row = color === "white" ? 7 : 0;
  const king = board[row][4];
  if (king?.type !== "king" || king.color !== color || king.hasMoved) return "";
  const rookIsHome = (x: number) => {
    const rook = board[row][x];
    return rook?.type === "rook" && rook.color === color && !rook.hasMoved;
  };
  return `${rookIsHome(7) ? "k" : ""}${rookIsHome(0) ? "q" : ""}`;
}

/** Two positions count as the same only with the same pieces, turn, castling rights and en passant options. */
export function positionKey(board: BoardState, mode: GameMode, sideToMove: PieceColor): string {
  const squares = board.flat().map((piece) => (
    piece ? `${piece.color[0]}${piece.type}${piece.type === "pawn" ? piece.direction ?? "" : ""}` : "-"
  )).join(",");
  const rights = mode === "classic" ? `${castlingRights(board, "white")}/${castlingRights(board, "black")}` : "";
  const enPassant = getAllLegalMoves(board, mode, sideToMove)
    .flatMap((move) => {
      const victim = enPassantCapture(board, mode, move);
      return victim ? [`${move.from.x}.${move.from.y}`] : [];
    })
    .join(",");
  return `${squares}|${sideToMove}|${rights}|${enPassant}`;
}

export function startHistory(board: BoardState, mode: GameMode): GameHistory {
  return { positions: { [positionKey(board, mode, "white")]: 1 }, quietPlies: 0 };
}

export function recordMove(history: GameHistory, before: BoardState, after: BoardState, mode: GameMode, move: Move, nextSide: PieceColor): GameHistory {
  const isCapture = Boolean(before[move.to.y][move.to.x] || enPassantCapture(before, mode, move));
  const isPawnMove = before[move.from.y][move.from.x]?.type === "pawn";
  const key = positionKey(after, mode, nextSide);
  return {
    positions: { ...history.positions, [key]: (history.positions[key] ?? 0) + 1 },
    quietPlies: isCapture || isPawnMove ? 0 : history.quietPlies + 1,
  };
}

/** The result of the game once its history is considered too. Checkmate takes priority over any draw. */
export function finalResult(board: BoardState, mode: GameMode, sideToMove: PieceColor, history: GameHistory): { result: GameResult; drawReason: DrawReason | null } {
  const result = getGameResult(board, mode, sideToMove);
  if (result && result !== "draw") return { result, drawReason: null };
  if (hasInsufficientMaterial(board)) return { result: "draw", drawReason: "insufficient" };
  if (result === "draw") return { result, drawReason: "stalemate" };
  if (Object.values(history.positions).some((count) => count >= REPETITIONS_TO_DRAW)) return { result: "draw", drawReason: "repetition" };
  if (history.quietPlies >= QUIET_PLIES_TO_DRAW) return { result: "draw", drawReason: "fifty-moves" };
  return { result: null, drawReason: null };
}
