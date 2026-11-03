import { describe, expect, it } from "vitest";
import type { BoardState, GameMode, Move, PieceColor, PieceData } from "../types";
import {
  applyMove,
  createInitialBoard,
  getAllLegalMoves,
  getGameResult,
  getValidMoves,
  isKingInCheck,
  translatePosition,
} from "./board";
import { findBestMove } from "./bot";

function perft(board: BoardState, mode: GameMode, side: PieceColor, depth: number): number {
  const moves = getAllLegalMoves(board, mode, side);
  if (depth === 1) return moves.length;
  const next: PieceColor = side === "white" ? "black" : "white";
  return moves.reduce((total, move) => total + perft(applyMove(board, mode, move), mode, next, depth - 1), 0);
}

function play(board: BoardState, mode: GameMode, moves: [number, number, number, number][]): BoardState {
  return moves.reduce<BoardState>((current, [fromX, fromY, toX, toY]) => {
    const move: Move = { from: { x: fromX, y: fromY }, to: { x: toX, y: toY } };
    return applyMove(current, mode, move);
  }, board);
}

describe("classic rules", () => {
  it("matches the known move counts from the start position", () => {
    const board = createInitialBoard("classic");
    expect(perft(board, "classic", "white", 1)).toBe(20);
    expect(perft(board, "classic", "white", 2)).toBe(400);
    expect(perft(board, "classic", "white", 3)).toBe(8902);
  });

  it("detects fool's mate", () => {
    const board = play(createInitialBoard("classic"), "classic", [
      [5, 6, 5, 5],
      [4, 1, 4, 3],
      [6, 6, 6, 4],
      [3, 0, 7, 4],
    ]);
    expect(getGameResult(board, "classic", "white")).toBe("black-wins");
  });

  it("castles king side and moves the rook", () => {
    const board = createInitialBoard("classic");
    board[7][5] = null;
    board[7][6] = null;
    expect(getValidMoves(board, "classic", { x: 4, y: 7 })).toContainEqual({ x: 6, y: 7 });
    const castled = play(board, "classic", [[4, 7, 6, 7]]);
    expect(castled[7][6]?.type).toBe("king");
    expect(castled[7][5]?.type).toBe("rook");
    expect(castled[7][7]).toBeNull();
  });

  it("promotes a pawn to a queen on the last rank", () => {
    const board = createInitialBoard("classic");
    board[1][0] = { type: "pawn", color: "white", hasMoved: true };
    board[0][0] = null;
    expect(play(board, "classic", [[0, 1, 0, 0]])[0][0]).toMatchObject({ type: "queen", color: "white" });
  });
});

const ROWS = [0, 1, 2, 3];

function kingsOnly(): BoardState {
  const board: BoardState = Array.from({ length: 4 }, () => Array<PieceData | null>(16).fill(null));
  board[3][5] = { type: "king", color: "white" };
  board[3][13] = { type: "king", color: "black" };
  return board;
}

function column(board: BoardState, x: number) {
  return ROWS.map((y) => (board[y][x] ? `${board[y][x]!.color[0]}:${board[y][x]!.type}` : null));
}

describe("mobius start position", () => {
  const board = createInitialBoard("mobius");

  it("flanks each army with pawns and leaves two equal fronts", () => {
    expect(column(board, 0)).toEqual(Array(4).fill("w:pawn"));
    expect(column(board, 1)).toEqual(["w:rook", "w:knight", "w:bishop", "w:queen"]);
    expect(column(board, 2)).toEqual(["w:rook", "w:knight", "w:bishop", "w:king"]);
    expect(column(board, 3)).toEqual(Array(4).fill("w:pawn"));
    expect(column(board, 8)).toEqual(Array(4).fill("b:pawn"));
    expect(column(board, 9)).toEqual(["b:rook", "b:knight", "b:bishop", "b:king"]);
    expect(column(board, 10)).toEqual(["b:rook", "b:knight", "b:bishop", "b:queen"]);
    expect(column(board, 11)).toEqual(Array(4).fill("b:pawn"));
    for (const x of [4, 5, 6, 7, 12, 13, 14, 15]) expect(column(board, x)).toEqual(Array(4).fill(null));
  });

  it("uses the same piece set as classic chess", () => {
    const count = (mode: GameMode) => createInitialBoard(mode).flat().filter(Boolean).map((piece) => `${piece!.color}:${piece!.type}`).sort();
    expect(count("mobius")).toEqual(count("classic"));
  });

  it("gives both sides 20 moves and no captures", () => {
    for (const side of ["white", "black"] as PieceColor[]) {
      const moves = getAllLegalMoves(board, "mobius", side);
      expect(moves).toHaveLength(20);
      expect(moves.filter(({ to }) => board[to.y][to.x])).toEqual([]);
    }
  });

  it("lets every pawn move from the start", () => {
    board.forEach((row, y) => row.forEach((piece, x) => {
      if (piece?.type === "pawn") expect(getValidMoves(board, "mobius", { x, y })).toHaveLength(2);
    }));
  });

  it("is symmetric between the two sides", () => {
    expect(perft(board, "mobius", "white", 3)).toBe(perft(board, "mobius", "black", 3));
  });

  it("faces the knights outward like the pawns beside them", () => {
    expect(board[1][1]).toMatchObject({ type: "knight", direction: -1 });
    expect(board[1][2]).toMatchObject({ type: "knight", direction: 1 });
    expect(board[1][9]).toMatchObject({ type: "knight", direction: -1 });
    expect(board[1][10]).toMatchObject({ type: "knight", direction: 1 });
  });

  it("does not leave either side in check", () => {
    expect(isKingInCheck(board, "mobius", "white")).toBe(false);
    expect(isKingInCheck(board, "mobius", "black")).toBe(false);
  });
});

