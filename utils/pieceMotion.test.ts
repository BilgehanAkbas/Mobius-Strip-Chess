import { describe, expect, it } from "vitest";
import type { Move, PieceMovement } from "../types";
import { applyMove, createInitialBoard, describeMove, getAllLegalMoves } from "./board";
import { getMobiusFrame, MOBIUS_COLUMNS } from "./mobiusGeometry";
import { motionDuration, motionPoint, moveSettleTime } from "./pieceMotion";

function emptyMobius() {
  const board = createInitialBoard("mobius").map((row) => row.map(() => null as ReturnType<typeof createInitialBoard>[number][number]));
  board[3][5] = { type: "king", color: "white" };
  board[3][13] = { type: "king", color: "black" };
  return board;
}

function move(fromX: number, fromY: number, toX: number, toY: number): Move {
  return { from: { x: fromX, y: fromY }, to: { x: toX, y: toY } };
}

function mod16(value: number) {
  return ((value % MOBIUS_COLUMNS) + MOBIUS_COLUMNS) % MOBIUS_COLUMNS;
}

describe("describeMove", () => {
  it("takes the short way around the loop", () => {
    const board = emptyMobius();
    board[0][15] = { type: "pawn", color: "white", direction: 1, hasMoved: true };
    expect(describeMove(board, "mobius", move(15, 0, 0, 0)).movements[0].dx).toBe(1);
    board[0][15] = null;
    board[0][0] = { type: "rook", color: "white" };
    expect(describeMove(board, "mobius", move(0, 0, 14, 0)).movements[0].dx).toBe(-2);
  });

  it("goes the long way when the short way is blocked", () => {
    const board = emptyMobius();
    board[0][0] = { type: "rook", color: "white" };
    board[0][15] = { type: "pawn", color: "white", direction: 1 };
    const { dx } = describeMove(board, "mobius", move(0, 0, 14, 0)).movements[0];
    expect(dx).toBe(14);
    for (let distance = 1; distance < dx; distance += 1) expect(board[0][mod16(distance)]).toBeNull();
  });

  it("reports the captured piece", () => {
    const board = emptyMobius();
    board[0][0] = { type: "rook", color: "white" };
    board[0][4] = { type: "knight", color: "black" };
    expect(describeMove(board, "mobius", move(0, 0, 4, 0)).captured).toMatchObject({ piece: { type: "knight" }, at: { x: 4, y: 0 } });
  });

  it("moves the rook too when castling", () => {
    const board = createInitialBoard("classic");
    board[7][5] = null;
    board[7][6] = null;
    const { movements } = describeMove(board, "classic", move(4, 7, 6, 7));
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({ from: { x: 7, y: 7 }, to: { x: 5, y: 7 }, dx: -2 });
  });

  it("marks only knights as jumping", () => {
    const board = createInitialBoard("mobius");
    for (const legal of getAllLegalMoves(board, "mobius", "white")) {
      expect(describeMove(board, "mobius", legal).movements[0].jumps).toBe(board[legal.from.y][legal.from.x]!.type === "knight");
    }
  });

  it("always lands on the target square", () => {
    let board = createInitialBoard("mobius");
    for (const side of ["white", "black", "white", "black"] as const) {
      const moves = getAllLegalMoves(board, "mobius", side);
      for (const legal of moves) {
        const { dx, dy, from, to } = describeMove(board, "mobius", legal).movements[0];
        expect(mod16(from.x + dx)).toBe(to.x);
        expect(from.y + dy).toBe(to.y);
      }
      board = applyMove(board, "mobius", moves[0]);
    }
  });
});

describe("motion", () => {
  const rookLap: PieceMovement = { from: { x: 14, y: 1 }, to: { x: 4, y: 1 }, dx: 6, dy: 0, jumps: false };

  it("starts and ends exactly on the squares", () => {
    expect(motionPoint(rookLap, 0)).toEqual({ x: 14, y: 1, lift: 0 });
    expect(motionPoint(rookLap, 1)).toMatchObject({ x: 20, y: 1 });
    expect(getMobiusFrame({ x: 20, y: 1 }).position.distanceTo(getMobiusFrame({ x: 4, y: 1 }).position)).toBeLessThan(1e-3);
  });

  it("only lifts jumping pieces, and lands them", () => {
    const hop: PieceMovement = { ...rookLap, jumps: true };
    expect(motionPoint(rookLap, 0.5).lift).toBe(0);
    expect(motionPoint(hop, 0.5).lift).toBeGreaterThan(0.3);
    expect(motionPoint(hop, 1).lift).toBeCloseTo(0, 5);
  });

  it("stays on the strip without sudden jumps, seam and twist included", () => {
    for (let startX = 0; startX < MOBIUS_COLUMNS; startX += 1) {
      for (let y = 0; y < 4; y += 1) {
        const path: PieceMovement = { from: { x: startX, y }, to: { x: mod16(startX + 2), y }, dx: 2, dy: 0, jumps: false };
        let previous = getMobiusFrame({ x: startX, y });
        for (let step = 1; step <= 40; step += 1) {
          const point = motionPoint(path, step / 40);
          const frame = getMobiusFrame({ x: point.x, y: point.y });
          // Peak eased speed on the outer row. A real jump across the seam would be many times this.
          expect(frame.position.distanceTo(previous.position)).toBeLessThan(0.75);
          expect(frame.normal.dot(previous.normal)).toBeGreaterThan(0.95);
          previous = frame;
        }
      }
    }
  });

  it("keeps a long lap moving at a watchable pace", () => {
    expect(motionDuration({ ...rookLap, dx: 1 })).toBeLessThan(0.4);
    expect(motionDuration({ ...rookLap, dx: 15 })).toBeLessThanOrEqual(0.8);
  });

  it("waits for the slowest piece when two move together", () => {
    const quick = { ...rookLap, dx: 1 };
    const slow = { ...rookLap, dx: 6 };
    expect(moveSettleTime({ movements: [quick, slow], captured: null })).toBe(motionDuration(slow));
  });
});
