import { useEffect, useMemo, useState } from "react";
import { GameScene } from "./components/GameScene";
import type { BoardState, GameMode, GameResult, PieceColor, Position } from "./types";
import { applyMove, createInitialBoard, findBestMove, getGameResult, getValidMoves, isKingInCheck, samePosition } from "./utils/board";
import "./app.css";

type Screen = "start" | "color" | "game";

const modeLabels: Record<GameMode, string> = {
  classic: "Klasik Satranç",
  mobius: "Möbius Satranç",
};

function otherColor(color: PieceColor): PieceColor {
  return color === "white" ? "black" : "white";
}

function resultMessage(result: GameResult): string {
  if (result === "draw") return "Pat — oyun berabere.";
  return result === "white-wins" ? "Şah mat — beyaz kazandı." : "Şah mat — siyah kazandı.";
}

function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [turn, setTurn] = useState<PieceColor>("white");
  const [selected, setSelected] = useState<Position | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<GameResult>(null);
  const [status, setStatus] = useState("Modunu seç.");

  const validMoves = useMemo(
    () => (board && gameMode && selected ? getValidMoves(board, gameMode, selected) : []),
    [board, gameMode, selected],
  );

  const selectMode = (mode: GameMode) => {
    setGameMode(mode);
    setScreen("color");
  };

  const startGame = (color: PieceColor) => {
    if (!gameMode) return;
    setPlayerColor(color);
    setBoard(createInitialBoard(gameMode));
    setTurn("white");
    setSelected(null);
    setThinking(false);
    setResult(null);
    setStatus(color === "white" ? "Sıra sende. Bir taş seç." : "Bot beyazlarla oyuna başlıyor.");
    setScreen("game");
  };

  const returnToMenu = () => {
    setScreen("start");
    setGameMode(null);
    setPlayerColor(null);
    setBoard(null);
    setSelected(null);
    setResult(null);
    setThinking(false);
    setStatus("Modunu seç.");
  };

  const onSquareClick = (position: Position) => {
    if (!board || !gameMode || !playerColor || thinking || result || turn !== playerColor) return;
    const clickedPiece = board[position.y][position.x];
    const isLegalTarget = selected && validMoves.some((move) => samePosition(move, position));

    if (selected && isLegalTarget) {
      const nextBoard = applyMove(board, gameMode, { from: selected, to: position });
      const nextTurn = otherColor(turn);
      const nextResult = getGameResult(nextBoard, gameMode, nextTurn);
      setBoard(nextBoard);
      setSelected(null);
      setTurn(nextTurn);
      setResult(nextResult);
      setStatus(nextResult ? resultMessage(nextResult) : "Bot düşünüyor…");
      return;
    }

    if (clickedPiece?.color === playerColor) {
      setSelected(position);
      const moves = getValidMoves(board, gameMode, position);
      setStatus(moves.length ? "Yeşil kareler geçerli hamleleri, kırmızılar taş alma hamlelerini gösterir." : "Bu taşın geçerli hamlesi yok.");
      return;
    }

    setSelected(null);
    setStatus("Önce kendi taşlarından birini seç.");
  };

  useEffect(() => {
    if (!board || !gameMode || !playerColor || result) return;
    const botColor = otherColor(playerColor);
    if (turn !== botColor) return;

    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = findBestMove(board, gameMode, botColor, 2);
      if (!move) {
        const nextResult = getGameResult(board, gameMode, botColor);
        setResult(nextResult);
        setStatus(resultMessage(nextResult));
        setThinking(false);
        return;
      }
      const nextBoard = applyMove(board, gameMode, move);
      const nextTurn = otherColor(botColor);
      const nextResult = getGameResult(nextBoard, gameMode, nextTurn);
      setBoard(nextBoard);
      setTurn(nextTurn);
      setResult(nextResult);
      setStatus(nextResult ? resultMessage(nextResult) : (isKingInCheck(nextBoard, gameMode, nextTurn) ? "Şah altındasın. Hamleni dikkatle seç." : "Sıra sende."));
      setThinking(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [board, gameMode, playerColor, result, turn]);

  return (
    <main className="app-shell">
      <section className="menu-card">
        <div className="brand">
          <span className="brand-kicker">3D TOPOLOGICAL CHESS</span>
          <h1>Möbius Chess</h1>
          <p>Satranç tahtasının sınırlarını bük.</p>
        </div>

        {screen === "start" && (
          <div className="menu-content">
            <h2>Oyun modunu seç</h2>
            <div className="choice-grid">
              <button className="choice-button" type="button" onClick={() => selectMode("classic")}>
                <span className="choice-number">01</span>
                <span><strong>Klasik Satranç</strong><small>8 × 8 klasik tahta ve standart yönler</small></span>
              </button>
              <button className="choice-button mobius-choice" type="button" onClick={() => selectMode("mobius")}>
                <span className="choice-number">02</span>
                <span><strong>Möbius Satranç</strong><small>4 × 16, tek yüzeyli bükülen topoloji</small></span>
              </button>
            </div>
          </div>
        )}

        {screen === "color" && gameMode && (
          <div className="menu-content">
            <button className="back-button" type="button" onClick={() => setScreen("start")}>← Mod seçimine dön</button>
            <h2>Taş rengini seç</h2>
            <p className="selection-info">{modeLabels[gameMode]} modu seçildi.</p>
            <div className="color-grid">
              <button className="color-button white-piece" type="button" onClick={() => startGame("white")}>
                <span className="piece-preview">♔</span><strong>Beyaz taşlar</strong><small>İlk hamle senin.</small>
              </button>
              <button className="color-button black-piece" type="button" onClick={() => startGame("black")}>
                <span className="piece-preview">♚</span><strong>Siyah taşlar</strong><small>Bot oyuna başlar.</small>
              </button>
            </div>
          </div>
        )}

        {screen === "game" && gameMode && playerColor && board && (
          <section className="game-view">
            <GameScene mode={gameMode} board={board} selected={selected} validMoves={validMoves} onSquareClick={onSquareClick} />
            <aside className="game-hud">
              <span className={`status-dot ${thinking ? "is-thinking" : ""}`} />
              <p className="hud-kicker">{modeLabels[gameMode].toUpperCase()}</p>
              <h2>{result ? "Oyun tamamlandı" : (thinking ? "Bot düşünüyor" : "Senin sıran")}</h2>
              <dl className="game-meta">
                <div><dt>Sen</dt><dd>{playerColor === "white" ? "Beyaz" : "Siyah"}</dd></div>
                <div><dt>Sıra</dt><dd>{turn === "white" ? "Beyaz" : "Siyah"}</dd></div>
              </dl>
              <p className="hud-status">{status}</p>
              {gameMode === "mobius" && <p className="topology-note">Şeridin uç birleşiminden geçince satır yönü tersine döner.</p>}
              <button className="primary-button" type="button" onClick={returnToMenu}>Ana menüye dön</button>
            </aside>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
