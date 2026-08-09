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

function mobiusPoint(u: number, v: number): THREE.Vector3 {
  const halfU = u / 2;
  const radiusAtV = MOBIUS_RADIUS + v * Math.cos(halfU);
  return new THREE.Vector3(
    radiusAtV * Math.cos(u),
    v * Math.sin(halfU),
    radiusAtV * Math.sin(u),
  );
}

function mobiusNormal(u: number, v: number): THREE.Vector3 {
  const halfU = u / 2;
  const radiusAtV = MOBIUS_RADIUS + v * Math.cos(halfU);
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
  return new THREE.Vector3().crossVectors(tangentV, tangentU).normalize();
}

const LIGHT_COLOR = new THREE.Color("#e7d9ba");
const DARK_COLOR = new THREE.Color("#315c5d");

export function buildMobiusStripGeometry(
  uSubdiv = 8,
  vSubdiv = 3,
): THREE.BufferGeometry {
  const duCell = (Math.PI * 2) / MOBIUS_COLUMNS;
  const dvCell = MOBIUS_WIDTH / MOBIUS_ROWS;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const pushVertex = (u: number, v: number, color: THREE.Color) => {
    const p = mobiusPoint(u, v);
    const n = mobiusNormal(u, v);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
    colors.push(color.r, color.g, color.b);
  };

  for (let col = 0; col < MOBIUS_COLUMNS; col++) {
    for (let row = 0; row < MOBIUS_ROWS; row++) {
      const color = (col + row) % 2 === 0 ? LIGHT_COLOR : DARK_COLOR;
      for (let su = 0; su < uSubdiv; su++) {
        const u0 = col * duCell + (su / uSubdiv) * duCell;
        const u1 = col * duCell + ((su + 1) / uSubdiv) * duCell;
        for (let sv = 0; sv < vSubdiv; sv++) {
          const v0 = -MOBIUS_WIDTH / 2 + row * dvCell + (sv / vSubdiv) * dvCell;
          const v1 = -MOBIUS_WIDTH / 2 + row * dvCell + ((sv + 1) / vSubdiv) * dvCell;
          pushVertex(u0, v0, color);
          pushVertex(u1, v0, color);
          pushVertex(u1, v1, color);
          pushVertex(u0, v0, color);
          pushVertex(u1, v1, color);
          pushVertex(u0, v1, color);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}