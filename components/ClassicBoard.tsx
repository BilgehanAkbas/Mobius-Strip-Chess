import { Piece } from "./Piece";
import { CapturedPiece, MovingPiece, type PlacePiece } from "./PieceMotion";
import type { AnimatedMove, BoardState, PieceColor, Position } from "../types";
import { samePosition } from "../utils/board";
import { moveSettleTime } from "../utils/pieceMotion";

const SQUARE_TOP = 0.0375;

function pieceYaw(color: PieceColor): number {
  return color === "white" ? Math.PI / 2 : -Math.PI / 2;
}

const placeOnBoard: PlacePiece = (object, x, y, lift) => {
  object.position.set(x - 3.5, SQUARE_TOP + lift, y - 3.5);
};

interface ClassicBoardProps {
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  lastMove: AnimatedMove | null;
  checkedKing: Position | null;
  onSquareClick: (position: Position) => void;
}

export function ClassicBoard({ board, selected, validMoves, lastMove, checkedKing, onSquareClick }: ClassicBoardProps) {
  const captured = lastMove?.captured;

  return (
    <group>
      <mesh receiveShadow position={[0, -0.16, 0]}>
        <boxGeometry args={[8.55, 0.24, 8.55]} />
        <meshStandardMaterial color="#f2eef2" roughness={0.24} metalness={0.05} />
      </mesh>
      <mesh receiveShadow position={[0, -0.27, 0]}>
        <boxGeometry args={[8.82, 0.12, 8.82]} />
        <meshStandardMaterial color="#bdb7ca" roughness={0.34} metalness={0.03} />
      </mesh>

      {board.flatMap((row, y) => row.map((piece, x) => {
        const position = { x, y };
        const isSelected = samePosition(selected, position);
        const isMove = validMoves.some((move) => samePosition(move, position));
        const isCapture = Boolean(isMove && piece);
        const isMoving = lastMove?.movements.some(({ to }) => samePosition(to, position));
        const wasInLastMove = lastMove?.movements.some(({ from, to }) => samePosition(from, position) || samePosition(to, position));
        const baseColor = (x + y) % 2 ? "#b9bfd0" : "#f1ecef";
        const squareColor = isSelected
          ? "#efa84a"
          : samePosition(checkedKing, position)
            ? "#e0524a"
            : wasInLastMove
              ? (x + y) % 2 ? "#c4bf8c" : "#ece2a4"
              : baseColor;

        return (
          <group
            key={`${x}-${y}`}
            position={[x - 3.5, 0, y - 3.5]}
            onClick={(event) => {
              event.stopPropagation();
              onSquareClick(position);
            }}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.99, 0.075, 0.99]} />
              <meshStandardMaterial color={squareColor} roughness={0.36} metalness={0.02} />
            </mesh>

            {isMove && !isCapture && (
              <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.14, 32]} />
                <meshBasicMaterial color="#79ef55" transparent opacity={0.9} depthWrite={false} />
              </mesh>
            )}
            {isCapture && (
              <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.31, 0.39, 36]} />
                <meshBasicMaterial color="#ef625b" transparent opacity={0.9} depthWrite={false} />
              </mesh>
            )}

            {piece && !isMoving && (
              <group position={[0, SQUARE_TOP, 0]}>
                <Piece data={piece} yaw={pieceYaw(piece.color)} />
              </group>
            )}
          </group>
        );
      }))}

      {lastMove?.movements.map((movement) => {
        const piece = board[movement.to.y][movement.to.x];
        if (!piece) return null;
        return (
          <MovingPiece
            key={`move-${lastMove.id}-${movement.to.x}-${movement.to.y}`}
            movement={movement}
            place={placeOnBoard}
            onClick={() => onSquareClick(movement.to)}
          >
            <Piece data={piece} yaw={pieceYaw(piece.color)} />
          </MovingPiece>
        );
      })}

      {captured && lastMove && (
        <group key={`captured-${lastMove.id}`} position={[captured.at.x - 3.5, SQUARE_TOP, captured.at.y - 3.5]}>
          <CapturedPiece delay={moveSettleTime(lastMove) * 0.55}>
            <Piece data={captured.piece} yaw={pieceYaw(captured.piece.color)} />
          </CapturedPiece>
        </group>
      )}
    </group>
  );
}
