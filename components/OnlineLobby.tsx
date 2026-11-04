import { useEffect, useRef, useState } from "react";
import type { GameMode } from "../types";
import { colorOf, getOnlineBackend, isOnlineConfigured, normalizeRoomCode, type OnlineGame, onlineErrorMessage, type RoomColor } from "../utils/online";

const WAITING_POLL_MS = 3000;
const COLOR_CHOICES: { value: RoomColor; label: string }[] = [
  { value: "random", label: "Rastgele" },
  { value: "white", label: "Beyaz" },
  { value: "black", label: "Siyah" },
];

interface OnlineLobbyProps {
  /** Null when someone arrives through an invitation link and has not picked a mode. */
  mode: GameMode | null;
  initialCode: string;
  onStart: (game: OnlineGame, myId: string) => void;
  onBack: () => void;
}

export function OnlineLobby({ mode, initialCode, onStart, onBack }: OnlineLobbyProps) {
  const [code, setCode] = useState(initialCode);
  const [color, setColor] = useState<RoomColor>("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState<OnlineGame | null>(null);
  const [myId, setMyId] = useState("");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const begin = (game: OnlineGame, id: string) => {
    if (started.current) return;
    started.current = true;
    onStart(game, id);
  };

  const enter = async (action: () => Promise<OnlineGame>) => {
    setBusy(true);
    setError("");
    try {
      const id = await getOnlineBackend().signIn();
      const game = await action();
      setMyId(id);
      if (game.status === "waiting") setWaiting(game);
      else if (colorOf(game, id)) begin(game, id);
      else setError("Bu oyunun oyuncusu değilsin.");
    } catch (failure) {
      setError(onlineErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const join = (roomCode: string) => enter(() => getOnlineBackend().joinGame(roomCode));

  // An invitation link joins right away.
  const joinedFromLink = useRef(false);
  useEffect(() => {
    if (initialCode.length !== 6 || joinedFromLink.current || !isOnlineConfigured()) return;
    joinedFromLink.current = true;
    void join(initialCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!waiting) return;
    const backend = getOnlineBackend();
    const check = () => {
      void backend.fetchGame(waiting.id).then(({ game }) => {
        if (game.status !== "waiting") begin(game, myId);
      }).catch(() => undefined);
    };
    const unsubscribe = backend.subscribe(waiting.id, myId, { onChange: check, onPresence: () => undefined });
    const timer = window.setInterval(check, WAITING_POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [waiting, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveRoom = () => {
    if (waiting) void getOnlineBackend().cancelGame(waiting.id).catch(() => undefined);
    setWaiting(null);
  };

  if (!isOnlineConfigured()) {
    return (
      <div className="menu-content online-lobby">
        <button className="back-button" type="button" onClick={onBack}>← Geri</button>
        <h2>Online henüz açık değil</h2>
        <p className="selection-info">Bu sürümde online oyun bağlantısı ayarlanmamış. Bota karşı ya da iki kişilik oynayabilirsin.</p>
      </div>
    );
  }

  if (waiting) {
    const link = `${window.location.origin}/?oda=${waiting.roomCode}`;
    const share = async () => {
      try {
        if (navigator.share) await navigator.share({ title: "Möbius Chess", text: "Benimle satranç oyna", url: link });
        else {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }
      } catch {
        // Closing the share sheet is not an error.
      }
    };
    return (
      <div className="menu-content online-lobby">
        <span className="section-eyebrow">{waiting.mode === "mobius" ? "MÖBİUS SATRANÇ" : "KLASİK SATRANÇ"}</span>
        {waiting.isPublic ? (
          <>
            <h2>Rakip aranıyor…</h2>
            <p className="selection-info">Biri katılır katılmaz oyun başlar.</p>
          </>
        ) : (
          <>
            <h2>Arkadaşını bekliyorsun</h2>
            <p className="selection-info">Bu kodu ya da bağlantıyı gönder. Katılınca oyun kendiliğinden başlar.</p>
            <output className="room-code">{waiting.roomCode}</output>
            <button className="primary-button" type="button" onClick={() => void share()}>{copied ? "Bağlantı kopyalandı" : "Bağlantıyı paylaş"}</button>
          </>
        )}
        <button className="secondary-button" type="button" onClick={leaveRoom}>Vazgeç</button>
      </div>
    );
  }

  return (
    <div className="menu-content online-lobby">
      <button className="back-button" type="button" onClick={onBack}>← Geri</button>
      <span className="section-eyebrow">ONLINE</span>
      <h2>Kiminle oynayacaksın?</h2>
      {error && <p className="online-error" role="alert">{error}</p>}

      <div className="online-cards">
        <section className="online-card">
          <strong>Koda katıl</strong>
          <small>Arkadaşının verdiği kodu yaz.</small>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 6) void join(code);
          }}>
            <input
              aria-label="Oda kodu"
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
            />
            <button className="primary-button" type="submit" disabled={busy || code.length !== 6}>Katıl</button>
          </form>
        </section>

        {mode ? (
          <>
            <section className="online-card">
              <strong>Oda kur</strong>
              <small>Arkadaşına göndereceğin bir kod alırsın.</small>
              <div className="level-picker" role="group" aria-label="Rengin">
                <span>Rengin</span>
                {COLOR_CHOICES.map(({ value, label }) => (
                  <button key={value} type="button" aria-pressed={color === value} onClick={() => setColor(value)}>{label}</button>
                ))}
              </div>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void enter(() => getOnlineBackend().createGame(mode, color))}>Oda kur</button>
            </section>

            <section className="online-card">
              <strong>Hızlı eşleşme</strong>
              <small>Şu an bekleyen biriyle oynarsın.</small>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void enter(() => getOnlineBackend().quickMatch(mode))}>Rakip bul</button>
            </section>
          </>
        ) : (
          <p className="selection-info">Oda kurmak için önce ana sayfadan bir mod seç.</p>
        )}
      </div>
    </div>
  );
}
