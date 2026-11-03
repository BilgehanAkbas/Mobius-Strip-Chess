import type { BoardState, GameHistory, GameMode, Move, PieceColor } from "../types";
import { type BotLevel, findBestMove } from "./bot";
import type { BotRequest } from "./bot.worker";

/** Runs the bot on its own thread so the scene keeps animating while it thinks. */
export function requestBotMove(board: BoardState, mode: GameMode, color: PieceColor, level: BotLevel, history: GameHistory) {
  let worker: Worker | null = null;
  const promise = new Promise<Move | null>((resolve) => {
    const runOnMainThread = () => {
      worker?.terminate();
      resolve(findBestMove(board, mode, color, { level, history }));
    };
    try {
      worker = new Worker(new URL("./bot.worker.ts", import.meta.url), { type: "module" });
    } catch {
      runOnMainThread();
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<Move | null>) => {
      worker?.terminate();
      resolve(data);
    };
    worker.onerror = runOnMainThread;
    const request: BotRequest = { board, mode, color, level, history };
    worker.postMessage(request);
  });
  return { promise, cancel: () => worker?.terminate() };
}
