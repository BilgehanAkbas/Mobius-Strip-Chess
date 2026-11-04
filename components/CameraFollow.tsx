import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AnimatedMove, PieceColor, Position } from "../types";
import { followDirection, isSquareVisibleFrom, mobiusViewQuaternion, openingDirection, placeCamera, selectionFocus, uprightView } from "../utils/mobiusView";
import { moveSettleTime } from "../utils/pieceMotion";

const ORBIT_SECONDS = 0.9;
const HOLD_SECONDS = 0.7;
const MIN_RADIUS = 20;
const MAX_FRAME_SECONDS = 1 / 20;

interface CameraPose {
  view: THREE.Quaternion;
  radius: number;
}

interface OrbitAnimation {
  from: CameraPose;
  to: CameraPose;
  /** Starts negative to hold still first. */
  elapsed: number;
  returnTo: CameraPose | null;
}

interface ControlsLike {
  addEventListener(type: "start", listener: () => void): void;
  removeEventListener(type: "start", listener: () => void): void;
}

interface CameraFollowProps {
  move: AnimatedMove | null;
  selected: Position | null;
  validMoves: Position[];
  color: PieceColor;
  turn: PieceColor;
  twoPlayers: boolean;
  enabled: boolean;
}

/**
 * Brings what matters into view. A move landing out of sight gets shown; for the bot's
 * move the camera then comes back, and with two players it turns to whoever is next.
 * A selection whose moves cannot be seen does the same. Grabbing the camera cancels it.
 */
export function CameraFollow({ move, selected, validMoves, color, turn, twoPlayers, enabled }: CameraFollowProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null;
  const invalidate = useThree((state) => state.invalidate);
  const animation = useRef<OrbitAnimation | null>(null);
  const inverseView = useMemo(() => mobiusViewQuaternion(color).invert(), [color]);

  const cameraInStripSpace = () => camera.position.clone().applyQuaternion(inverseView);

  const orbitTo = (direction: THREE.Vector3, delay: number, comeBack: boolean) => {
    const from = { view: camera.quaternion.clone(), radius: camera.position.length() };
    const to = { view: uprightView(direction), radius: Math.max(from.radius, MIN_RADIUS) };
    animation.current = { from, to, elapsed: -delay, returnTo: comeBack ? from : null };
    invalidate();
  };

  useLayoutEffect(() => {
    // A two-player game reloaded on the other player's turn opens on that player's army.
    if (!twoPlayers || turn === color) return;
    placeCamera(camera, uprightView(openingDirection(turn, color)), camera.position.length());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = move?.movements[0]?.to;
    if (!enabled || !move || !target) return;
    if (twoPlayers) {
      orbitTo(openingDirection(move.color === "white" ? "black" : "white", color), moveSettleTime(move), false);
      return;
    }
    if (isSquareVisibleFrom(target, cameraInStripSpace())) return;
    orbitTo(followDirection(target, color), 0, move.color !== color);
  }, [enabled, move]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !selected) return;
    const focus = selectionFocus(selected, validMoves, cameraInStripSpace());
    if (focus) orbitTo(followDirection(focus, color), 0, false);
  }, [enabled, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) animation.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      animation.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((state, delta) => {
    const current = animation.current;
    if (!current || !controls) return;
    state.invalidate();
    current.elapsed = Math.min(ORBIT_SECONDS, current.elapsed + Math.min(delta, MAX_FRAME_SECONDS));
    const t = THREE.MathUtils.smootherstep(current.elapsed / ORBIT_SECONDS, 0, 1);
    placeCamera(
      camera,
      current.from.view.clone().slerp(current.to.view, t),
      THREE.MathUtils.lerp(current.from.radius, current.to.radius, t),
    );
    if (current.elapsed < ORBIT_SECONDS) return;
    animation.current = current.returnTo
      ? { from: current.to, to: current.returnTo, elapsed: -HOLD_SECONDS, returnTo: null }
      : null;
  });

  return null;
}
