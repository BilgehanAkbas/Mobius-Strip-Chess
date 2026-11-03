import { useFrame } from "@react-three/fiber";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { Object3D } from "three";
import type { PieceMovement } from "../types";
import { motionDuration, motionPoint } from "../utils/pieceMotion";

const SHRINK_SECONDS = 0.18;
// The scene only draws when asked to, so the first frame of a motion can report a long idle gap.
const MAX_FRAME_SECONDS = 1 / 20;

export type PlacePiece = (object: Object3D, x: number, y: number, lift: number) => void;

interface MovingPieceProps {
  movement: PieceMovement;
  place: PlacePiece;
  scale?: number;
  onClick: () => void;
  children: ReactNode;
}

/** Plays one move once, then rests on the target square. Remount it to play another. */
export function MovingPiece({ movement, place, scale = 1, onClick, children }: MovingPieceProps) {
  const group = useRef<Object3D>(null);
  const elapsed = useRef(0);
  const duration = motionDuration(movement);

  useLayoutEffect(() => {
    if (group.current) place(group.current, movement.from.x, movement.from.y, 0);
  }, [movement, place]);

  useFrame((state, delta) => {
    if (!group.current || elapsed.current >= duration) return;
    elapsed.current = Math.min(duration, elapsed.current + Math.min(delta, MAX_FRAME_SECONDS));
    const { x, y, lift } = motionPoint(movement, elapsed.current / duration);
    place(group.current, x, y, lift);
    state.invalidate();
  });

  return (
    <group
      ref={group}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </group>
  );
}

/** A captured piece stays until the attacker arrives, then shrinks away. */
export function CapturedPiece({ delay, children }: { delay: number; children: ReactNode }) {
  const group = useRef<Object3D>(null);
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!group.current || !group.current.visible) return;
    elapsed.current += Math.min(delta, MAX_FRAME_SECONDS);
    const progress = (elapsed.current - delay) / SHRINK_SECONDS;
    if (progress >= 1) group.current.visible = false;
    else if (progress > 0) group.current.scale.setScalar(1 - progress);
    state.invalidate();
  });

  return <group ref={group}>{children}</group>;
}
