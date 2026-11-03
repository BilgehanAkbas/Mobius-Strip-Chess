import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CameraFollow } from "./CameraFollow";
import { ClassicBoard } from "./ClassicBoard";
import { MobiusBoard } from "./MobiusBoard";
import { SceneLights } from "./SceneLights";
import type { AnimatedMove, BoardState, GameMode, PieceColor, Position } from "../types";
import { isTouchDevice } from "../utils/device";
import { MOBIUS_CAMERA_POSITION } from "../utils/mobiusView";

const FULL_VIEW_ASPECT = { classic: 1.15, mobius: 1 };

interface GameSceneProps {
  mode: GameMode;
  board: BoardState;
  selected: Position | null;
  validMoves: Position[];
  lastMove: AnimatedMove | null;
  checkedKing: Position | null;
  playerColor: PieceColor;
  turn: PieceColor;
  twoPlayers: boolean;
  followCamera: boolean;
  onSquareClick: (position: Position) => void;
}

function classicCameraPosition(color: PieceColor): [number, number, number] {
  return color === "white" ? [8.6, 8.8, 10.2] : [-8.6, 8.8, -10.2];
}

/** Backs the camera away on narrow screens so the whole board fits, again when a phone is turned. */
function FitCamera({ mode }: { mode: GameMode }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const base = useRef<{ radius: number; fogNear: number; fogFar: number } | null>(null);
  const isLandscape = size.width > size.height;

  useLayoutEffect(() => {
    const fog = scene.fog && "near" in scene.fog ? scene.fog : null;
    base.current ??= { radius: camera.position.length(), fogNear: fog?.near ?? 0, fogFar: fog?.far ?? 0 };
    const scale = Math.max(1, FULL_VIEW_ASPECT[mode] / (size.width / size.height));
    camera.position.setLength(base.current.radius * scale);
    if (fog) {
      fog.near = base.current.fogNear * scale;
      fog.far = base.current.fogFar * scale;
    }
    invalidate();
    // Refitting on every small resize would undo the player's zoom whenever a browser bar moves.
  }, [isLandscape]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/** Phones drop the 3D context when the app is in the background. A new canvas brings the scene back whole. */
function RestoreLostContext({ onLost }: { onLost: () => void }) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [canvas, onLost]);
  return null;
}

export function GameScene({ mode, board, selected, validMoves, lastMove, checkedKing, playerColor, turn, twoPlayers, followCamera, onSquareClick }: GameSceneProps) {
  const isMobius = mode === "mobius";
  const [touch] = useState(isTouchDevice);
  const [canvasId, setCanvasId] = useState(0);
  const [restartCanvas] = useState(() => () => setCanvasId((id) => id + 1));

  return (
    <div className="game-canvas">
      <Canvas
        key={canvasId}
        shadows
        frameloop="demand"
        camera={{ position: isMobius ? MOBIUS_CAMERA_POSITION : classicCameraPosition(playerColor), fov: isMobius ? 39 : 40 }}
        dpr={touch ? [1, 1.5] : [1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#111114"]} />
        {!isMobius && <fog attach="fog" args={["#111114", 17, 30]} />}
        <RestoreLostContext onLost={restartCanvas} />
        <FitCamera mode={mode} />
        <SceneLights isMobius={isMobius} shadowSize={touch ? 1024 : 2048} />

        {isMobius ? (
          <>
            <MobiusBoard
              board={board}
              selected={selected}
              validMoves={validMoves}
              lastMove={lastMove}
              checkedKing={checkedKing}
              playerColor={playerColor}
              onSquareClick={onSquareClick}
            />
            <CameraFollow
              move={lastMove}
              selected={selected}
              validMoves={validMoves}
              color={playerColor}
              turn={turn}
              twoPlayers={twoPlayers}
              enabled={followCamera}
            />
          </>
        ) : (
          <ClassicBoard
            board={board}
            selected={selected}
            validMoves={validMoves}
            lastMove={lastMove}
            checkedKing={checkedKing}
            onSquareClick={onSquareClick}
          />
        )}

        {!isMobius && (
          <ContactShadows position={[0, -0.34, 0]} opacity={0.35} scale={14} blur={2.4} far={6} frames={1} />
        )}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.075}
          minDistance={isMobius ? 9 : 6}
          maxDistance={isMobius ? 70 : 40}
          minPolarAngle={0.18}
          maxPolarAngle={Math.PI - 0.18}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
