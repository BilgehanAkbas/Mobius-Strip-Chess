import { describe, expect, it } from "vitest";
import type { BoardState, GameHistory, GameMode, Move, PieceColor, PieceData, PieceType } from "../types";
import {
  applyMove,
  createInitialBoard,
  describeMove,
  finalResult,
  getAllLegalMoves,
  getValidMoves,
  isKingInCheck,
  isPromotionMove,
  recordMove,
  startHistory,
} from "./board";
import { findBestMove } from "./bot";

type Placement = [number, number, PieceColor, PieceType, Partial<PieceData>?];

function place(mode: GameMode, placements: Placement[]): BoardState {
  const [rows, columns] = mode === "classic" ? [8, 8] : [4, 16];
  const board: BoardState = Array.from({ length: rows }, () => Array<PieceData | null>(columns).fill(null));
  for (const [x, y, color, type, extra] of placements) board[y][x] = { color, type, hasMoved: true, ...extra };
  return board;
}

function move(fromX: number, fromY: number, toX: number, toY: number): Move {
  return { from: { x: fromX, y: fromY }, to: { x: toX, y: toY } };
}

const CLASSIC_KINGS: Placement[] = [[4, 7, "white", "king"], [4, 0, "black", "king"]];
const MOBIUS_KINGS: Placement[] = [[5, 3, "white", "king"], [13, 3, "black", "king"]];

describe("en passant in classic chess", () => {
  const setup = () => place("classic", [
    ...CLASSIC_KINGS,
    [4, 3, "white", "pawn"],
    [3, 1, "black", "pawn", { hasMoved: false }],
  ]);

  it("is available right after a double step, and removes the passed pawn", () => {
    const after = applyMove(setup(), "classic", move(3, 1, 3, 3));
    expect(getValidMoves(after, "classic", { x: 4, y: 3 })).toContainEqual({ x: 3, y: 2 });
    const taken = applyMove(after, "classic", move(4, 3, 3, 2));
    expect(taken[3][3]).toBeNull();
    expect(taken[2][3]).toMatchObject({ type: "pawn", color: "white" });
  });

  it("is gone after any other move", () => {
    const after = applyMove(setup(), "classic", move(3, 1, 3, 3));
    const waited = applyMove(applyMove(after, "classic", move(4, 7, 4, 6)), "classic", move(4, 0, 4, 1));
    expect(getValidMoves(waited, "classic", { x: 4, y: 3 })).not.toContainEqual({ x: 3, y: 2 });
  });

  it("does not follow a single step", () => {
    const board = place("classic", [...CLASSIC_KINGS, [4, 3, "white", "pawn"], [3, 2, "black", "pawn"]]);
    const after = applyMove(board, "classic", move(3, 2, 3, 3));
    expect(getValidMoves(after, "classic", { x: 4, y: 3 })).not.toContainEqual({ x: 3, y: 2 });
  });

  it("is illegal when removing both pawns would expose the king", () => {
    const board = place("classic", [
      [0, 3, "white", "king"],
      [1, 3, "white", "pawn"],
      [7, 3, "black", "rook"],
      [4, 0, "black", "king"],
      [2, 1, "black", "pawn", { hasMoved: false }],
    ]);
    const after = applyMove(board, "classic", move(2, 1, 2, 3));
    expect(getValidMoves(after, "classic", { x: 1, y: 3 })).not.toContainEqual({ x: 2, y: 2 });
  });

  it("describes the captured pawn on its own square", () => {
    const after = applyMove(setup(), "classic", move(3, 1, 3, 3));
    expect(describeMove(after, "classic", move(4, 3, 3, 2)).captured).toMatchObject({ piece: { type: "pawn", color: "black" }, at: { x: 3, y: 3 } });
  });
});

