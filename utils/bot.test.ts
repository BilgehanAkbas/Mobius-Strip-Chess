import { describe, expect, it } from "vitest";
import type { BoardState, GameHistory, GameMode, Move, PieceColor, PieceData, PieceType } from "../types";
import { applyMove, createInitialBoard, finalResult, getAllLegalMoves, getGameResult, positionKey, recordMove, startHistory } from "./board";
import { findBestMove } from "./bot";

type Placement = [number, number, PieceColor, PieceType, Partial<PieceData>?];

function place(mode: GameMode, placements: Placement[]): BoardState {
  const [rows, columns] = mode === "classic" ? [8, 8] : [4, 16];
  const board: BoardState = Array.from({ length: rows }, () => Array<PieceData | null>(columns).fill(null));
  for (const [x, y, color, type, extra] of placements) board[y][x] = { color, type, hasMoved: true, ...extra };
  return board;
}

const FIXED_DEPTH = { maxDepth: 4, timeMs: 60_000 };

describe("finding mate", () => {
  it("takes a mate in one in classic chess", () => {
    const board = place("classic", [[6, 2, "white", "king"], [0, 1, "white", "queen"], [7, 0, "black", "king"]]);
    const move = findBestMove(board, "classic", "white", FIXED_DEPTH)!;
    expect(getGameResult(applyMove(board, "classic", move), "classic", "black")).toBe("white-wins");
  });

  it("takes a mate in two in classic chess", () => {
    // Two rooks on a lone king: Rb7 then Ra8 is the ladder.
    const board = place("classic", [[4, 7, "white", "king"], [0, 2, "white", "rook"], [1, 3, "white", "rook"], [7, 0, "black", "king"]]);
    const first = findBestMove(board, "classic", "white", FIXED_DEPTH)!;
    const afterFirst = applyMove(board, "classic", first);
    for (const reply of getAllLegalMoves(afterFirst, "classic", "black")) {
      const afterReply = applyMove(afterFirst, "classic", reply);
      const second = findBestMove(afterReply, "classic", "white", FIXED_DEPTH)!;
      expect(getGameResult(applyMove(afterReply, "classic", second), "classic", "black")).toBe("white-wins");
    }
  });

  it("takes a mate in one on the Möbius loop", () => {
    const board = place("mobius", [[13, 3, "white", "king"], [8, 0, "white", "rook"], [9, 1, "white", "rook"], [5, 0, "black", "king", { hasMoved: true }]]);
    const move = findBestMove(board, "mobius", "white", FIXED_DEPTH)!;
    expect(getGameResult(applyMove(board, "mobius", move), "mobius", "black")).toBe("white-wins");
  });

  it("avoids walking into a mate in one", () => {
    const board = place("classic", [[0, 7, "white", "king"], [1, 6, "white", "pawn"], [0, 6, "white", "pawn"], [7, 1, "black", "rook"], [7, 0, "black", "king"], [3, 7, "white", "rook"]]);
    const move = findBestMove(board, "classic", "white", FIXED_DEPTH)!;
    const after = applyMove(board, "classic", move);
    const mates = getAllLegalMoves(after, "classic", "black")
      .filter((reply) => getGameResult(applyMove(after, "classic", reply), "classic", "white") === "white-wins" || getGameResult(applyMove(after, "classic", reply), "classic", "white") === "black-wins");
    expect(mates).toEqual([]);
  });
});

describe("finishing a won game", () => {
  function playOut(mode: GameMode, placements: Placement[]) {
    let board = place(mode, placements);
    let history = startHistory(board, mode);
    let side: PieceColor = "white";
    for (let ply = 0; ply < 120; ply += 1) {
      const move = findBestMove(board, mode, side, { maxDepth: 3, timeMs: 60_000, history });
      if (!move) break;
      const after = applyMove(board, mode, move);
      side = side === "white" ? "black" : "white";
      history = recordMove(history, board, after, mode, move, side);
      board = after;
      const { result } = finalResult(board, mode, side, history);
      if (result) return result;
    }
    return "unfinished";
  }

  it.each<[string, GameMode, Placement[]]>([
    ["queen on the Möbius loop", "mobius", [[0, 1, "white", "king"], [3, 1, "white", "queen"], [9, 2, "black", "king"]]],
    // A single rook usually cannot force mate on the loop: with no corners, the king keeps running.
    // An exhaustive search of the ending finds a forced win in only 4% of positions, so two are used here.
    ["two rooks on the Möbius loop", "mobius", [[0, 1, "white", "king"], [3, 1, "white", "rook"], [4, 2, "white", "rook"], [9, 2, "black", "king"]]],
    ["queen in classic chess", "classic", [[0, 7, "white", "king"], [1, 6, "white", "queen"], [4, 3, "black", "king"]]],
    ["rook in classic chess", "classic", [[0, 7, "white", "king"], [1, 6, "white", "rook"], [4, 3, "black", "king"]]],
  ])("mates with a king and %s", (_name, mode, placements) => {
    expect(playOut(mode, placements)).toBe("white-wins");
  }, 120_000);
});

