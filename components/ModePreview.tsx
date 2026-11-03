import { Canvas, useFrame } from "@react-three/fiber";
import { type ReactNode, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { ClassicBoard } from "./ClassicBoard";
import { MobiusBoard } from "./MobiusBoard";
import { SceneLights } from "./SceneLights";
import type { GameMode } from "../types";
import { createInitialBoard } from "../utils/board";
import { canUseWebGL, isTouchDevice } from "../utils/device";

const TURN_SPEED = 0.18;
const ignoreClick = () => undefined;

function Turntable({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * TURN_SPEED;
  });
  return <group ref={group}>{children}</group>;
}

/** The real board on the home page: slowly turning, or standing still on a phone to save its battery. */
export function ModePreview({ mode }: { mode: GameMode }) {
  const board = useMemo(() => createInitialBoard(mode), [mode]);
  const isMobius = mode === "mobius";
  const [still] = useState(isTouchDevice);
  const [supported] = useState(canUseWebGL);
  if (!supported) return null;

  const scene = isMobius ? (
    <MobiusBoard
      board={board}
      selected={null}
      validMoves={[]}
      lastMove={null}
      checkedKing={null}
      playerColor="white"
      onSquareClick={ignoreClick}
    />
  ) : (
    <ClassicBoard
      board={board}
      selected={null}
      validMoves={[]}
      lastMove={null}
      checkedKing={null}
      onSquareClick={ignoreClick}
    />
  );

  return (
    <span className="mode-art" aria-hidden="true">
      <Canvas
        frameloop={still ? "demand" : "always"}
        dpr={still ? 1 : [1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: isMobius ? [0, 15, 15] : [0, 8.5, 9.5], fov: isMobius ? 39 : 42 }}
      >
        <SceneLights isMobius={isMobius} />
        {still ? scene : <Turntable>{scene}</Turntable>}
      </Canvas>
    </span>
  );
}
