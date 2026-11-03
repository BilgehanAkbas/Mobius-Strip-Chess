import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Position } from "../types";
import {
  buildMobiusEdgeGeometry,
  buildMobiusStripGeometry,
  getMobiusFrame,
  MOBIUS_COLUMNS,
  MOBIUS_PIECE_SCALE,
  MOBIUS_ROWS,
  MOBIUS_THICKNESS,
  mobiusSquareFromFace,
} from "./mobiusGeometry";
import { tallestPieceHeight } from "./pieceGeometry";

const TALLEST_PIECE = tallestPieceHeight() * MOBIUS_PIECE_SCALE;

const SQUARES: Position[] = Array.from({ length: MOBIUS_COLUMNS * MOBIUS_ROWS }, (_, index) => ({
  x: Math.floor(index / MOBIUS_ROWS),
  y: index % MOBIUS_ROWS,
}));

function vertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const attribute = geometry.getAttribute("position");
  return Array.from({ length: attribute.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(attribute, index));
}

/** Gives vertices at the same spot one shared id, tolerant of float rounding. */
function weld(points: THREE.Vector3[], tolerance = 1e-3): number[] {
  const buckets = new Map<string, number[]>();
  const bucketOf = (value: number) => Math.floor(value / tolerance);
  return points.map((point, index) => {
    const [bx, by, bz] = [bucketOf(point.x), bucketOf(point.y), bucketOf(point.z)];
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      for (const other of buckets.get(`${bx + dx},${by + dy},${bz + dz}`) ?? []) {
        if (points[other].distanceTo(point) < tolerance) return other;
      }
    }
    const key = `${bx},${by},${bz}`;
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
    return index;
  });
}

function pointOnAxis(square: Position, height: number): THREE.Vector3 {
  const { position, normal } = getMobiusFrame(square);
  return position.clone().addScaledVector(normal, height);
}

describe("mobius surface", () => {
  it("returns to the same place after 16 columns", () => {
    for (const square of SQUARES) {
      const start = getMobiusFrame(square);
      const lap = getMobiusFrame({ x: square.x + MOBIUS_COLUMNS, y: square.y });
      expect(start.position.distanceTo(lap.position)).toBeLessThan(1e-6);
      expect(start.normal.distanceTo(lap.normal)).toBeLessThan(1e-6);
    }
  });

  it("puts each square back to back with one 8 columns away on the flipped row", () => {
    for (const square of SQUARES) {
      const front = getMobiusFrame(square);
      const back = getMobiusFrame({ x: square.x + 8, y: MOBIUS_ROWS - 1 - square.y });
      expect(front.position.distanceTo(back.position)).toBeCloseTo(MOBIUS_THICKNESS, 5);
      expect(front.normal.dot(back.normal)).toBeCloseTo(-1, 5);
    }
  });

  it("gives squares that are back to back opposite colours", () => {
    for (const { x, y } of SQUARES) {
      expect((x + 8 + (MOBIUS_ROWS - 1 - y)) % 2).not.toBe((x + y) % 2);
    }
  });

  it("has no jump between neighbouring squares, seam included", () => {
    for (const { x, y } of SQUARES) {
      const here = getMobiusFrame({ x, y });
      const next = getMobiusFrame({ x: (x + 1) % MOBIUS_COLUMNS, y });
      const distance = here.position.distanceTo(next.position);
      expect(distance).toBeGreaterThan(1);
      expect(distance).toBeLessThan(5.5);
      expect(here.normal.dot(next.normal)).toBeGreaterThan(0.4);
    }
  });

  it("closes into one sheet whose only open edges are the strip edge", () => {
    const geometry = buildMobiusStripGeometry();
    const welded = weld(vertices(geometry));
    const edgeUse = new Map<string, number>();
    const index = geometry.getIndex()!;
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const edge = [welded[index.getX(triangle + a)], welded[index.getX(triangle + b)]].sort((p, q) => p - q).join("|");
        edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
      }
    }
    const open = [...edgeUse.values()].filter((count) => count === 1).length;
    expect(open).toBe(MOBIUS_COLUMNS * 18 * 2);
    expect([...edgeUse.values()].every((count) => count <= 2)).toBe(true);
  });

  it("builds a closed rim tube", () => {
    const points = vertices(buildMobiusEdgeGeometry());
    for (let j = 0; j <= 12; j += 1) {
      expect(points[j].distanceTo(points[points.length - 13 + j])).toBeLessThan(1e-4);
    }
  });
});

describe("mobius squares and pieces", () => {
  it("maps a click on the surface to the right square", () => {
    const mesh = new THREE.Mesh(buildMobiusStripGeometry(), new THREE.MeshBasicMaterial());
    const raycaster = new THREE.Raycaster();
    for (const square of SQUARES) {
      const { position, normal } = getMobiusFrame(square);
      raycaster.set(position.clone().addScaledVector(normal, 0.3), normal.clone().negate());
      const [hit] = raycaster.intersectObject(mesh);
      expect(mobiusSquareFromFace(hit.faceIndex!)).toEqual(square);
    }
  });

  it("keeps every piece clear of the strip", () => {
    const sheet = vertices(buildMobiusStripGeometry());
    let closest = Infinity;
    for (const square of SQUARES) {
      for (const height of [0.5, 0.8, TALLEST_PIECE]) {
        const point = pointOnAxis(square, height);
        for (const vertex of sheet) closest = Math.min(closest, point.distanceToSquared(vertex));
      }
    }
    expect(Math.sqrt(closest)).toBeGreaterThan(0.45);
  });

  it("keeps pieces on different squares from touching", () => {
    // Pairs of tallest pieces, measured against the widest they get at each height.
    const levels = [
      { height: 0.04 * MOBIUS_PIECE_SCALE, clearance: 2 * 0.347 * MOBIUS_PIECE_SCALE },
      { height: 0.6 * MOBIUS_PIECE_SCALE, clearance: 2 * 0.22 * MOBIUS_PIECE_SCALE },
      { height: 1.0 * MOBIUS_PIECE_SCALE, clearance: 2 * 0.2 * MOBIUS_PIECE_SCALE },
      { height: TALLEST_PIECE, clearance: 2 * 0.09 * MOBIUS_PIECE_SCALE },
    ];
    const normals = SQUARES.map((square) => getMobiusFrame(square).normal);
    const centers = SQUARES.map((square) => getMobiusFrame(square).position);
    for (let a = 0; a < SQUARES.length; a += 1) {
      for (let b = a + 1; b < SQUARES.length; b += 1) {
        // Pieces standing back to back have the strip between them.
        if (normals[a].dot(normals[b]) < 0 && centers[a].distanceTo(centers[b]) < 1) continue;
        for (const { height, clearance } of levels) {
          expect(pointOnAxis(SQUARES[a], height).distanceTo(pointOnAxis(SQUARES[b], height))).toBeGreaterThan(clearance);
        }
      }
    }
  });
});
