export type GameMode = "classic" | "mobius";
export type PieceType = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
export type PieceColor = "white" | "black";

export interface Position {
  x: number;
  y: number;
}

export interface PieceData {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export type BoardState = (PieceData | null)[][];

export interface Move {
  from: Position;
  to: Position;
  promotion?: PieceType;
}

export type GameResult = "white-wins" | "black-wins" | "draw" | null;
