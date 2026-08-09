import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ClassicBoard } from "./ClassicBoard";
import { MobiusBoard } from "./MobiusBoard";
import type { BoardState, GameMode, Position } from "../types";

interface GameSceneProps {
  mode: GameMode;
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  onSquareClick: (position: Position) => void;
}

export function GameScene({ mode, board, selected, validMoves, onSquareClick }: GameSceneProps) {
  return (
    <Canvas shadows camera={{ position: mode === "classic" ? [8, 8, 10] : [10, 7, 10], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={["#071018"]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#9dd6e8", "#17212b", 1.5]} />
      <directionalLight castShadow position={[7, 10, 5]} intensity={2.2} shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-6, 3, -7]} intensity={0.7} color="#d9b86a" />
      {mode === "classic"
        ? <ClassicBoard board={board} selected={selected} validMoves={validMoves} onSquareClick={onSquareClick} />
        : <MobiusBoard board={board} selected={selected} validMoves={validMoves} onSquareClick={onSquareClick} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={22} />
    </Canvas>
  );
}
