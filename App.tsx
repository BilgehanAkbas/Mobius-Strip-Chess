import { useEffect, useMemo, useRef, useState } from "react";
import { BoardMap } from "./components/BoardMap";
import { GameScene } from "./components/GameScene";
import { ModePreview } from "./components/ModePreview";
import type { AnimatedMove, BoardState, DrawReason, GameHistory, GameMode, GameResult, Move, Opponent, PieceColor, PieceData, PieceType, Position } from "./types";
import {
  applyMove,
  createInitialBoard,
  describeMove,
  finalResult,
  findKing,
  getValidMoves,
  isKingInCheck,
  isPromotionMove,
  recordMove,
  samePosition,
  startHistory,
} from "./utils/board";
import { capturedOfColor, PIECE_GLYPHS, PIECE_NAMES } from "./utils/boardMap";
import type { BotLevel } from "./utils/bot";
import { requestBotMove } from "./utils/botClient";
import { canUseWebGL } from "./utils/device";
import { moveSettleTime } from "./utils/pieceMotion";
import { clearSavedGame, loadGame, saveGame } from "./utils/savedGame";
import "./app.css";

const BOT_REPLY_PAUSE_MS = 150;
const CONFIRM_MS = 3000;
const PROMOTION_PIECES: PieceType[] = ["queen", "rook", "bishop", "knight"];

const drawMessages: Record<DrawReason, string> = {
  stalemate: "Pat — oyun berabere.",
  insufficient: "Mat edecek taş kalmadı — oyun berabere.",
  repetition: "Aynı konum üç kez oluştu — oyun berabere.",
  "fifty-moves": "50 hamledir taş alınmadı ve piyon oynanmadı — oyun berabere.",
};

type Screen = "start" | "color" | "game";

const modeLabels: Record<GameMode, string> = {
  classic: "Klasik Satranç",
  mobius: "Möbius Satranç",
};

const colorLabels: Record<PieceColor, string> = {
  white: "Beyaz",
  black: "Siyah",
};

function otherColor(color: PieceColor): PieceColor {
  return color === "white" ? "black" : "white";
}

function resultMessage(result: GameResult, drawReason: DrawReason | null): string {
  if (drawReason) return drawMessages[drawReason];
  if (result === "white-wins") return "Şah mat — beyaz kazandı.";
  if (result === "black-wins") return "Şah mat — siyah kazandı.";
  return "Oyun devam ediyor.";
}

function CapturedRow({ label, color, captured }: { label: string; color: PieceColor; captured: PieceData[] }) {
  const pieces = capturedOfColor(captured, color);
  return (
    <div className="captured-row">
      <span>{label}</span>
      <strong aria-label={pieces.length ? `${pieces.length} taş` : "Taş yok"}>
        {pieces.length ? pieces.map((type, index) => (
          <i className={`map-piece is-${color}`} key={index}>{PIECE_GLYPHS[type]}</i>
        )) : "—"}
      </strong>
    </div>
  );
}

/** Throws a game away only on a second tap, so a slip of the finger on a phone costs nothing. */
function ConfirmButton({ label, ask, onConfirm }: { label: string; ask: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [asking]);

  return (
    <button
      className={`secondary-button ${asking ? "is-asking" : ""}`}
      type="button"
      onClick={() => {
        if (ask && !asking) {
          setAsking(true);
          return;
        }
        setAsking(false);
        onConfirm();
      }}
    >
      {asking ? "Oyun silinsin mi?" : label}
    </button>
  );
}

