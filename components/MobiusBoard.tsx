import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Piece } from "./Piece";
import { CapturedPiece, MovingPiece, type PlacePiece } from "./PieceMotion";
import type { AnimatedMove, BoardState, PieceColor, Position } from "../types";
import {
  buildMobiusEdgeGeometry,
  buildMobiusMarkerGeometry,
  buildMobiusSquareGeometry,
  buildMobiusStripGeometry,
  getMobiusFrame,
  MOBIUS_COLUMNS,
  MOBIUS_PIECE_SCALE,
  MOBIUS_ROWS,
  mobiusSquareFromFace,
} from "../utils/mobiusGeometry";
import { mobiusViewQuaternion } from "../utils/mobiusView";
import { moveSettleTime } from "../utils/pieceMotion";

const MOVE_DOT_RADIUS = 0.2;
const CAPTURE_RING_INNER = 0.42;
const CAPTURE_RING_OUTER = 0.52;

const placeOnStrip: PlacePiece = (object, x, y, lift) => {
  const { position, quaternion, normal } = getMobiusFrame({ x, y });
  object.position.copy(position).addScaledVector(normal, lift);
  object.quaternion.copy(quaternion);
};

interface MobiusBoardProps {
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  lastMove: AnimatedMove | null;
  checkedKing: Position | null;
  playerColor: PieceColor;
  onSquareClick: (position: Position) => void;
}

function SquareMarker({ geometry, color, opacity }: { geometry: THREE.BufferGeometry; color: string; opacity: number }) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export function MobiusBoard({ board, selected, validMoves, lastMove, checkedKing, playerColor, onSquareClick }: MobiusBoardProps) {
  const frames = useMemo(
    () => Array.from({ length: MOBIUS_ROWS * MOBIUS_COLUMNS }, (_, index) => {
      const y = Math.floor(index / MOBIUS_COLUMNS);
      const x = index % MOBIUS_COLUMNS;
      return { x, y, frame: getMobiusFrame({ x, y }) };
    }),
    [],
  );

  const view = useMemo(() => mobiusViewQuaternion(playerColor), [playerColor]);
  const stripGeometry = useMemo(() => buildMobiusStripGeometry(), []);
  const edgeGeometry = useMemo(() => buildMobiusEdgeGeometry(), []);
  const selectedGeometry = useMemo(() => (selected ? buildMobiusSquareGeometry(selected) : null), [selected]);
  const checkGeometry = useMemo(() => (checkedKing ? buildMobiusSquareGeometry(checkedKing) : null), [checkedKing]);
  const lastMoveMarkers = useMemo(
    () => (lastMove?.movements ?? []).flatMap(({ from, to }) => [from, to]).map((square) => ({
      key: `${square.x}-${square.y}`,
      geometry: buildMobiusSquareGeometry(square),
    })),
    [lastMove],
  );
  const moveMarkers = useMemo(
    () => validMoves.map((move) => {
      const isCapture = Boolean(board[move.y][move.x]);
      return {
        key: `${move.x}-${move.y}`,
        isCapture,
        geometry: isCapture
          ? buildMobiusMarkerGeometry(move, CAPTURE_RING_INNER, CAPTURE_RING_OUTER)
          : buildMobiusMarkerGeometry(move, 0, MOVE_DOT_RADIUS),
      };
    }),
    [board, validMoves],
  );
  const captured = lastMove?.captured;
  const capturedFrame = captured ? getMobiusFrame(captured.at) : null;

  return (
    <group quaternion={view}>
      <mesh
        castShadow
        receiveShadow
        geometry={stripGeometry}
        onClick={(event) => {
          event.stopPropagation();
          if (event.faceIndex != null) onSquareClick(mobiusSquareFromFace(event.faceIndex));
        }}
      >
        <meshPhysicalMaterial
          vertexColors
          roughness={0.5}
          metalness={0.02}
          clearcoat={0.12}
          clearcoatRoughness={0.6}
        />
      </mesh>

      <mesh castShadow receiveShadow geometry={edgeGeometry} onClick={(event) => event.stopPropagation()}>
        <meshPhysicalMaterial
          color="#f7f2f6"
          roughness={0.2}
          metalness={0.02}
          clearcoat={0.55}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {lastMoveMarkers.map(({ key, geometry }) => (
        <SquareMarker key={key} geometry={geometry} color="#d9c97a" opacity={0.42} />
      ))}
      {checkGeometry && <SquareMarker geometry={checkGeometry} color="#e0524a" opacity={0.7} />}
      {selectedGeometry && <SquareMarker geometry={selectedGeometry} color="#efa84a" opacity={0.82} />}
      {moveMarkers.map(({ key, isCapture, geometry }) => (
        <SquareMarker
          key={key}
          geometry={geometry}
          color={isCapture ? "#ef625b" : "#77ef55"}
          opacity={0.95}
        />
      ))}

      {frames.map(({ x, y, frame }) => {
        const piece = board[y][x];
        if (!piece) return null;
        const yaw = piece.direction === -1 ? Math.PI : 0;
        const movement = lastMove?.movements.find(({ to }) => to.x === x && to.y === y);
        if (movement) {
          return (
            <MovingPiece
              key={`move-${lastMove?.id}-${x}-${y}`}
              movement={movement}
              place={placeOnStrip}
              scale={MOBIUS_PIECE_SCALE}
              onClick={() => onSquareClick({ x, y })}
            >
              <Piece data={piece} yaw={yaw} />
            </MovingPiece>
          );
        }
        return (
          <group
            key={`${x}-${y}`}
            position={frame.position}
            quaternion={frame.quaternion}
            scale={MOBIUS_PIECE_SCALE}
            onClick={(event) => {
              event.stopPropagation();
              onSquareClick({ x, y });
            }}
          >
            <Piece data={piece} yaw={yaw} />
          </group>
        );
      })}

      {captured && capturedFrame && lastMove && (
        <group
          key={`captured-${lastMove.id}`}
          position={capturedFrame.position}
          quaternion={capturedFrame.quaternion}
          scale={MOBIUS_PIECE_SCALE}
        >
          <CapturedPiece delay={moveSettleTime(lastMove) * 0.55}>
            <Piece data={captured.piece} yaw={captured.piece.direction === -1 ? Math.PI : 0} />
          </CapturedPiece>
        </group>
      )}
    </group>
  );
}