describe("en passant on the Möbius loop", () => {
  it.each([
    { name: "white moving up the loop", attacker: [6, 1, "white", 1] as const, runner: [8, 0, "black", -1] as const, landing: 6 },
    { name: "black moving down the loop", attacker: [6, 2, "black", -1] as const, runner: [4, 3, "white", 1] as const, landing: 6 },
  ])("works for $name", ({ attacker, runner, landing }) => {
    const [ax, ay, aColor, aDirection] = attacker;
    const [rx, ry, rColor, rDirection] = runner;
    const board = place("mobius", [
      [14, 3, "white", "king"],
      [13, 1, "black", "king"],
      [ax, ay, aColor, "pawn", { direction: aDirection }],
      [rx, ry, rColor, "pawn", { direction: rDirection, hasMoved: false }],
    ]);
    const after = applyMove(board, "mobius", move(rx, ry, landing, ry));
    expect(after[ry][landing]?.doubleStepped).toBe(true);
    const passedX = rx + rDirection;
    expect(getValidMoves(after, "mobius", { x: ax, y: ay })).toContainEqual({ x: passedX, y: ry });
    const taken = applyMove(after, "mobius", move(ax, ay, passedX, ry));
    expect(taken[ry][landing]).toBeNull();
    expect(taken[ry][passedX]).toMatchObject({ type: "pawn", color: aColor });
  });

  it("works across the 15 to 0 seam", () => {
    const board = place("mobius", [
      ...MOBIUS_KINGS,
      [1, 1, "white", "pawn", { direction: -1 }],
      [15, 0, "black", "pawn", { direction: 1, hasMoved: false }],
    ]);
    const after = applyMove(board, "mobius", move(15, 0, 1, 0));
    expect(after[0][1]?.doubleStepped).toBe(true);
    expect(getValidMoves(after, "mobius", { x: 1, y: 1 })).toContainEqual({ x: 0, y: 0 });
    const taken = applyMove(after, "mobius", move(1, 1, 0, 0));
    expect(taken[0][1]).toBeNull();
    expect(taken[0][0]).toMatchObject({ color: "white", direction: -1 });
  });

  it("is not available from behind the double step", () => {
    const board = place("mobius", [
      ...MOBIUS_KINGS,
      [9, 1, "white", "pawn", { direction: -1 }],
      [8, 0, "black", "pawn", { direction: -1, hasMoved: false }],
    ]);
    const after = applyMove(board, "mobius", move(8, 0, 6, 0));
    expect(getValidMoves(after, "mobius", { x: 9, y: 1 }).filter(({ y }) => y === 0)).toEqual([]);
  });
});

describe("promotion", () => {
  const classicPawn = () => place("classic", [[0, 7, "white", "king"], [7, 7, "black", "king"], [3, 1, "white", "pawn"]]);

  it("offers all four pieces as separate moves", () => {
    const promotions = getAllLegalMoves(classicPawn(), "classic", "white").filter(({ from }) => from.x === 3);
    expect(promotions.map(({ promotion }) => promotion)).toEqual(["queen", "rook", "bishop", "knight"]);
  });

  it("gives the chosen piece", () => {
    expect(applyMove(classicPawn(), "classic", { ...move(3, 1, 3, 0), promotion: "knight" })[0][3]?.type).toBe("knight");
    expect(applyMove(classicPawn(), "classic", { ...move(3, 1, 3, 0), promotion: "rook" })[0][3]?.type).toBe("rook");
  });

  it("recognises the promotion square only for pawns", () => {
    expect(isPromotionMove(classicPawn(), "classic", move(3, 1, 3, 0))).toBe(true);
    const rook = place("classic", [...CLASSIC_KINGS, [3, 1, "white", "rook"]]);
    expect(isPromotionMove(rook, "classic", move(3, 1, 3, 0))).toBe(false);
  });

  it("works on the Möbius loop, and the promoted piece keeps its way of facing", () => {
    const board = place("mobius", [...MOBIUS_KINGS, [8, 1, "white", "pawn", { direction: 1 }]]);
    expect(isPromotionMove(board, "mobius", move(8, 1, 9, 1))).toBe(true);
    expect(applyMove(board, "mobius", { ...move(8, 1, 9, 1), promotion: "knight" })[1][9]).toMatchObject({ type: "knight", direction: 1 });
  });

  it("makes the bot choose a queen when that is best", () => {
    const best = findBestMove(classicPawn(), "classic", "white", { maxDepth: 2 });
    expect(best).toMatchObject({ from: { x: 3, y: 1 }, promotion: "queen" });
  });
});

