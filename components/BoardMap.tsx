import type { AnimatedMove, BoardState, PieceColor, Position } from "../types";
import { samePosition } from "../utils/board";
import { mapColumnOrder, PIECE_GLYPHS, PIECE_NAMES } from "../utils/boardMap";

const ROWS = [0, 1, 2, 3];

interface BoardMapProps {
  board: BoardState;
  viewColor: PieceColor;
  selected: Position | null;
  validMoves: Position[];
  lastMove: AnimatedMove | null;
  checkedKing: Position | null;
  onSquareClick: (position: Position) => void;
}

/** A flat view of the whole loop, because half the strip is always out of sight in 3D. */
export function BoardMap({ board, viewColor, selected, validMoves, lastMove, checkedKing, onSquareClick }: BoardMapProps) {
  const columns = mapColumnOrder(viewColor);
  const isLastMove = (position: Position) => lastMove?.movements.some(({ from, to }) => samePosition(from, position) || samePosition(to, position));

  return (
    <div className="board-map" role="grid" aria-label="Tahtanın düz haritası">
      {ROWS.map((y) => (
        <div className="board-map-row" role="row" key={y}>
          {columns.map((x) => {
            const position = { x, y };
            const piece = board[y][x];
            const isMove = validMoves.some((move) => samePosition(move, position));
            const classes = [
              "map-square",
              (x + y) % 2 ? "is-dark" : "is-light",
              isLastMove(position) && "is-last",
              samePosition(checkedKing, position) && "is-check",
              samePosition(selected, position) && "is-selected",
              isMove && (piece ? "is-capture" : "is-move"),
            ].filter(Boolean).join(" ");
            const name = piece ? `${piece.color === "white" ? "beyaz" : "siyah"} ${PIECE_NAMES[piece.type]}` : "boş";

            return (
              <button
                key={x}
                type="button"
                role="gridcell"
                className={classes}
                data-square={`${x}-${y}`}
                aria-label={`Sütun ${x}, satır ${y}: ${name}`}
                onClick={() => onSquareClick(position)}
              >
                {piece && <span className={`map-piece is-${piece.color}`}>{PIECE_GLYPHS[piece.type]}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
