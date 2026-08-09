import { Piece } from "./Piece";
import type { BoardState, Position } from "../types";
import { samePosition } from "../utils/board";

interface ClassicBoardProps {
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  onSquareClick: (position: Position) => void;
}

export function ClassicBoard({ board, selected, validMoves, onSquareClick }: ClassicBoardProps) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <boxGeometry args={[8.45, 0.26, 8.45]} />
        <meshStandardMaterial color="#3d241a" roughness={0.38} metalness={0.12} />
      </mesh>
      {board.flatMap((row, y) => row.map((piece, x) => {
        const position = { x, y };
        const isSelected = samePosition(selected, position);
        const isMove = validMoves.some((move) => samePosition(move, position));
        const isCapture = Boolean(isMove && piece);
        return (
          <group key={`${x}-${y}`} position={[x - 3.5, 0, y - 3.5]} onClick={(event) => { event.stopPropagation(); onSquareClick(position); }}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.98, 0.09, 0.98]} />
              <meshStandardMaterial
                color={isSelected ? "#d6b85d" : isMove ? (isCapture ? "#b24b46" : "#5c9c72") : (x + y) % 2 ? "#355a57" : "#e4d6b8"}
                emissive={isSelected ? "#9a741c" : isMove ? (isCapture ? "#641c1c" : "#174e2c") : "#000000"}
                emissiveIntensity={isSelected || isMove ? 0.55 : 0}
                roughness={0.58}
              />
            </mesh>
            {piece && <group position={[0, 0.06, 0]} scale={1.6}><Piece data={piece} /></group>}
          </group>
        );
      }))}
    </group>
  );
}
