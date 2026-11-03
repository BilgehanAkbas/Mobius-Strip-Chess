import { type FC } from "react";
import * as THREE from "three";
import type { PieceColor, PieceData } from "../types";
import { getPieceGeometry } from "../utils/pieceGeometry";

const MATERIALS: Record<PieceColor, { body: THREE.Material; accent: THREE.Material }> = {
  white: {
    body: new THREE.MeshPhysicalMaterial({ color: "#efe7dc", roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.45 }),
    accent: new THREE.MeshStandardMaterial({ color: "#6e645c", roughness: 0.6 }),
  },
  black: {
    body: new THREE.MeshPhysicalMaterial({ color: "#3b2c28", roughness: 0.36, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32 }),
    accent: new THREE.MeshStandardMaterial({ color: "#120d0b", roughness: 0.5 }),
  },
};

interface PieceProps {
  data: PieceData;
  /** Rotation around the piece's own axis. Pieces face +x at 0. */
  yaw?: number;
}

export const Piece: FC<PieceProps> = ({ data, yaw = 0 }) => {
  const { body, accent } = getPieceGeometry(data.type);
  const materials = MATERIALS[data.color];
  return (
    <group rotation={[0, yaw, 0]}>
      <mesh geometry={body} material={materials.body} castShadow receiveShadow />
      {accent && <mesh geometry={accent} material={materials.accent} />}
    </group>
  );
};
