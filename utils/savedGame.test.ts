import { describe, expect, it } from "vitest";
import { applyMove, createInitialBoard, getAllLegalMoves, startHistory } from "./board";
import { clearSavedGame, loadGame, type SavedGame, saveGame } from "./savedGame";

function fakeStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

function game(): SavedGame {
  const board = createInitialBoard("mobius");
  return {
    mode: "mobius",
    playerColor: "black",
    opponent: "bot",
    botLevel: "easy",
    board,
    turn: "white",
    history: startHistory(board, "mobius"),
    captured: [],
    result: null,
    status: "Sıra sende.",
  };
}

describe("saved games", () => {
  it("comes back exactly as it was, mid-game", () => {
    const storage = fakeStorage();
    const start = game();
    const move = getAllLegalMoves(start.board, "mobius", "white")[0];
    const saved = { ...start, board: applyMove(start.board, "mobius", move), turn: "black" as const, captured: [{ type: "pawn" as const, color: "black" as const }] };
    saveGame(saved, storage);
    expect(loadGame(storage)).toEqual(saved);
  });

  it("is gone once cleared", () => {
    const storage = fakeStorage();
    saveGame(game(), storage);
    clearSavedGame(storage);
    expect(loadGame(storage)).toBeNull();
  });

  it.each([
    ["broken text", "{not json"],
    ["an old version", JSON.stringify({ version: 0, game: game() })],
    ["no game inside", JSON.stringify({ version: 1 })],
    ["a board of the wrong size", JSON.stringify({ version: 1, game: { ...game(), board: createInitialBoard("classic") } })],
    ["a board with no kings", JSON.stringify({ version: 1, game: { ...game(), board: createInitialBoard("mobius").map((row) => row.map(() => null)) } })],
    ["an unknown mode", JSON.stringify({ version: 1, game: { ...game(), mode: "chess960" } })],
    ["a missing history", JSON.stringify({ version: 1, game: { ...game(), history: null } })],
  ])("ignores %s", (_name, stored) => {
    expect(loadGame(fakeStorage(stored))).toBeNull();
  });

  it("survives storage that refuses to work", () => {
    const refusing = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(loadGame(refusing)).toBeNull();
    expect(() => saveGame(game(), refusing)).not.toThrow();
    expect(() => clearSavedGame(refusing)).not.toThrow();
  });
});