describe("judging material", () => {
  it("takes a free queen", () => {
    const board = place("classic", [[4, 7, "white", "king"], [4, 0, "black", "king"], [0, 4, "white", "rook"], [7, 4, "black", "queen"]]);
    expect(findBestMove(board, "classic", "white", FIXED_DEPTH)).toMatchObject({ to: { x: 7, y: 4 } });
  });

  it("does not win a defended pawn with a queen", () => {
    const board = place("classic", [[4, 7, "white", "king"], [4, 0, "black", "king"], [3, 5, "white", "queen"], [3, 1, "black", "pawn"], [2, 0, "black", "bishop"]]);
    const move = findBestMove(board, "classic", "white", FIXED_DEPTH);
    expect(move?.to).not.toEqual({ x: 3, y: 1 });
  });

  it("promotes to a queen", () => {
    const board = place("classic", [[0, 7, "white", "king"], [7, 7, "black", "king"], [3, 1, "white", "pawn"]]);
    expect(findBestMove(board, "classic", "white", FIXED_DEPTH)).toMatchObject({ from: { x: 3, y: 1 }, promotion: "queen" });
  });
});

describe("game history", () => {
  // White is a queen up, so a draw by repetition would throw away a won game.
  const winning = () => place("classic", [[4, 7, "white", "king"], [0, 7, "white", "queen"], [4, 0, "black", "king"]]);

  it("does not repeat a position into a draw when ahead", () => {
    const board = winning();
    const move = findBestMove(board, "classic", "white", FIXED_DEPTH)!;
    const after = applyMove(board, "classic", move);
    const history: GameHistory = { positions: { [positionKey(after, "classic", "black")]: 2 }, quietPlies: 10 };
    const avoided = findBestMove(board, "classic", "white", { ...FIXED_DEPTH, history })!;
    expect(positionKey(applyMove(board, "classic", avoided), "classic", "black")).not.toBe(positionKey(after, "classic", "black"));
  });

  it("takes a repetition when losing", () => {
    const board = place("classic", [[4, 7, "black", "king"], [0, 7, "black", "queen"], [4, 0, "white", "king"], [3, 5, "white", "pawn"]]);
    const moves = getAllLegalMoves(board, "classic", "white");
    const drawing = moves[0];
    const after = applyMove(board, "classic", drawing);
    const history: GameHistory = { positions: { [positionKey(after, "classic", "black")]: 2 }, quietPlies: 4 };
    expect(findBestMove(board, "classic", "white", { ...FIXED_DEPTH, history })).toEqual(drawing);
  });
});

describe("time and levels", () => {
  it("answers in time from a busy position, and always with a legal move", () => {
    for (const mode of ["classic", "mobius"] as GameMode[]) {
      const board = createInitialBoard(mode);
      const start = performance.now();
      const move = findBestMove(board, mode, "white", { maxDepth: 20, timeMs: 100 });
      expect(performance.now() - start).toBeLessThan(400);
      expect(getAllLegalMoves(board, mode, "white")).toContainEqual(move);
    }
  });

  it("returns nothing when there is no move", () => {
    const mate = place("classic", [[6, 2, "white", "king"], [7, 1, "white", "queen"], [7, 0, "black", "king"]]);
    expect(findBestMove(mate, "classic", "black")).toBeNull();
  });

  it("makes the easy level legal, and varied", () => {
    const board = createInitialBoard("mobius");
    const seen = new Set<string>();
    for (let game = 0; game < 30; game += 1) {
      const move: Move = findBestMove(board, "mobius", "white", { level: "easy" })!;
      expect(getAllLegalMoves(board, "mobius", "white")).toContainEqual(move);
      seen.add(JSON.stringify(move));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("keeps the hard level repeatable", () => {
    const board = createInitialBoard("classic");
    const first = findBestMove(board, "classic", "white", { maxDepth: 3, timeMs: 60_000 });
    const second = findBestMove(board, "classic", "white", { maxDepth: 3, timeMs: 60_000 });
    expect(first).toEqual(second);
  });
});
