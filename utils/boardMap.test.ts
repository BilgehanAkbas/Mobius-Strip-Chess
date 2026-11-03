import { describe, expect, it } from "vitest";
import type { PieceColor, PieceData } from "../types";
import { createInitialBoard } from "./board";
import { capturedOfColor, mapColumnOrder } from "./boardMap";

describe.each(["white", "black"] as PieceColor[])("%s map", (color) => {
  const order = mapColumnOrder(color);

  it("shows every column exactly once", () => {
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });

  it("keeps columns next to each other like the real loop", () => {
    for (let index = 0; index < order.length; index += 1) {
      expect(order[(index + 1) % order.length]).toBe((order[index] + 1) % 16);
    }
  });

  it("puts the player's own army together, in from the left edge", () => {
    const board = createInitialBoard("mobius");
    const positions = order.flatMap((x, index) => (board[0][x]?.color === color ? [index] : []));
    expect(positions).toEqual([4, 5, 6, 7]);
  });
});

describe("capturedOfColor", () => {
  const captured: PieceData[] = [
    { type: "pawn", color: "black" },
    { type: "queen", color: "black" },
    { type: "rook", color: "white" },
    { type: "knight", color: "black" },
  ];

  it("keeps only that color, most valuable first", () => {
    expect(capturedOfColor(captured, "black")).toEqual(["queen", "knight", "pawn"]);
    expect(capturedOfColor(captured, "white")).toEqual(["rook"]);
  });
});
