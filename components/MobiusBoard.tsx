import { useMemo } from "react";
import { Piece } from "./Piece";
import type { BoardState, Position } from "../types";
import { samePosition } from "../utils/board";
import {
  buildMobiusStripGeometry,
  getMobiusFrame,
  MOBIUS_COLUMNS,
  MOBIUS_ROWS,
} from "../utils/mobiusGeometry";

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

  const stripGeometry = useMemo(() => buildMobiusStripGeometry(), []);

  return (
    <group rotation={[0, -0.35, 0]}>
      <mesh castShadow receiveShadow geometry={stripGeometry}>
        <meshStandardMaterial vertexColors roughness={0.56} side={2} />
      </mesh>

      {frames.map(({ x, y, frame }) => {
        const position = { x, y };
        const piece = board[y][x];
        const isSelected = samePosition(selected, position);
        const isMove = validMoves.some((move) => samePosition(move, position));
        const isCapture = Boolean(isMove && piece);
        const highlighted = isSelected || isMove;
        return (
          <group key={`${x}-${y}`} position={frame.position} quaternion={frame.quaternion} onClick={(event) => { event.stopPropagation(); onSquareClick(position); }}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[frame.tileLength * 0.975, frame.tileWidth * 0.975]} />
              <meshStandardMaterial
                color={isSelected ? "#d6b85d" : isMove ? (isCapture ? "#b24b46" : "#5c9c72") : "#000000"}
                emissive={isSelected ? "#9a741c" : isMove ? (isCapture ? "#641c1c" : "#174e2c") : "#000000"}
                emissiveIntensity={highlighted ? 0.65 : 0}
                transparent
                opacity={highlighted ? 0.85 : 0}
                depthWrite={false}
              />
            </mesh>
            {piece && <group position={[0, 0.11, 0]} scale={1.38}><Piece data={piece} /></group>}
          </group>
        );
      })}
    </group>
  );
}
