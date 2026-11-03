import { expect, it } from "vitest";
import type { GameMode, PieceColor } from "../types";
import { applyMove, createInitialBoard, getAllLegalMoves, getGameResult, isKingInCheck } from "./board";

const GAMES = 1000;
const MAX_PLIES = 160;

function randomGenerator(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Slow on purpose, so `npm test` skips it. Run with `npm run test:full`.
it.each(["mobius", "classic"] as GameMode[])(`survives ${GAMES} random %s games with every rule invariant intact`, (mode) => {
  const random = randomGenerator(20261103);
  let mates = 0;
  for (let game = 0; game < GAMES; game += 1) {
    let board = createInitialBoard(mode);
    let side: PieceColor = "white";
    for (let ply = 0; ply < MAX_PLIES; ply += 1) {
      const pieces = board.flat().filter(Boolean);
      expect(pieces.filter((piece) => piece!.type === "king")).toHaveLength(2);
      expect(isKingInCheck(board, mode, side === "white" ? "black" : "white")).toBe(false);
      if (mode === "mobius") expect(pieces.filter((piece) => piece!.type === "pawn" && !piece!.direction)).toEqual([]);

      const moves = getAllLegalMoves(board, mode, side);
      if (!moves.length) {
        if (getGameResult(board, mode, side) !== "draw") mates += 1;
        break;
      }
      board = applyMove(board, mode, moves[Math.floor(random() * moves.length)]);
      side = side === "white" ? "black" : "white";
    }
  }
  expect(mates).toBeGreaterThan(0);
}, 300_000);
