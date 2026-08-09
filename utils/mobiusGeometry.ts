import * as THREE from "three";
import type { Position } from "../types";

export const MOBIUS_ROWS = 4;
export const MOBIUS_COLUMNS = 16;
export const MOBIUS_RADIUS = 4.25;
export const MOBIUS_WIDTH = 3.1;

export interface MobiusFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  normal: THREE.Vector3;
  tileLength: number;
  tileWidth: number;
}

export function getMobiusFrame({ x, y }: Position): MobiusFrame {
  const du = (Math.PI * 2) / MOBIUS_COLUMNS;
  const tileWidth = MOBIUS_WIDTH / MOBIUS_ROWS;
  const u = (x + 0.5) * du;
  const v = -MOBIUS_WIDTH / 2 + (y + 0.5) * tileWidth;
  const halfU = u / 2;
  const radiusAtV = MOBIUS_RADIUS + v * Math.cos(halfU);

  const position = new THREE.Vector3(
    radiusAtV * Math.cos(u),
    v * Math.sin(halfU),
    radiusAtV * Math.sin(u),
  );
  const tangentU = new THREE.Vector3(
    -radiusAtV * Math.sin(u) - (v * Math.sin(halfU) * Math.cos(u)) / 2,
    (v * Math.cos(halfU)) / 2,
    radiusAtV * Math.cos(u) - (v * Math.sin(halfU) * Math.sin(u)) / 2,
  ).normalize();
  const tangentV = new THREE.Vector3(
    Math.cos(halfU) * Math.cos(u),
    Math.sin(halfU),
    Math.cos(halfU) * Math.sin(u),
  ).normalize();
  const normal = new THREE.Vector3().crossVectors(tangentV, tangentU).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(tangentU, normal, tangentV),
  );

  return { position, quaternion, normal, tileLength: radiusAtV * du, tileWidth };
}