describe("mobius topology", () => {
  it("closes the loop after 16 columns and keeps the row", () => {
    for (const y of ROWS) {
      expect(translatePosition("mobius", { x: 15, y }, 1, 0)).toEqual({ x: 0, y });
      expect(translatePosition("mobius", { x: 0, y }, -1, 0)).toEqual({ x: 15, y });
    }
    expect(translatePosition("mobius", { x: 15, y: 1 }, 2, 1)).toEqual({ x: 1, y: 2 });
  });

  it("stops at the strip edges", () => {
    expect(translatePosition("mobius", { x: 4, y: 0 }, 0, -1)).toBeNull();
    expect(translatePosition("mobius", { x: 4, y: 3 }, 1, 1)).toBeNull();
  });

  it("alternates the checker pattern everywhere, seam included", () => {
    for (let x = 0; x < 16; x += 1) for (const y of ROWS) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = translatePosition("mobius", { x, y }, dx, dy);
        if (next) expect((next.x + next.y) % 2).not.toBe((x + y) % 2);
      }
    }
  });

  it("keeps a bishop on its own colour across the seam", () => {
    const board = kingsOnly();
    board[1][15] = { type: "bishop", color: "white" };
    const moves = getValidMoves(board, "mobius", { x: 15, y: 1 });
    expect(moves).toContainEqual({ x: 0, y: 2 });
    expect(moves).toContainEqual({ x: 0, y: 0 });
    for (const move of moves) expect((move.x + move.y) % 2).toBe(0);
  });

  it("lets a rook lap an open row without listing a square twice", () => {
    const board = kingsOnly();
    board[0][0] = { type: "rook", color: "white" };
    const moves = getValidMoves(board, "mobius", { x: 0, y: 0 });
    expect(moves.filter((move) => move.y === 0)).toHaveLength(15);
    expect(new Set(moves.map((move) => `${move.x},${move.y}`)).size).toBe(moves.length);
  });

  it("gives check across the seam", () => {
    const board = kingsOnly();
    board[3][5] = null;
    board[0][15] = { type: "king", color: "white" };
    board[0][1] = { type: "rook", color: "black" };
    expect(isKingInCheck(board, "mobius", "white")).toBe(true);
  });

  it("detects mate on the loop", () => {
    const board = kingsOnly();
    board[3][5] = null;
    board[3][13] = { type: "king", color: "white" };
    board[0][5] = { type: "king", color: "black" };
    board[0][8] = { type: "rook", color: "white" };
    board[1][8] = { type: "rook", color: "white" };
    expect(getGameResult(board, "mobius", "black")).toBe("white-wins");
  });
});

describe("mobius pawns", () => {
  const start = createInitialBoard("mobius");

  it("double-steps outward from each start column", () => {
    expect(getValidMoves(start, "mobius", { x: 3, y: 0 })).toEqual([{ x: 4, y: 0 }, { x: 5, y: 0 }]);
    expect(getValidMoves(start, "mobius", { x: 0, y: 0 })).toEqual([{ x: 15, y: 0 }, { x: 14, y: 0 }]);
    expect(getValidMoves(start, "mobius", { x: 8, y: 0 })).toEqual([{ x: 7, y: 0 }, { x: 6, y: 0 }]);
    expect(getValidMoves(start, "mobius", { x: 11, y: 0 })).toEqual([{ x: 12, y: 0 }, { x: 13, y: 0 }]);
  });

  it("keeps its direction after moving and only captures forward", () => {
    const board = kingsOnly();
    board[1][0] = { type: "pawn", color: "white", direction: -1 };
    board[0][15] = { type: "knight", color: "black" };
    board[0][1] = { type: "knight", color: "black" };
    const moves = getValidMoves(board, "mobius", { x: 0, y: 1 });
    expect(moves).toContainEqual({ x: 15, y: 0 });
    expect(moves).not.toContainEqual({ x: 1, y: 0 });
    const moved = play(board, "mobius", [[0, 1, 15, 1]]);
    expect(moved[1][15]?.direction).toBe(-1);
    expect(getValidMoves(moved, "mobius", { x: 15, y: 1 })).toContainEqual({ x: 14, y: 1 });
  });

  it.each([
    ["white", 3, 9],
    ["white", 0, 10],
    ["black", 11, 1],
    ["black", 8, 2],
  ] as const)("promotes a %s pawn from column %i after six squares on column %i", (_color, startX, promotionX) => {
    const pawn = start[0][startX]!;
    let board = kingsOnly();
    board[0][startX] = pawn;
    let x: number = startX;
    let steps = 0;
    while (board[0][x]?.type === "pawn") {
      expect(steps).toBeLessThan(6);
      const nextX = (x + pawn.direction! + 16) % 16;
      expect(getValidMoves(board, "mobius", { x, y: 0 })).toContainEqual({ x: nextX, y: 0 });
      board = play(board, "mobius", [[x, 0, nextX, 0]]);
      x = nextX;
      steps += 1;
    }
    expect(steps).toBe(6);
    expect(x).toBe(promotionX);
    expect(board[0][x]).toMatchObject({ type: "queen", color: pawn.color });
  });
});

describe("mobius bot", () => {
  it("finds a legal move in the start position", () => {
    const board = createInitialBoard("mobius");
    const move = findBestMove(board, "mobius", "white", { maxDepth: 2 });
    expect(getAllLegalMoves(board, "mobius", "white")).toContainEqual(move);
  });
});
