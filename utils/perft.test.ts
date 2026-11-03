import { describe, expect, it } from "vitest";
import type { BoardState, PieceColor, PieceData, PieceType } from "../types";
import { applyMove, getAllLegalMoves } from "./board";

const FEN_TYPES: Record<string, PieceType> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

function parseFen(fen: string): { board: BoardState; side: PieceColor } {
  const [placement, sideToMove, castling, enPassant] = fen.split(" ");
  const board: BoardState = placement.split("/").map((rank, y) => {
    const row: (PieceData | null)[] = [];
    for (const symbol of rank) {
      if (/\d/.test(symbol)) {
        for (let empty = 0; empty < Number(symbol); empty += 1) row.push(null);
        continue;
      }
      const color: PieceColor = symbol === symbol.toUpperCase() ? "white" : "black";
      const type = FEN_TYPES[symbol.toLowerCase()];
      const onStartRank = color === "white" ? y === 6 : y === 1;
      row.push({ type, color, hasMoved: type === "pawn" ? !onStartRank : type === "king" || type === "rook" });
    }
    return row;
  });

  const grant = (x: number, y: number) => {
    const piece = board[y][x];
    if (piece) piece.hasMoved = false;
  };
  if (castling.includes("K")) { grant(4, 7); grant(7, 7); }
  if (castling.includes("Q")) { grant(4, 7); grant(0, 7); }
  if (castling.includes("k")) { grant(4, 0); grant(7, 0); }
  if (castling.includes("q")) { grant(4, 0); grant(0, 0); }

  if (enPassant !== "-") {
    const x = enPassant.charCodeAt(0) - 97;
    const passedY = 8 - Number(enPassant[1]);
    const pawn = board[passedY === 2 ? 3 : 4][x];
    if (pawn) pawn.doubleStepped = true;
  }
  return { board, side: sideToMove === "w" ? "white" : "black" };
}

function perft(board: BoardState, side: PieceColor, depth: number): number {
  const moves = getAllLegalMoves(board, "classic", side);
  if (depth === 1) return moves.length;
  const next: PieceColor = side === "white" ? "black" : "white";
  return moves.reduce((total, move) => total + perft(applyMove(board, "classic", move), next, depth - 1), 0);
}

// Published move counts. They exercise castling, en passant, promotion and pins together,
// so a single rule bug anywhere makes a count come out wrong.
const POSITIONS: { name: string; fen: string; counts: number[] }[] = [
  { name: "start", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", counts: [20, 400, 8902] },
  { name: "Kiwipete", fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", counts: [48, 2039, 97862] },
  { name: "endgame with en passant", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2812, 43238] },
  { name: "promotions and checks", fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", counts: [6, 264, 9467] },
  { name: "promotion with discovered check", fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", counts: [44, 1486, 62379] },
  { name: "middlegame", fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", counts: [46, 2079, 89890] },
];

describe.each(POSITIONS)("perft: $name", ({ fen, counts }) => {
  it.each(counts.map((count, index) => ({ depth: index + 1, count })))("depth $depth has $count positions", ({ depth, count }) => {
    const { board, side } = parseFen(fen);
    expect(perft(board, side, depth)).toBe(count);
  }, 60_000);
});
