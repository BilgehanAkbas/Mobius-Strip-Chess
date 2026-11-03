import * as THREE from "three";
import type { Position } from "../types";
import { MOBIUS_COLUMNS, MOBIUS_ROWS } from "./boardSize";

export { MOBIUS_COLUMNS, MOBIUS_ROWS };
const MOBIUS_COLUMNS_PER_LOOP = 8;
const MOBIUS_RADIUS = 4.2;
const MOBIUS_WIDTH = 4.8;
export const MOBIUS_THICKNESS = 0.14;
export const MOBIUS_PIECE_SCALE = 1.4;

const COLUMN_ANGLE = (Math.PI * 2) / MOBIUS_COLUMNS_PER_LOOP;
const ROW_WIDTH = MOBIUS_WIDTH / MOBIUS_ROWS;
const RIM_RADIUS = 0.1;

// The half twist is gathered around one spot, leaving the rest of the ring nearly flat.
export const TWIST_CENTER = 3.1;
const TWIST_GATHERING = 0.42;

const CELL_U_SEGMENTS = 18;
const CELL_V_SEGMENTS = 6;
const TRIANGLES_PER_CELL = CELL_U_SEGMENTS * CELL_V_SEGMENTS * 2;

const LIGHT_COLOR = new THREE.Color("#f1ecef");
const DARK_COLOR = new THREE.Color("#b9bfd0");
const UP = new THREE.Vector3(0, 1, 0);

export interface MobiusFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  normal: THREE.Vector3;
}

interface SurfaceSample {
  point: THREE.Vector3;
  tangentU: THREE.Vector3;
  across: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * u runs over 4π: one lap covers a face, the next lap covers the back of it. After
 * 2π the width direction and normal have flipped, which is what joins the two faces.
 */
function sampleSurface(u: number, v: number): SurfaceSample {
  const offset = u - TWIST_CENTER + Math.PI;
  const twist = offset / 2 - TWIST_GATHERING * Math.sin(offset);
  const twistRate = 0.5 - TWIST_GATHERING * Math.cos(offset);
  const radial = new THREE.Vector3(Math.cos(u), 0, Math.sin(u));
  const along = new THREE.Vector3(-Math.sin(u), 0, Math.cos(u));
  const across = radial.clone().multiplyScalar(Math.cos(twist)).addScaledVector(UP, Math.sin(twist));
  const acrossRate = radial.clone().multiplyScalar(-Math.sin(twist) * twistRate)
    .addScaledVector(UP, Math.cos(twist) * twistRate)
    .addScaledVector(along, Math.cos(twist));
  const tangentU = along.clone().multiplyScalar(MOBIUS_RADIUS).addScaledVector(acrossRate, v);
  const normal = new THREE.Vector3().crossVectors(tangentU, across).normalize();
  const point = radial.clone().multiplyScalar(MOBIUS_RADIUS).addScaledVector(across, v);
  return { point, tangentU, across, normal };
}

function columnU(column: number): number {
  return column * COLUMN_ANGLE;
}

/** Row 0 is the outer edge on white's face. */
function rowV(row: number): number {
  return MOBIUS_WIDTH / 2 - row * ROW_WIDTH;
}

export function getMobiusFrame({ x, y }: Position): MobiusFrame {
  const { point, tangentU, normal } = sampleSurface(columnU(x + 0.5), rowV(y + 0.5));
  const xAxis = tangentU.clone().normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, normal);
  return {
    position: point.addScaledVector(normal, MOBIUS_THICKNESS / 2),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, normal, zAxis)),
    normal,
  };
}

export function mobiusSquareFromFace(faceIndex: number): Position {
  const cell = Math.floor(faceIndex / TRIANGLES_PER_CELL);
  return { x: Math.floor(cell / MOBIUS_ROWS), y: cell % MOBIUS_ROWS };
}

function pushGrid(
  positions: number[],
  normals: number[],
  indices: number[],
  uSegments: number,
  vSegments: number,
  vertexAt: (i: number, j: number) => { position: THREE.Vector3; normal: THREE.Vector3 },
) {
  const start = positions.length / 3;
  for (let i = 0; i <= uSegments; i += 1) {
    for (let j = 0; j <= vSegments; j += 1) {
      const { position, normal } = vertexAt(i, j);
      positions.push(position.x, position.y, position.z);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const stride = vSegments + 1;
  for (let i = 0; i < uSegments; i += 1) {
    for (let j = 0; j < vSegments; j += 1) {
      const a = start + i * stride + j;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
}

function toGeometry(positions: number[], normals: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** One sheet over the full 4π. It closes on itself, so there is no seam to hide. */
export function buildMobiusStripGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let x = 0; x < MOBIUS_COLUMNS; x += 1) {
    for (let y = 0; y < MOBIUS_ROWS; y += 1) {
      const color = (x + y) % 2 === 0 ? LIGHT_COLOR : DARK_COLOR;
      pushGrid(positions, normals, indices, CELL_U_SEGMENTS, CELL_V_SEGMENTS, (i, j) => {
        const u = columnU(x + i / CELL_U_SEGMENTS);
        const v = rowV(y + 1 - j / CELL_V_SEGMENTS);
        const { point, normal } = sampleSurface(u, v);
        colors.push(color.r, color.g, color.b);
        return { position: point.addScaledVector(normal, MOBIUS_THICKNESS / 2), normal };
      });
    }
  }

  const geometry = toGeometry(positions, normals, indices);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** The strip has a single edge, so one tube over 4π covers both visible rims. */
export function buildMobiusEdgeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  pushGrid(positions, normals, indices, 640, 12, (i, j) => {
    const { point, across, normal } = sampleSurface((i / 640) * Math.PI * 4, MOBIUS_WIDTH / 2);
    const angle = (j / 12) * Math.PI * 2;
    const radial = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(across, Math.sin(angle)).normalize();
    return { position: point.addScaledVector(radial, RIM_RADIUS), normal: radial };
  });
  return toGeometry(positions, normals, indices);
}

/** A curved copy of a square, lifted just above the surface. */
export function buildMobiusSquareGeometry({ x, y }: Position, inset = 0.03, lift = 0.012): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  pushGrid(positions, normals, indices, 18, 6, (i, j) => {
    const u = columnU(x + inset + (i / 18) * (1 - inset * 2));
    const v = rowV(y + 1 - inset - (j / 6) * (1 - inset * 2));
    const { point, normal } = sampleSurface(u, v);
    return { position: point.addScaledVector(normal, MOBIUS_THICKNESS / 2 + lift), normal };
  });
  return toGeometry(positions, normals, indices);
}

/** A disc or ring measured in world units that follows the surface around a square's centre. */
export function buildMobiusMarkerGeometry({ x, y }: Position, innerRadius: number, outerRadius: number, lift = 0.016): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const centerU = columnU(x + 0.5);
  const centerV = rowV(y + 0.5);
  const unitsPerU = sampleSurface(centerU, centerV).tangentU.length();
  pushGrid(positions, normals, indices, 3, 40, (i, j) => {
    const radius = innerRadius + (i / 3) * (outerRadius - innerRadius);
    const angle = (j / 40) * Math.PI * 2;
    const { point, normal } = sampleSurface(centerU + (radius * Math.cos(angle)) / unitsPerU, centerV + radius * Math.sin(angle));
    return { position: point.addScaledVector(normal, MOBIUS_THICKNESS / 2 + lift), normal };
  });
  return toGeometry(positions, normals, indices);
}
