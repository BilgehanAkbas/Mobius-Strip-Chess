import { type ReactNode, useEffect, useRef, useState } from "react";
import type { EndReason, GameResult, Opponent, PieceColor, PieceType } from "../types";
import { PIECE_GLYPHS, PIECE_NAMES } from "../utils/boardMap";
import type { LoggedMove } from "../utils/gameState";

const CONFIRM_MS = 3000;
const PROMOTION_PIECES: PieceType[] = ["queen", "rook", "bishop", "knight"];

const END_REASONS: Record<EndReason, string> = {
  checkmate: "Şah mat.",
  stalemate: "Pat: hamle kalmadı.",
  insufficient: "Mat edecek taş kalmadı.",
  repetition: "Aynı konum üç kez oluştu.",
  "fifty-moves": "50 hamledir taş alınmadı ve piyon oynanmadı.",
  resignation: "Teslim olundu.",
  "invalid-move": "Geçersiz hamle geldiği için oyun bitirildi.",
};

export function endReasonText(reason: EndReason | null): string {
  return reason ? END_REASONS[reason] : "";
}

/** The headline for a finished game: personal against a bot or online, neutral on one shared screen. */
export function endTitle(result: GameResult, opponent: Opponent, playerColor: PieceColor): string {
  if (result === "draw") return "Beraberlik";
  const winner: PieceColor = result === "white-wins" ? "white" : "black";
  if (opponent === "human") return winner === "white" ? "Beyaz kazandı" : "Siyah kazandı";
  return winner === playerColor ? "Kazandın!" : "Kaybettin";
}

/** Acts only on a second tap, so a slip of the finger on a phone costs nothing. */
export function ConfirmButton({ label, question, ask, onConfirm }: { label: string; question: string; ask: boolean; onConfirm: () => void }) {
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
      {asking ? question : label}
    </button>
  );
}

export function MoveList({ log }: { log: LoggedMove[] }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [log.length]);

  if (!log.length) return <p className="move-list-empty">Henüz hamle yok.</p>;
  const rounds = Array.from({ length: Math.ceil(log.length / 2) }, (_, index) => index);
  return (
    <ol className="move-list">
      {rounds.map((round) => (
        <li key={round}>
          <span>{round + 1}.</span>
          <span>{log[round * 2]?.label}</span>
          <span>{log[round * 2 + 1]?.label}</span>
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}

function Dialog({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  return <div className={`game-dialog ${className}`} role="dialog" aria-label={label}>{children}</div>;
}

interface EndDialogProps {
  result: GameResult;
  endReason: EndReason | null;
  opponent: Opponent;
  playerColor: PieceColor;
  moveCount: number;
  onNewGame: (() => void) | null;
  onMenu: () => void;
  onClose: () => void;
}

export function EndDialog({ result, endReason, opponent, playerColor, moveCount, onNewGame, onMenu, onClose }: EndDialogProps) {
  const winnerLine = result === "white-wins" ? "Beyaz kazandı" : result === "black-wins" ? "Siyah kazandı" : null;
  return (
    <Dialog className="end-dialog" label="Oyun sonucu">
      <strong className="end-title">{endTitle(result, opponent, playerColor)}</strong>
      <p>{opponent !== "human" && winnerLine ? `${winnerLine}. ` : ""}{endReasonText(endReason)}</p>
      <small>{moveCount} hamle oynandı</small>
      <div className="dialog-actions">
        {onNewGame && <button className="primary-button" type="button" autoFocus onClick={onNewGame}>Yeni oyun</button>}
        <button className="secondary-button" type="button" onClick={onMenu}>Ana menü</button>
        <button className="secondary-button" type="button" onClick={onClose}>Tahtaya bak</button>
      </div>
    </Dialog>
  );
}

export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog className="rules-dialog" label="Möbius kuralları">
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
      <button className="secondary-button" type="button" autoFocus onClick={onClose}>Tamam</button>
    </Dialog>
  );
}

export function PromotionDialog({ color, onChoose, onCancel }: { color: PieceColor; onChoose: (type: PieceType) => void; onCancel: () => void }) {
  return (
    <Dialog className="promotion-dialog" label="Terfi seçimi">
      <strong>Piyon ne olsun?</strong>
      <div className="promotion-choices">
        {PROMOTION_PIECES.map((type) => (
          <button key={type} type="button" autoFocus={type === "queen"} onClick={() => onChoose(type)}>
            <span className={`map-piece is-${color}`}>{PIECE_GLYPHS[type]}</span>
            <small>{PIECE_NAMES[type]}</small>
          </button>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onCancel}>Vazgeç</button>
    </Dialog>
  );
}

export function MenuDialog({ log, onClose, children }: { log: LoggedMove[]; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog className="menu-dialog" label="Oyun menüsü">
      <strong>Menü</strong>
      <div className="dialog-actions">{children}</div>
      <span className="menu-section">Hamleler</span>
      <MoveList log={log} />
      <button className="secondary-button" type="button" autoFocus onClick={onClose}>Kapat</button>
    </Dialog>
  );
}
