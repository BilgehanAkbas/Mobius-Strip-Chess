import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardMap } from "./components/BoardMap";
import { ConfirmButton, EndDialog, endReasonText, MenuDialog, MoveList, PromotionDialog, RulesDialog } from "./components/GameDialogs";
import { GameScene } from "./components/GameScene";
import { ModePreview } from "./components/ModePreview";
import { OnlineLobby } from "./components/OnlineLobby";
import type { AnimatedMove, GameMode, Move, Opponent, PieceColor, PieceData, Position } from "./types";
import {
  describeMove,
  findKing,
  getValidMoves,
  isKingInCheck,
  isPromotionMove,
  samePosition,
} from "./utils/board";
import { capturedOfColor, PIECE_GLYPHS } from "./utils/boardMap";
import type { BotLevel } from "./utils/bot";
import { requestBotMove } from "./utils/botClient";
import { canUseWebGL } from "./utils/device";
import { type GameState, newGame, reconcileMoves, replayGame, resignGame, stepGame, undoCount } from "./utils/gameState";
import { colorOf, getOnlineBackend, normalizeRoomCode, type OnlineGame, onlineErrorMessage } from "./utils/online";
import { moveSettleTime } from "./utils/pieceMotion";
import { clearSavedGame, loadGame, loadSoundSetting, saveGame, saveSoundSetting } from "./utils/savedGame";
import { playSound, unlockSoundOnFirstTouch } from "./utils/sound";
import "./app.css";

const BOT_REPLY_PAUSE_MS = 150;
const ONLINE_POLL_MS = 5000;

type Screen = "start" | "color" | "online" | "game";

interface OnlineSession {
  gameId: string;
  roomCode: string;
}

const modeLabels: Record<GameMode, string> = {
  classic: "Klasik Satranç",
  mobius: "Möbius Satranç",
};

const colorLabels: Record<PieceColor, string> = {
  white: "Beyaz",
  black: "Siyah",
};

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

function roomCodeFromLink(): string {
  return normalizeRoomCode(new URLSearchParams(window.location.search).get("oda") ?? "");
}

function restoreSavedGame() {
  const saved = loadGame();
  const game = saved && replayGame(saved.mode, saved.moves);
  if (!saved || !game) return null;
  return { saved, game: saved.result ? { ...game, result: saved.result, endReason: saved.endReason } : game };
}

