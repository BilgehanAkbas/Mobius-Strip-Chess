export type GameMode = "classic" | "mobius";
export type Opponent = "bot" | "human" | "online";
export type PieceType = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
export type PieceColor = "white" | "black";
export type PawnDirection = 1 | -1;

export interface Position {
  x: number;
  y: number;
}

export interface PieceData {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
  /** Möbius pawns march along x in either direction, so color alone cannot tell. Knights face this way. */
  direction?: PawnDirection;
  /** Set on a pawn for the one turn it can be captured en passant. */
  doubleStepped?: boolean;
}

export type BoardState = (PieceData | null)[][];

export interface Move {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

/** dx is the signed distance actually travelled, so a move can wrap around the Möbius loop. */
export interface PieceMovement {
  from: Position;
  to: Position;
  dx: number;
  dy: number;
  jumps: boolean;
}

export interface MoveDescription {
  movements: PieceMovement[];
  captured: { piece: PieceData; at: Position } | null;
}

export interface AnimatedMove extends MoveDescription {
  id: number;
  color: PieceColor;
}

export type GameResult = "white-wins" | "black-wins" | "draw" | null;
export type DrawReason = "stalemate" | "insufficient" | "repetition" | "fifty-moves";
export type EndReason = DrawReason | "checkmate" | "resignation" | "invalid-move";

export interface GameHistory {
  /** How many times each position has occurred. */
  positions: Record<string, number>;
  /** Half-moves since the last capture or pawn move. */
  quietPlies: number;
}
