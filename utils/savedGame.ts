import type { BoardState, GameHistory, GameMode, GameResult, Opponent, PieceColor, PieceData } from "../types";
import { boardDimensions, findKing } from "./board";
import type { BotLevel } from "./bot";

const STORAGE_KEY = "mobius-chess-game";
const VERSION = 1;

export interface SavedGame {
  mode: GameMode;
  playerColor: PieceColor;
  opponent: Opponent;
  botLevel: BotLevel;
  board: BoardState;
  turn: PieceColor;
  history: GameHistory;
  captured: PieceData[];
  result: GameResult;
  status: string;
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
  if (game.turn !== "white" && game.turn !== "black") return false;
  if (game.opponent !== "bot" && game.opponent !== "human") return false;
  if (game.botLevel !== "easy" && game.botLevel !== "hard") return false;
  if (!game.history || typeof game.history.quietPlies !== "number" || typeof game.history.positions !== "object") return false;
  if (!Array.isArray(game.captured) || typeof game.status !== "string") return false;
  const { columns, rows } = boardDimensions(game.mode);
  if (!Array.isArray(game.board) || game.board.length !== rows) return false;
  if (!game.board.every((row) => Array.isArray(row) && row.length === columns)) return false;
  return Boolean(findKing(game.board, "white") && findKing(game.board, "black"));
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