function App() {
  // A phone can reload the page whenever the browser goes to the background, so a game in progress comes back.
  const [restored] = useState(restoreSavedGame);
  const [inviteCode] = useState(roomCodeFromLink);
  const [screen, setScreen] = useState<Screen>(inviteCode ? "online" : restored ? "game" : "start");
  const [gameMode, setGameMode] = useState<GameMode | null>(inviteCode ? null : restored?.saved.mode ?? null);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(restored?.saved.playerColor ?? null);
  const [opponent, setOpponent] = useState<Opponent>(restored?.saved.opponent ?? "bot");
  const [botLevel, setBotLevel] = useState<BotLevel>(restored?.saved.botLevel ?? "hard");
  const [online, setOnline] = useState<OnlineSession | null>(restored?.saved.online ?? null);
  const [game, setGame] = useState<GameState | null>(restored?.game ?? null);
  const [selected, setSelected] = useState<Position | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<AnimatedMove | null>(null);
  const [followCamera, setFollowCamera] = useState(true);
  const [soundOn, setSoundOn] = useState(loadSoundSetting);
  const [gameId, setGameId] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState<Move | null>(null);
  const [webGLSupported] = useState(canUseWebGL);
  const [showRules, setShowRules] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [endDismissed, setEndDismissed] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const moveCount = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const twoPlayers = opponent === "human";
  const isOnline = opponent === "online";
  const result = game?.result ?? null;
  const turn = game?.turn ?? "white";

  useEffect(() => unlockSoundOnFirstTouch(), []);

  useEffect(() => {
    // The invitation has done its job, and should not rejoin on every reload.
    if (inviteCode) window.history.replaceState(null, "", window.location.pathname);
  }, [inviteCode]);

  const validMoves = useMemo(
    () => (game && gameMode && selected ? getValidMoves(game.board, gameMode, selected) : []),
    [game, gameMode, selected],
  );

  const checkedKing = useMemo(
    () => (game && gameMode && isKingInCheck(game.board, gameMode, game.turn) ? findKing(game.board, game.turn) : null),
    [game, gameMode],
  );

  const selectMode = (mode: GameMode) => {
    setGameMode(mode);
    setScreen("color");
  };

  /** Plays a move on the board, with its animation and sound. */
  const applyMove = (current: GameState, mode: GameMode, move: Move): GameState => {
    moveCount.current += 1;
    const description = describeMove(current.board, mode, move);
    const next = stepGame(current, mode, move);
    setLastMove({ ...description, id: moveCount.current, color: current.turn });
    setGame(next);
    setSelected(null);
    setHint(null);
    if (soundRef.current) {
      if (next.result) playSound("end");
      else if (isKingInCheck(next.board, mode, next.turn)) playSound("check");
      else playSound(description.captured ? "capture" : "move");
    }
    return next;
  };

  /** Replaces the whole game without animating, for undo and for catching up with the server. */
  const showGame = (next: GameState) => {
    setGame(next);
    setLastMove(null);
    setSelected(null);
    setPendingPromotion(null);
  };

  const beginGame = (mode: GameMode, color: PieceColor, nextOpponent: Opponent, session: OnlineSession | null) => {
    setGameMode(mode);
    setPlayerColor(color);
    setOpponent(nextOpponent);
    setOnline(session);
    setLastMove(null);
    setGame(newGame(mode));
    setPendingPromotion(null);
    setSelected(null);
    setHint(null);
    setThinking(false);
    setEndDismissed(false);
    setShowMenu(false);
    setOpponentConnected(true);
    setGameId((id) => id + 1);
    setScreen("game");
  };

  const startGame = (color: PieceColor, nextOpponent: Opponent) => {
    if (gameMode) beginGame(gameMode, color, nextOpponent, null);
  };

  const startOnlineGame = (room: OnlineGame, myId: string) => {
    const color = colorOf(room, myId);
    if (color) beginGame(room.mode, color, "online", { gameId: room.id, roomCode: room.roomCode });
  };

  const returnToMenu = () => {
    if (isOnline && online && !result) void getOnlineBackend().resign(online.gameId).catch(() => undefined);
    clearSavedGame();
    setScreen("start");
    setGameMode(null);
    setPlayerColor(null);
    setOpponent("bot");
    setOnline(null);
    setGame(null);
    setPendingPromotion(null);
    setLastMove(null);
    setSelected(null);
    setHint(null);
    setThinking(false);
    setShowMenu(false);
    setEndDismissed(false);
  };

  /** Asks the server for the truth and follows it. Every online event simply ends up here. */
  const syncOnline = useCallback(async (trustServer = false) => {
    if (!online || !gameMode) return;
    const { game: room, moves } = await getOnlineBackend().fetchGame(online.gameId);
    const current = gameRef.current;
    if (!current) return;
    const plan = reconcileMoves(current, gameMode, moves, trustServer);
    let next = current;
    if (plan.kind === "append") next = applyMove(current, gameMode, plan.move);
    else if (plan.kind === "replace") {
      next = plan.game;
      showGame(next);
    } else if (plan.kind === "invalid" && !current.result && playerColor) {
      // Only a tampered client can send this. The honest player wins instead of playing on a broken board.
      next = { ...current, result: playerColor === "white" ? "white-wins" : "black-wins", endReason: "invalid-move" };
      setGame(next);
      void getOnlineBackend().finishGame(online.gameId, next.result, "invalid-move").catch(() => undefined);
    }
    if (room.status === "finished" && !next.result) setGame({ ...next, result: room.result, endReason: room.endReason });
    else if (next.result && next.endReason && room.status !== "finished") {
      void getOnlineBackend().finishGame(online.gameId, next.result, next.endReason).catch(() => undefined);
    }
  }, [gameMode, online, playerColor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!online || screen !== "game" || !playerColor) return;
    const backend = getOnlineBackend();
    const sync = () => void syncOnline().catch(() => undefined);
    let unsubscribe = () => undefined as void;
    let stopped = false;
    void backend.signIn().then((myId) => {
      if (stopped) return;
      unsubscribe = backend.subscribe(online.gameId, myId, { onChange: sync, onPresence: setOpponentConnected });
    }).catch(() => undefined);
    // Realtime can go quiet on a phone, so a slow check keeps the game honest, and coming back to the tab checks at once.
    const timer = window.setInterval(sync, ONLINE_POLL_MS);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      stopped = true;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [online, playerColor, screen, syncOnline]);

  const playPlayerMove = (move: Move) => {
    if (!game || !gameMode) return;
    const ply = game.log.length;
    const next = applyMove(game, gameMode, move);
    if (isOnline && online) {
      const backend = getOnlineBackend();
      void backend.playMove(online.gameId, ply, move)
        .then(() => (next.result && next.endReason ? backend.finishGame(online.gameId, next.result, next.endReason) : undefined))
        .catch((failure: unknown) => {
          setHint(onlineErrorMessage(failure));
          void syncOnline(true).catch(() => undefined);
        });
    }
  };

  const activeColor = twoPlayers ? turn : playerColor;

  const onSquareClick = (position: Position) => {
    if (!game || !gameMode || !playerColor || thinking || result || pendingPromotion) return;
    if (turn !== activeColor) return;

    if (samePosition(selected, position)) {
      setSelected(null);
      setHint(null);
      return;
    }

    const clickedPiece = game.board[position.y][position.x];
    const isLegalTarget = selected && validMoves.some((move) => samePosition(move, position));

    if (selected && isLegalTarget) {
      const move = { from: selected, to: position };
      if (isPromotionMove(game.board, gameMode, move)) setPendingPromotion(move);
      else playPlayerMove(move);
      return;
    }

    if (clickedPiece?.color === activeColor) {
      setSelected(position);
      const moves = getValidMoves(game.board, gameMode, position);
      setHint(moves.length ? "Yeşil işaretler geçerli hamleleri, kırmızı halkalar taş alma hamlelerini gösterir." : "Bu taşın geçerli hamlesi yok.");
      return;
    }

    setSelected(null);
    setHint("Önce kendi taşlarından birini seç.");
  };

  const resign = () => {
    if (!game || result || !playerColor) return;
    if (isOnline && online) void getOnlineBackend().resign(online.gameId).catch(() => undefined);
    setGame(resignGame(game, twoPlayers ? turn : playerColor));
    setSelected(null);
    if (soundRef.current) playSound("end");
  };

  const undoSteps = !game || !playerColor || isOnline || thinking ? 0 : twoPlayers ? Math.min(game.log.length, 1) : undoCount(game.log, playerColor);

  const undo = () => {
    if (!game || !gameMode || !undoSteps) return;
    const previous = replayGame(gameMode, game.log.slice(0, -undoSteps).map(({ move }) => move));
    if (!previous) return;
    showGame(previous);
    setHint(null);
    setEndDismissed(false);
  };

  useEffect(() => {
    if (screen !== "game" || !game || !gameMode || !playerColor) return;
    saveGame({
      mode: gameMode,
      playerColor,
      opponent,
      botLevel,
      moves: game.log.map(({ move }) => move),
      result: game.result,
      endReason: game.endReason,
      online,
    });
  }, [botLevel, game, gameMode, online, opponent, playerColor, screen]);

  useEffect(() => {
    if (!game || !gameMode || !playerColor || result || opponent !== "bot") return;
    const botColor: PieceColor = playerColor === "white" ? "black" : "white";
    if (turn !== botColor) return;

    setThinking(true);
    // The reply waits for the player's piece to land, however fast the bot answers.
    const replyAt = performance.now() + (lastMove ? moveSettleTime(lastMove) * 1000 : 0) + BOT_REPLY_PAUSE_MS;
    const request = requestBotMove(game.board, gameMode, botColor, botLevel, game.history);
    let cancelled = false;
    let timer: number | undefined;

    request.promise.then((move) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (move) applyMove(game, gameMode, move);
        setThinking(false);
      }, Math.max(0, replyAt - performance.now()));
    });

    return () => {
      cancelled = true;
      request.cancel();
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [botLevel, game, gameMode, lastMove, opponent, playerColor, result, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (screen === "game" && gameMode && playerColor && game) {
    const moveTotal = game.log.length;
    const gameInProgress = !result && moveTotal > 0;
    const isMyTurn = turn === playerColor;
    const title = result
      ? "Oyun tamamlandı"
      : twoPlayers
        ? turn === "white" ? "Sıra beyazda" : "Sıra siyahta"
        : isOnline
          ? isMyTurn ? "Senin sıran" : "Rakibin sırası"
          : thinking ? "Bot düşünüyor" : "Senin sıran";
    const status = result
      ? endReasonText(game.endReason)
      : hint ?? (checkedKing
        ? isMyTurn || twoPlayers ? "Şah! Hamleni dikkatle seç." : "Şah çektin."
        : !twoPlayers && !isMyTurn
          ? isOnline
            ? opponentConnected ? "Rakibin hamlesi bekleniyor." : "Rakibin bağlantısı koptu, dönmesi bekleniyor."
            : "Bot düşünüyor…"
          : "Bir taş seç.");
    const meta = twoPlayers
      ? <div><span>Oyun</span><strong>İki kişilik</strong></div>
      : isOnline
        ? <div><span>Sen · Online</span><strong>{colorLabels[playerColor]}</strong></div>
        : <div><span>Sen · Bot {botLevel === "hard" ? "zor" : "kolay"}</span><strong>{colorLabels[playerColor]}</strong></div>;

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
              {meta}
              <div><span>Sıra</span><strong>{colorLabels[turn]}</strong></div>
            </div>
            <div className="captured-list">
              <CapturedRow label="Alınan siyah" color="black" captured={game.captured} />
              <CapturedRow label="Alınan beyaz" color="white" captured={game.captured} />
            </div>
            {gameMode === "mobius" && (
              <p className="topology-note">Şerit iki turda kapanır: halka boyunca ilerleyen taş bükümden geçerek karşı yüze ulaşır.</p>
            )}
            <div className="hud-actions">
              {!isOnline && <button className="secondary-button" type="button" disabled={!undoSteps} onClick={undo}>Geri al</button>}
              {!result && <ConfirmButton label="Teslim ol" question="Emin misin?" ask onConfirm={resign} />}
              <button className="secondary-button" type="button" onClick={() => setShowMenu(true)}>Menü</button>
            </div>
            {isOnline && online && <p className="room-note">Oda: {online.roomCode}</p>}
            <div className="hud-moves">
              <MoveList log={game.log} />
            </div>
          </aside>

          <div className="game-stage">
            {webGLSupported ? (
              <GameScene
                key={gameId}
                mode={gameMode}
                board={game.board}
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
            {showMenu && (
              <MenuDialog log={game.log} onClose={() => setShowMenu(false)}>
                {!isOnline && (
                  <ConfirmButton
                    label="Yeniden başlat"
                    question="Oyun silinsin mi?"
                    ask={gameInProgress}
                    onConfirm={() => beginGame(gameMode, playerColor, opponent, null)}
                  />
                )}
                <ConfirmButton
                  label="Ana menü"
                  question={isOnline ? "Teslim olup çıkılsın mı?" : "Oyun silinsin mi?"}
                  ask={gameInProgress}
                  onConfirm={returnToMenu}
                />
                {gameMode === "mobius" && (
                  <button className="secondary-button" type="button" aria-pressed={followCamera} onClick={() => setFollowCamera(!followCamera)}>
                    Kamera takibi: {followCamera ? "açık" : "kapalı"}
                  </button>
                )}
                <button
                  className="secondary-button"
                  type="button"
                  aria-pressed={soundOn}
                  onClick={() => {
                    saveSoundSetting(!soundOn);
                    setSoundOn(!soundOn);
                  }}
                >
                  Ses: {soundOn ? "açık" : "kapalı"}
                </button>
                {gameMode === "mobius" && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowRules(true);
                    }}
                  >
                    Kurallar
                  </button>
                )}
              </MenuDialog>
            )}
            {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
            {pendingPromotion && (
              <PromotionDialog
                color={turn}
                onChoose={(type) => {
                  setPendingPromotion(null);
                  playPlayerMove({ ...pendingPromotion, promotion: type });
                }}
                onCancel={() => setPendingPromotion(null)}
              />
            )}
            {result && !endDismissed && (
              <EndDialog
                result={result}
                endReason={game.endReason}
                opponent={opponent}
                playerColor={playerColor}
                moveCount={moveTotal}
                onNewGame={isOnline ? null : () => beginGame(gameMode, playerColor, opponent, null)}
                onMenu={returnToMenu}
                onClose={() => setEndDismissed(true)}
              />
            )}
            {gameMode === "mobius" && (
              <BoardMap
                board={game.board}
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
              <button className="color-button online-choice" type="button" onClick={() => setScreen("online")}>
                <span className="piece-preview">⇄</span>
                <strong>Online</strong>
                <small>Arkadaşınla ya da rakip bularak</small>
              </button>
            </div>
          </div>
        )}

        {screen === "online" && (
          <OnlineLobby
            mode={gameMode}
            initialCode={inviteCode}
            onStart={startOnlineGame}
            onBack={() => setScreen(gameMode ? "color" : "start")}
          />
        )}
      </section>
    </main>
  );
}

export default App;
