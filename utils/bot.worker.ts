import type { BoardState, GameHistory, GameMode, PieceColor } from "../types";
import { type BotLevel, findBestMove } from "./bot";

export interface BotRequest {
  board: BoardState;
  mode: GameMode;
  color: PieceColor;
  level: BotLevel;
  history: GameHistory;
}

self.onmessage = ({ data }: MessageEvent<BotRequest>) => {
  self.postMessage(findBestMove(data.board, data.mode, data.color, { level: data.level, history: data.history }));
};
