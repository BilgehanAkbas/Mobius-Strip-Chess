import { describe, expect, it } from "vitest";
import type { Move } from "../types";
import { clearSavedGame, loadGame, loadSoundSetting, type SavedGame, saveGame, saveSoundSetting } from "./savedGame";

function fakeStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("mobius-chess-game", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => {
      values.set(key, next);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

const PAWN: Move = { from: { x: 3, y: 1 }, to: { x: 5, y: 1 } };

function game(): SavedGame {
  return {
    mode: "mobius",
    playerColor: "black",
    opponent: "bot",
    botLevel: "easy",
    moves: [PAWN],
    result: null,
    endReason: null,
    online: null,
  };
}

const stored = (body: unknown) => JSON.stringify({ version: 2, game: body });

describe("saved games", () => {
  it("comes back exactly as it was", () => {
    const storage = fakeStorage();
    saveGame(game(), storage);
    expect(loadGame(storage)).toEqual(game());
  });

  it("keeps an online game's room and a resignation", () => {
    const storage = fakeStorage();
    const online: SavedGame = { ...game(), opponent: "online", online: { gameId: "id-1", roomCode: "ABC234" }, result: "white-wins", endReason: "resignation" };
    saveGame(online, storage);
    expect(loadGame(storage)).toEqual(online);
  });

  it("is gone once cleared", () => {
    const storage = fakeStorage();
    saveGame(game(), storage);
    clearSavedGame(storage);
    expect(loadGame(storage)).toBeNull();
  });

  it.each([
    ["broken text", "{not json"],
    ["an older version", JSON.stringify({ version: 1, game: game() })],
    ["no game inside", JSON.stringify({ version: 2 })],
    ["an illegal move", stored({ ...game(), moves: [{ from: { x: 0, y: 0 }, to: { x: 15, y: 3 } }] })],
    ["moves that are not a list", stored({ ...game(), moves: null })],
    ["an unknown mode", stored({ ...game(), mode: "chess960" })],
    ["an online game with no room", stored({ ...game(), opponent: "online", online: null })],
  ])("ignores %s", (_name, text) => {
    expect(loadGame(fakeStorage(text))).toBeNull();
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
    expect(loadSoundSetting(refusing)).toBe(true);
    expect(() => saveSoundSetting(false, refusing)).not.toThrow();
  });
});

describe("sound setting", () => {
  it("is on until turned off, and remembered", () => {
    const storage = fakeStorage();
    expect(loadSoundSetting(storage)).toBe(true);
    saveSoundSetting(false, storage);
    expect(loadSoundSetting(storage)).toBe(false);
    saveSoundSetting(true, storage);
    expect(loadSoundSetting(storage)).toBe(true);
  });
});
