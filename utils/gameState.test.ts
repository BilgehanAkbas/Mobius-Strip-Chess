import { describe, expect, it } from "vitest";
import type { Move } from "../types";
import { isLegalMove, newGame, reconcileMoves, replayGame, resignGame, stepGame, undoCount } from "./gameState";

const move = (fromX: number, fromY: number, toX: number, toY: number, promotion?: Move["promotion"]): Move => ({
  from: { x: fromX, y: fromY },
  to: { x: toX, y: toY },
  ...(promotion ? { promotion } : {}),
});

const FOOLS_MATE = [move(5, 6, 5, 5), move(4, 1, 4, 3), move(6, 6, 6, 4), move(3, 0, 7, 4)];

describe("stepping and replaying", () => {
  it("rebuilds the same game from its moves, ending included", () => {
    let stepped = newGame("classic");
    for (const next of FOOLS_MATE) stepped = stepGame(stepped, "classic", next);
    expect(replayGame("classic", FOOLS_MATE)).toEqual(stepped);
    expect(stepped).toMatchObject({ result: "black-wins", endReason: "checkmate", turn: "white" });
  });

  it("refuses an illegal move, a move out of turn, and any move after the end", () => {
    expect(replayGame("classic", [move(0, 7, 0, 3)])).toBeNull();
    expect(replayGame("classic", [move(4, 1, 4, 3)])).toBeNull();
    expect(replayGame("classic", [...FOOLS_MATE, move(0, 6, 0, 5)])).toBeNull();
  });

  it("requires the promotion piece to match", () => {
    const game = newGame("classic");
    expect(isLegalMove(game, "classic", move(4, 6, 4, 4))).toBe(true);
    expect(isLegalMove(game, "classic", move(4, 6, 4, 4, "queen"))).toBe(false);
  });

  it("works on the Möbius loop, and keeps captured pieces", () => {
    const game = replayGame("mobius", [move(3, 1, 5, 1), move(8, 0, 6, 0), move(5, 1, 6, 0)]);
    expect(game?.captured).toEqual([expect.objectContaining({ type: "pawn", color: "black" })]);
    expect(game?.board[0][6]).toMatchObject({ color: "white", type: "pawn" });
  });
});

describe("move labels", () => {
  it("names classic squares, captures and mate", () => {
    const game = replayGame("classic", FOOLS_MATE)!;
    expect(game.log[0].label).toContain("f2–f3");
    expect(game.log[3].label).toContain("d8–h4#");
    expect(game.log.map(({ color }) => color)).toEqual(["white", "black", "white", "black"]);
  });

  it("marks castling and en passant", () => {
    const castled = replayGame("classic", [move(6, 7, 5, 5), move(0, 1, 0, 2), move(6, 6, 6, 5), move(0, 2, 0, 3), move(5, 7, 6, 6), move(0, 3, 0, 4), move(4, 7, 6, 7)])!;
    expect(castled.log[castled.log.length - 1].label).toBe("O-O");
    const passant = replayGame("classic", [move(4, 6, 4, 4), move(0, 1, 0, 2), move(4, 4, 4, 3), move(3, 1, 3, 3), move(4, 3, 3, 2)])!;
    expect(passant.log[passant.log.length - 1].label).toContain("e5×d6");
  });

  it("names Möbius squares by column and row", () => {
    expect(replayGame("mobius", [move(3, 1, 5, 1)])!.log[0].label).toContain("3.1–5.1");
  });
});

describe("reconciling with the server", () => {
  const local = (count: number) => replayGame("classic", FOOLS_MATE.slice(0, count))!;

  it("does nothing when both sides agree", () => {
    expect(reconcileMoves(local(2), "classic", FOOLS_MATE.slice(0, 2))).toEqual({ kind: "same" });
  });

  it("plays the opponent's new move", () => {
    expect(reconcileMoves(local(1), "classic", FOOLS_MATE.slice(0, 2))).toEqual({ kind: "append", move: FOOLS_MATE[1] });
  });

  it("leaves a move on its way alone, until it is known to have failed", () => {
    expect(reconcileMoves(local(2), "classic", FOOLS_MATE.slice(0, 1))).toEqual({ kind: "same" });
    const rolledBack = reconcileMoves(local(2), "classic", FOOLS_MATE.slice(0, 1), true);
    expect(rolledBack.kind).toBe("replace");
    expect(rolledBack.kind === "replace" && rolledBack.game.log).toHaveLength(1);
  });

  it("catches up after several missed moves", () => {
    const caught = reconcileMoves(local(0), "classic", FOOLS_MATE.slice(0, 3));
    expect(caught.kind === "replace" && caught.game.log).toHaveLength(3);
  });

  it("takes the server's word when the histories differ", () => {
    const other = reconcileMoves(replayGame("classic", [move(0, 6, 0, 5)])!, "classic", FOOLS_MATE.slice(0, 1));
    expect(other.kind === "replace" && other.game.log[0].move).toEqual(FOOLS_MATE[0]);
  });

  it("refuses an illegal move from the opponent, alone or among others", () => {
    expect(reconcileMoves(local(1), "classic", [FOOLS_MATE[0], move(0, 0, 7, 7)])).toEqual({ kind: "invalid" });
    expect(reconcileMoves(local(0), "classic", [FOOLS_MATE[0], move(0, 0, 7, 7), FOOLS_MATE[2]])).toEqual({ kind: "invalid" });
  });
});

describe("ending and undoing", () => {
  it("gives the win to the other side on resignation", () => {
    expect(resignGame(newGame("mobius"), "white")).toMatchObject({ result: "black-wins", endReason: "resignation" });
  });

  it("takes back to the player's own turn", () => {
    const after = (count: number) => replayGame("classic", FOOLS_MATE.slice(0, count))!.log;
    expect(undoCount(after(0), "white")).toBe(0);
    expect(undoCount(after(1), "white")).toBe(1);
    expect(undoCount(after(2), "white")).toBe(2);
    expect(undoCount(after(1), "black")).toBe(0);
    expect(undoCount(after(2), "black")).toBe(1);
    expect(undoCount(after(3), "black")).toBe(2);
  });
});
