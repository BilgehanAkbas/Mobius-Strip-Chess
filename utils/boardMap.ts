import type { PieceColor, PieceData, PieceType } from "../types";
import { MOBIUS_COLUMNS } from "./boardSize";

// The text-style selector keeps browsers from drawing the pawn as a color emoji.
export const PIECE_GLYPHS: Record<PieceType, string> = {
  pawn: "♟︎",
  knight: "♞︎",
  bishop: "♝︎",
  rook: "♜︎",
  queen: "♛︎",
  king: "♚︎",
};

export const PIECE_NAMES: Record<PieceType, string> = {
  pawn: "piyon",
  knight: "at",
  bishop: "fil",
  rook: "kale",
  queen: "vezir",
  king: "şah",
};

const FIRST_MAP_COLUMN: Record<PieceColor, number> = { white: 12, black: 4 };
const VALUE_ORDER: PieceType[] = ["queen", "rook", "bishop", "knight", "pawn"];

/** Left to right on the flat map, with the player's own army near the middle. */
export function mapColumnOrder(color: PieceColor): number[] {
  return Array.from({ length: MOBIUS_COLUMNS }, (_, index) => (FIRST_MAP_COLUMN[color] + index) % MOBIUS_COLUMNS);
}

/** Captured pieces of one color, most valuable first. */
export function capturedOfColor(captured: PieceData[], color: PieceColor): PieceType[] {
  return captured
    .filter((piece) => piece.color === color)
    .map((piece) => piece.type)
    .sort((a, b) => VALUE_ORDER.indexOf(a) - VALUE_ORDER.indexOf(b));
}
