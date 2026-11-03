import type { EndReason, GameMode, GameResult, Move, Opponent, PieceColor } from "../types";
import type { BotLevel } from "./bot";
import { replayGame } from "./gameState";

const STORAGE_KEY = "mobius-chess-game";
const SOUND_KEY = "mobius-chess-sound";
const VERSION = 2;

/** Only the moves are kept. Everything else is rebuilt from them, so a save cannot hold an impossible game. */
export interface SavedGame {
  mode: GameMode;
  playerColor: PieceColor;
  opponent: Opponent;
  botLevel: BotLevel;
  moves: Move[];
  /** An ending the moves cannot show, such as a resignation. */
  result: GameResult;
  endReason: EndReason | null;
  online: { gameId: string; roomCode: string } | null;
}

type GameStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): GameStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValid(game: Partial<SavedGame>): game is SavedGame {
  if (game.mode !== "classic" && game.mode !== "mobius") return false;
  if (game.playerColor !== "white" && game.playerColor !== "black") return false;
  if (game.opponent !== "bot" && game.opponent !== "human" && game.opponent !== "online") return false;
  if (game.botLevel !== "easy" && game.botLevel !== "hard") return false;
  if (game.opponent === "online" && !game.online?.gameId) return false;
  return Array.isArray(game.moves) && Boolean(replayGame(game.mode, game.moves));
}

/** Anything unreadable counts as no saved game. Storage can be missing or full on a phone. */
export function loadGame(storage = defaultStorage()): SavedGame | null {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (!stored) return null;
    const { version, game } = JSON.parse(stored);
    return version === VERSION && isValid(game) ? game : null;
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame, storage = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, game }));
  } catch {
    // The game simply will not survive a reload.
  }
}

export function clearSavedGame(storage = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function loadSoundSetting(storage = defaultStorage()): boolean {
  try {
    return storage?.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundSetting(on: boolean, storage = defaultStorage()): void {
  try {
    storage?.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // The setting simply resets next time.
  }
}