function App() {
  // A phone can reload the page whenever the browser goes to the background, so a game in progress comes back.
  const [restored] = useState(loadGame);
  const [screen, setScreen] = useState<Screen>(restored ? "game" : "start");
  const [gameMode, setGameMode] = useState<GameMode | null>(restored?.mode ?? null);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(restored?.playerColor ?? null);
  const [opponent, setOpponent] = useState<Opponent>(restored?.opponent ?? "bot");
  const [board, setBoard] = useState<BoardState | null>(restored?.board ?? null);
  const [turn, setTurn] = useState<PieceColor>(restored?.turn ?? "white");
  const [selected, setSelected] = useState<Position | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<GameResult>(restored?.result ?? null);
  const [status, setStatus] = useState(restored?.status ?? "Oyun modunu seç.");
  const [lastMove, setLastMove] = useState<AnimatedMove | null>(null);
  const [captured, setCaptured] = useState<PieceData[]>(restored?.captured ?? []);
  const [followCamera, setFollowCamera] = useState(true);
  const [gameId, setGameId] = useState(0);
  const [history, setHistory] = useState<GameHistory | null>(restored?.history ?? null);
  const [pendingPromotion, setPendingPromotion] = useState<Move | null>(null);
  const [botLevel, setBotLevel] = useState<BotLevel>(restored?.botLevel ?? "hard");
  const [webGLSupported] = useState(canUseWebGL);
  const [showRules, setShowRules] = useState(false);
  const moveCount = useRef(0);

  const twoPlayers = opponent === "human";

  const validMoves = useMemo(
    () => (board && gameMode && selected ? getValidMoves(board, gameMode, selected) : []),
    [board, gameMode, selected],
  );

  const checkedKing = useMemo(
    () => (board && gameMode && isKingInCheck(board, gameMode, turn) ? findKing(board, turn) : null),
    [board, gameMode, turn],
  );

  const selectMode = (mode: GameMode) => {
    setGameMode(mode);
    setScreen("color");
  };

  const playMove = (current: BoardState, mode: GameMode, move: Move): BoardState => {
    moveCount.current += 1;
    const description = describeMove(current, mode, move);
    const taken = description.captured;
    setLastMove({ ...description, id: moveCount.current, color: current[move.from.y][move.from.x]!.color });
    if (taken) setCaptured((previous) => [...previous, taken.piece]);
    return applyMove(current, mode, move);
  };

  /** Plays the move and updates the game. Returns what the status line needs to know. */
  const commitMove = (current: BoardState, mode: GameMode, currentHistory: GameHistory, move: Move, side: PieceColor) => {
    const nextBoard = playMove(current, mode, move);
    const nextTurn = otherColor(side);
    const nextHistory = recordMove(currentHistory, current, nextBoard, mode, move, nextTurn);
    const { result: nextResult, drawReason } = finalResult(nextBoard, mode, nextTurn, nextHistory);
    setBoard(nextBoard);
    setHistory(nextHistory);
    setSelected(null);
    setTurn(nextTurn);
    setResult(nextResult);
    return {
      finished: nextResult ? resultMessage(nextResult, drawReason) : null,
      inCheck: isKingInCheck(nextBoard, mode, nextTurn),
    };
  };

  const startGame = (color: PieceColor, nextOpponent: Opponent) => {
    if (!gameMode) return;
    const initial = createInitialBoard(gameMode);
    setPlayerColor(color);
    setOpponent(nextOpponent);
    setLastMove(null);
    setCaptured([]);
    setBoard(initial);
    setHistory(startHistory(initial, gameMode));
    setPendingPromotion(null);
    setTurn("white");
    setSelected(null);
    setThinking(false);
    setResult(null);
    setStatus(nextOpponent === "human"
      ? "Beyaz başlıyor. Bir taş seç."
      : color === "white" ? "Sıra sende. Bir taş seç." : "Bot beyazlarla oyuna başlıyor.");
    setGameId((id) => id + 1);
    setScreen("game");
  };

  const returnToMenu = () => {
    clearSavedGame();
    setScreen("start");
    setGameMode(null);
    setPlayerColor(null);
    setBoard(null);
    setHistory(null);
    setPendingPromotion(null);
    setLastMove(null);
    setCaptured([]);
    setSelected(null);
    setResult(null);
    setThinking(false);
    setStatus("Oyun modunu seç.");
  };

  const playPlayerMove = (move: Move) => {
    if (!board || !gameMode || !history) return;
    const { finished, inCheck } = commitMove(board, gameMode, history, move, turn);
    if (finished) setStatus(finished);
    else if (!twoPlayers) setStatus("Bot düşünüyor…");
    else setStatus(inCheck ? "Şah! Hamleni dikkatle seç." : "Bir taş seç.");
  };

  const onSquareClick = (position: Position) => {
    if (!board || !gameMode || !playerColor || thinking || result || pendingPromotion) return;
    const activeColor = twoPlayers ? turn : playerColor;
    if (turn !== activeColor) return;

    if (samePosition(selected, position)) {
      setSelected(null);
      setStatus("Bir taş seç.");
      return;
    }

    const clickedPiece = board[position.y][position.x];
    const isLegalTarget = selected && validMoves.some((move) => samePosition(move, position));

    if (selected && isLegalTarget) {
      const move = { from: selected, to: position };
      if (isPromotionMove(board, gameMode, move)) setPendingPromotion(move);
      else playPlayerMove(move);
      return;
    }

    if (clickedPiece?.color === activeColor) {
      setSelected(position);
      const moves = getValidMoves(board, gameMode, position);
      setStatus(moves.length ? "Yeşil işaretler geçerli hamleleri, kırmızı halkalar taş alma hamlelerini gösterir." : "Bu taşın geçerli hamlesi yok.");
      return;
    }

    setSelected(null);
    setStatus("Önce kendi taşlarından birini seç.");
  };

  useEffect(() => {
    if (screen !== "game" || !board || !gameMode || !playerColor || !history) return;
    saveGame({ mode: gameMode, playerColor, opponent, botLevel, board, turn, history, captured, result, status });
  }, [board, botLevel, captured, gameMode, history, opponent, playerColor, result, screen, status, turn]);

  useEffect(() => {
    if (!board || !gameMode || !playerColor || !history || result || twoPlayers) return;
    const botColor = otherColor(playerColor);
    if (turn !== botColor) return;

    setThinking(true);
    // The reply waits for the player's piece to land, however fast the bot answers.
    const replyAt = performance.now() + (lastMove ? moveSettleTime(lastMove) * 1000 : 0) + BOT_REPLY_PAUSE_MS;
    const request = requestBotMove(board, gameMode, botColor, botLevel, history);
    let cancelled = false;
    let timer: number | undefined;

    request.promise.then((move) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (!move) {
          const { result: nextResult, drawReason } = finalResult(board, gameMode, botColor, history);
          setResult(nextResult);
          setStatus(resultMessage(nextResult, drawReason));
          setThinking(false);
          return;
        }

        const { finished, inCheck } = commitMove(board, gameMode, history, move, botColor);
        setStatus(finished ?? (inCheck ? "Şah altındasın. Hamleni dikkatle seç." : "Sıra sende."));
        setThinking(false);
      }, Math.max(0, replyAt - performance.now()));
    });

    return () => {
      cancelled = true;
      request.cancel();
      window.clearTimeout(timer);
    };
  }, [board, botLevel, gameMode, history, lastMove, playerColor, result, turn, twoPlayers]);

  if (screen === "game" && gameMode && playerColor && board) {
    const gameInProgress = !result && Object.values(history?.positions ?? {}).reduce((total, count) => total + count, 0) > 1;
    const title = result
      ? "Oyun tamamlandı"
      : twoPlayers
        ? turn === "white" ? "Sıra beyazda" : "Sıra siyahta"
        : thinking ? "Bot düşünüyor" : "Senin sıran";

    return (
      <main className="app-shell game-shell">
        <section className="game-view">
          <aside className="game-hud">
            <div className="hud-topline">
              <span className={`status-dot ${thinking ? "is-thinking" : ""}`} />
              <p className="hud-kicker">{modeLabels[gameMode]}</p>
            </div>
            <h2>{title}</h2>
            <p className="hud-status">{status}</p>
            <div className="game-meta">
              {twoPlayers
                ? <div><span>Oyun</span><strong>İki kişilik</strong></div>
                : <div><span>Sen · Bot {botLevel === "hard" ? "zor" : "kolay"}</span><strong>{colorLabels[playerColor]}</strong></div>}
              <div><span>Sıra</span><strong>{colorLabels[turn]}</strong></div>
            </div>
            <div className="captured-list">
              <CapturedRow label="Alınan siyah" color="black" captured={captured} />
              <CapturedRow label="Alınan beyaz" color="white" captured={captured} />
            </div>
            {gameMode === "mobius" && (
              <p className="topology-note">Şerit iki turda kapanır: halka boyunca ilerleyen taş bükümden geçerek karşı yüze ulaşır.</p>
            )}
            <div className="hud-actions">
              <ConfirmButton label="Yeniden başlat" ask={gameInProgress} onConfirm={() => startGame(playerColor, opponent)} />
              <ConfirmButton label="Ana menü" ask={gameInProgress} onConfirm={returnToMenu} />
              {gameMode === "mobius" && (
                <>
                  <button className="secondary-button" type="button" aria-pressed={followCamera} onClick={() => setFollowCamera(!followCamera)}>
                    Takip: {followCamera ? "açık" : "kapalı"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setShowRules(true)}>Kurallar</button>
                </>
              )}
            </div>
          </aside>

          <div className="game-stage">
            {webGLSupported ? (
              <GameScene
                key={gameId}
                mode={gameMode}
                board={board}
                selected={selected}
                validMoves={validMoves}
                lastMove={lastMove}
                checkedKing={checkedKing}
                playerColor={playerColor}
                turn={turn}
                twoPlayers={twoPlayers}
                followCamera={followCamera}
                onSquareClick={onSquareClick}
              />
            ) : (
              <p className="no-webgl">
                Bu cihaz ya da tarayıcı 3B görüntülemeyi desteklemiyor.
                {gameMode === "mobius" ? " Oyunu alttaki haritadan oynayabilirsin." : " Klasik mod için başka bir tarayıcı dene."}
              </p>
            )}
            <div className="camera-help">
              <span className="help-mouse">Sürükle: döndür · Tekerlek: yakınlaştır</span>
              <span className="help-touch">Parmakla döndür · İki parmakla yakınlaştır</span>
            </div>
            {showRules && (
              <div className="rules-dialog" role="dialog" aria-label="Möbius kuralları">
                <strong>Möbius Satranç nasıl oynanır?</strong>
                <ul>
                  <li><b>Tahta:</b> 4 satır, 16 sütun. Sütunlar halka gibi döner, satırların ucunda ise şerit biter.</li>
                  <li><b>İki yüz:</b> Şerit iki turda kapanır. Halka boyunca giden taş bükümden geçip karşı yüze ulaşır.</li>
                  <li><b>Diziliş:</b> Her ordunun iki yanında piyonlar, ortasında diğer taşlar vardır. Rakip iki yönden de gelebilir.</li>
                  <li><b>Piyonlar:</b> Bulundukları yanda dışa doğru ilerler ve 6 kare sonra terfi eder. İlk hamlede 2 kare gidebilir, geçerken alma geçerlidir.</li>
                  <li><b>Diğer taşlar:</b> Klasik satrançtaki gibi oynar; kale ve vezir halkanın iki yönünden de gidebilir. Rok yoktur.</li>
                  <li><b>Oyun sonu:</b> Köşe olmadığı için şah kaçabilir. Şah ve tek kale çoğu zaman mat edemez, şah ve vezir her zaman eder.</li>
                  <li><b>Harita:</b> Alttaki düz harita tüm tahtayı gösterir. Görünmeyen karelerde de oradan oynayabilirsin.</li>
                </ul>
                <button className="secondary-button" type="button" autoFocus onClick={() => setShowRules(false)}>Tamam</button>
              </div>
            )}
            {pendingPromotion && (
              <div className="promotion-dialog" role="dialog" aria-label="Terfi seçimi">
                <strong>Piyon ne olsun?</strong>
                <div className="promotion-choices">
                  {PROMOTION_PIECES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      autoFocus={type === "queen"}
                      onClick={() => {
                        setPendingPromotion(null);
                        playPlayerMove({ ...pendingPromotion, promotion: type });
                      }}
                    >
                      <span className={`map-piece is-${turn}`}>{PIECE_GLYPHS[type]}</span>
                      <small>{PIECE_NAMES[type]}</small>
                    </button>
                  ))}
                </div>
                <button className="secondary-button" type="button" onClick={() => setPendingPromotion(null)}>Vazgeç</button>
              </div>
            )}
            {gameMode === "mobius" && (
              <BoardMap
                board={board}
                viewColor={playerColor}
                selected={selected}
                validMoves={validMoves}
                lastMove={lastMove}
                checkedKing={checkedKing}
                onSquareClick={onSquareClick}
              />
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="menu-card">
        <div className="brand">
          <span className="brand-kicker">TOPOLOGICAL CHESS EXPERIENCE</span>
          <h1>Möbius Chess</h1>
          <p>Klasik satrancı oyna ya da tahtanın sınırlarını tek yüzeyli bir Möbius şeridinde bük.</p>
        </div>

        {screen === "start" && (
          <div className="menu-content">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">OYUN MODU</span>
                <h2>Nasıl oynamak istersin?</h2>
              </div>
            </div>

            <div className="choice-grid">
              <button className="choice-button" type="button" onClick={() => selectMode("classic")}>
                <ModePreview mode="classic" />
                <span className="choice-copy">
                  <span className="choice-number">01</span>
                  <strong>Klasik Satranç</strong>
                  <small>8 × 8 standart tahta, klasik kurallar.</small>
                </span>
                <span className="choice-arrow">↗</span>
              </button>

              <button className="choice-button" type="button" onClick={() => selectMode("mobius")}>
                <ModePreview mode="mobius" />
                <span className="choice-copy">
                  <span className="choice-number">02</span>
                  <strong>Möbius Satranç</strong>
                  <small>4 × 16 kare, iki yüz ve piyonlarla çevrili ordular.</small>
                </span>
                <span className="choice-arrow">↗</span>
              </button>
            </div>
          </div>
        )}

        {screen === "color" && gameMode && (
          <div className="menu-content color-step">
            <button className="back-button" type="button" onClick={() => setScreen("start")}>← Mod seçimine dön</button>
            <span className="section-eyebrow">{modeLabels[gameMode].toUpperCase()}</span>
            <h2>Nasıl oynayacaksın?</h2>
            <p className="selection-info">Beyaz ilk hamleyi yapar. Siyahı seçersen bot oyuna başlar.</p>

            <div className="level-picker" role="group" aria-label="Bot zorluğu">
              <span>Bot zorluğu</span>
              <button type="button" aria-pressed={botLevel === "easy"} onClick={() => setBotLevel("easy")}>Kolay</button>
              <button type="button" aria-pressed={botLevel === "hard"} onClick={() => setBotLevel("hard")}>Zor</button>
            </div>

            <div className="color-grid">
              <button className="color-button white-piece" type="button" onClick={() => startGame("white", "bot")}>
                <span className="piece-preview">♔</span>
                <strong>Beyaz</strong>
                <small>Bota karşı, ilk hamle sende</small>
              </button>
              <button className="color-button black-piece" type="button" onClick={() => startGame("black", "bot")}>
                <span className="piece-preview">♚</span>
                <strong>Siyah</strong>
                <small>Bota karşı, bot başlar</small>
              </button>
              <button className="color-button two-players" type="button" onClick={() => startGame("white", "human")}>
                <span className="piece-preview">♔♚</span>
                <strong>İki kişilik</strong>
                <small>Aynı cihazda sırayla</small>
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
