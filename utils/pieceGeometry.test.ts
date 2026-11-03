import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { PieceType } from "../types";
import { getPieceGeometry } from "./pieceGeometry";

const TYPES: PieceType[] = ["pawn", "rook", "knight", "bishop", "queen", "king"];

describe.each(TYPES)("%s geometry", (type) => {
  const { body } = getPieceGeometry(type);
  const positions = body.getAttribute("position");
  const normals = body.getAttribute("normal");

  it("stands on the board", () => {
    expect(body.boundingBox!.min.y).toBeCloseTo(0, 5);
  });

  it("fits inside one square", () => {
    let widest = 0;
    for (let index = 0; index < positions.count; index += 1) {
      widest = Math.max(widest, Math.hypot(positions.getX(index), positions.getZ(index)));
    }
    expect(widest).toBeLessThan(0.48);
  });

  it("has no broken values", () => {
    for (let index = 0; index < positions.count; index += 1) {
      expect(Number.isFinite(positions.getX(index) + positions.getY(index) + positions.getZ(index))).toBe(true);
      expect(Number.isFinite(normals.getX(index) + normals.getY(index) + normals.getZ(index))).toBe(true);
    }
  });

  it("has no unlit vertices", () => {
    const normal = new THREE.Vector3();
    let unlit = 0;
    for (let index = 0; index < normals.count; index += 1) {
      if (normal.fromBufferAttribute(normals, index).length() < 0.5) unlit += 1;
    }
    expect(unlit).toBe(0);
  });

  it("faces outward", () => {
    const [a, b, c, normal] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const faceNormal = new THREE.Vector3();
    let agree = 0;
    let total = 0;
    for (let index = 0; index + 2 < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index);
      b.fromBufferAttribute(positions, index + 1);
      c.fromBufferAttribute(positions, index + 2);
      faceNormal.crossVectors(b.sub(a), c.sub(a));
      if (faceNormal.lengthSq() < 1e-12) continue;
      normal.fromBufferAttribute(normals, index);
      total += 1;
      if (faceNormal.dot(normal) > 0) agree += 1;
    }
    expect(agree / total).toBeGreaterThan(0.98);
  });
});

describe("piece heights", () => {
  const height = (type: PieceType) => getPieceGeometry(type).body.boundingBox!.max.y;

  it("rank from pawn up to king", () => {
    expect(height("pawn")).toBeLessThan(height("rook"));
    expect(height("rook")).toBeLessThan(height("bishop"));
    expect(height("knight")).toBeLessThan(height("bishop"));
    expect(height("bishop")).toBeLessThan(height("queen"));
    expect(height("queen")).toBeLessThan(height("king"));
  });

  it("reuses geometry between calls", () => {
    expect(getPieceGeometry("rook")).toBe(getPieceGeometry("rook"));
  });
});
