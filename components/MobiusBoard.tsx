import { useMemo } from "react";
import { Piece } from "./Piece";
import type { BoardState, Position } from "../types";
import { samePosition } from "../utils/board";
import { getMobiusFrame, MOBIUS_COLUMNS, MOBIUS_ROWS } from "../utils/mobiusGeometry";

interface MobiusBoardProps {
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  onSquareClick: (position: Position) => void;
}

export function MobiusBoard({ board, selected, validMoves, onSquareClick }: MobiusBoardProps) {
  const frames = useMemo(() => Array.from({ length: MOBIUS_ROWS * MOBIUS_COLUMNS }, (_, index) => {
    const y = Math.floor(index / MOBIUS_COLUMNS);
    const x = index % MOBIUS_COLUMNS;
    return { x, y, frame: getMobiusFrame({ x, y }) };
  }), []);

  return (
    <group rotation={[0, -0.35, 0]}>
      {frames.map(({ x, y, frame }) => {
        const position = { x, y };
        const piece = board[y][x];
        const isSelected = samePosition(selected, position);
        const isMove = validMoves.some((move) => samePosition(move, position));
        const isCapture = Boolean(isMove && piece);
        return (
          <group key={`${x}-${y}`} position={frame.position} quaternion={frame.quaternion} onClick={(event) => { event.stopPropagation(); onSquareClick(position); }}>
            <mesh castShadow receiveShadow position={[0, 0.055, 0]} scale={[frame.tileLength * 0.975, 0.1, frame.tileWidth * 0.975]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={isSelected ? "#d6b85d" : isMove ? (isCapture ? "#b24b46" : "#5c9c72") : (x + y) % 2 ? "#315c5d" : "#e7d9ba"}
                emissive={isSelected ? "#9a741c" : isMove ? (isCapture ? "#641c1c" : "#174e2c") : "#000000"}
                emissiveIntensity={isSelected || isMove ? 0.65 : 0}
                roughness={0.56}
              />
            </mesh>
            {piece && <group position={[0, 0.11, 0]} scale={1.18}><Piece data={piece} /></group>}
          </group>
        );
      })}
    </group>
  );
}