describe("draws", () => {
  const play = (board: BoardState, history: GameHistory, mode: GameMode, moves: Move[], first: PieceColor = "white") => {
    let side = first;
    let current = board;
    let log = history;
    for (const next of moves) {
      const after = applyMove(current, mode, next);
      side = side === "white" ? "black" : "white";
      log = recordMove(log, current, after, mode, next, side);
      current = after;
    }
    return { board: current, history: log, side };
  };

  it("calls threefold repetition on the third occurrence, not the second", () => {
    const start = createInitialBoard("mobius");
    const history = startHistory(start, "mobius");
    const shuffle = [move(2, 1, 4, 0), move(9, 1, 7, 0), move(4, 0, 2, 1), move(7, 0, 9, 1)];
    const once = play(start, history, "mobius", shuffle);
    expect(finalResult(once.board, "mobius", once.side, once.history).result).toBeNull();
    const twice = play(once.board, once.history, "mobius", shuffle);
    expect(finalResult(twice.board, "mobius", twice.side, twice.history)).toEqual({ result: "draw", drawReason: "repetition" });
  });

  it("does not count a position as repeated once castling rights have changed", () => {
    const start = place("classic", [
      [4, 7, "white", "king", { hasMoved: false }],
      [7, 7, "white", "rook", { hasMoved: false }],
      [4, 0, "black", "king"],
      [0, 0, "black", "rook"],
    ]);
    const history = startHistory(start, "classic");
    const back = play(start, history, "classic", [move(7, 7, 6, 7), move(0, 0, 1, 0), move(6, 7, 7, 7), move(1, 0, 0, 0)]);
    const counts = Object.values(back.history.positions);
    expect(counts.every((count) => count === 1)).toBe(true);
  });

  const heavy = (): Placement[] => [...CLASSIC_KINGS, [0, 7, "white", "rook"], [0, 0, "black", "rook"]];

  it("calls the fifty move rule at exactly 100 quiet half-moves", () => {
    const board = place("classic", heavy());
    const quiet = (quietPlies: number): GameHistory => ({ positions: {}, quietPlies });
    expect(finalResult(board, "classic", "white", quiet(99)).result).toBeNull();
    expect(finalResult(board, "classic", "white", quiet(100))).toEqual({ result: "draw", drawReason: "fifty-moves" });
  });

  it("resets the quiet count on a capture and on a pawn move, and counts anything else", () => {
    const board = place("classic", [...heavy(), [3, 6, "white", "pawn", { hasMoved: false }], [1, 7, "black", "knight"]]);
    const history: GameHistory = { positions: {}, quietPlies: 40 };
    expect(recordMove(history, board, applyMove(board, "classic", move(3, 6, 3, 5)), "classic", move(3, 6, 3, 5), "black").quietPlies).toBe(0);
    expect(recordMove(history, board, applyMove(board, "classic", move(0, 7, 1, 7)), "classic", move(0, 7, 1, 7), "black").quietPlies).toBe(0);
    expect(recordMove(history, board, applyMove(board, "classic", move(4, 7, 4, 6)), "classic", move(4, 7, 4, 6), "black").quietPlies).toBe(41);
  });

  it("lets checkmate beat the fifty move rule", () => {
    const mate = place("classic", [[6, 2, "white", "king"], [7, 1, "white", "queen"], [7, 0, "black", "king"]]);
    expect(finalResult(mate, "classic", "black", { positions: {}, quietPlies: 100 })).toEqual({ result: "white-wins", drawReason: null });
  });

  it("recognises stalemate as its own reason", () => {
    const stalemate = place("classic", [[5, 1, "white", "king"], [6, 2, "white", "queen"], [7, 0, "black", "king"]]);
    expect(finalResult(stalemate, "classic", "black", { positions: {}, quietPlies: 0 }).drawReason).toBe("stalemate");
  });

  it.each<[string, Placement[], boolean]>([
    ["king against king", [], true],
    ["a lone knight", [[1, 7, "white", "knight"]], true],
    ["a lone bishop", [[2, 7, "white", "bishop"]], true],
    ["bishops on the same color", [[2, 7, "white", "bishop"], [5, 0, "black", "bishop"]], true],
    ["bishops on opposite colors", [[2, 7, "white", "bishop"], [2, 0, "black", "bishop"]], false],
    ["a knight and a bishop", [[1, 7, "white", "knight"], [2, 7, "white", "bishop"]], false],
    ["two knights", [[1, 7, "white", "knight"], [6, 7, "white", "knight"]], false],
    ["a pawn", [[1, 6, "white", "pawn"]], false],
    ["a rook", [[0, 7, "white", "rook"]], false],
  ])("judges material with %s", (_name, extra, expected) => {
    const result = finalResult(place("classic", [...CLASSIC_KINGS, ...extra]), "classic", "white", { positions: {}, quietPlies: 0 });
    expect(result.drawReason === "insufficient").toBe(expected);
  });
});

describe("a lone minor piece on the Möbius loop", () => {
  it.each(["knight", "bishop"] as PieceType[])("a king and %s can never give mate", (type) => {
    // The loop turns freely, so the lone king's column can be fixed.
    let mates = 0;
    for (let kingY = 0; kingY < 4; kingY += 1) {
      for (let attackerKing = 0; attackerKing < 64; attackerKing += 1) {
        const kx = attackerKing % 16;
        const ky = Math.floor(attackerKing / 16);
        if (Math.abs(ky - kingY) <= 1 && (kx <= 1 || kx === 15)) continue;
        for (let piece = 0; piece < 64; piece += 1) {
          const px = piece % 16;
          const py = Math.floor(piece / 16);
          if ((px === 0 && py === kingY) || (px === kx && py === ky)) continue;
          const board = place("mobius", [[0, kingY, "black", "king"], [kx, ky, "white", "king"], [px, py, "white", type]]);
          // Asks the rules directly, so the insufficient material shortcut cannot hide a mate.
          if (isKingInCheck(board, "mobius", "black") && getAllLegalMoves(board, "mobius", "black").length === 0) mates += 1;
        }
      }
    }
    expect(mates).toBe(0);
  });
});
