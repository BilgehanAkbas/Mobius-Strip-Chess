import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PieceType } from "../types";

// Every piece stands on y = 0, is measured in board squares and faces +x.

type ProfilePoint = [number, number];

const LATHE_SEGMENTS = 40;

export interface PieceGeometry {
  body: THREE.BufferGeometry;
  accent?: THREE.BufferGeometry;
}

function spline(...controls: ProfilePoint[]): ProfilePoint[] {
  return new THREE.SplineCurve(controls.map(([x, y]) => new THREE.Vector2(x, y)))
    .getPoints(controls.length * 5)
    .map((point) => [Math.max(point.x, 0), point.y]);
}

function arc(centerY: number, radius: number, fromDegrees: number, toDegrees: number, steps = 12): ProfilePoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = THREE.MathUtils.degToRad(fromDegrees + ((toDegrees - fromDegrees) * index) / steps);
    return [Math.max(radius * Math.cos(angle), 0), centerY + radius * Math.sin(angle)];
  });
}

function foot(radius: number): ProfilePoint[] {
  return [[0, 0], [radius, 0], [radius * 1.02, 0.025], [radius, 0.06], [radius * 0.92, 0.085], [radius * 0.78, 0.11]];
}

function lathe(...sections: ProfilePoint[][]): THREE.BufferGeometry {
  const points = sections.flat()
    .filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1])
    .map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(points, LATHE_SEGMENTS);
  // LatheGeometry leaves the last ring's normals unnormalized, which renders the tip black.
  geometry.normalizeNormals();
  return geometry;
}

function box(width: number, height: number, depth: number, x: number, y: number, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

function sphere(radius: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, 16, 12).translate(x, y, z);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute("uv");
    return flat;
  });
  const merged = mergeGeometries(prepared);
  if (!merged) throw new Error("Piece parts could not be merged");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function pawn(): PieceGeometry {
  return {
    body: merge([
      lathe(
        foot(0.27),
        spline([0.21, 0.11], [0.15, 0.17], [0.105, 0.28], [0.085, 0.4]),
        [[0.135, 0.43], [0.14, 0.45], [0.125, 0.47], [0.085, 0.485]],
        arc(0.6, 0.135, -58, 90),
      ),
    ]),
  };
}

function rookMerlon(startAngle: number, sweep: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.235, startAngle, startAngle + sweep, false);
  shape.absarc(0, 0, 0.17, startAngle + sweep, startAngle, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 8 })
    .rotateX(-Math.PI / 2)
    .translate(0, 0.82, 0);
}

function rook(): PieceGeometry {
  const merlons = Array.from({ length: 6 }, (_, index) => rookMerlon((index * Math.PI) / 3, THREE.MathUtils.degToRad(38)));
  return {
    body: merge([
      lathe(
        foot(0.31),
        spline([0.24, 0.11], [0.185, 0.2], [0.16, 0.38], [0.165, 0.56]),
        [[0.215, 0.6], [0.22, 0.625], [0.19, 0.645]],
        spline([0.19, 0.65], [0.205, 0.72], [0.235, 0.78]),
        [[0.235, 0.82], [0.17, 0.82], [0.17, 0.76], [0, 0.76]],
      ),
      ...merlons,
    ]),
  };
}

function bishop(): PieceGeometry {
  const mitre = spline([0.1, 0.75], [0.145, 0.84], [0.15, 0.92], [0.11, 1.02], [0.055, 1.09]);
  const radiusAt = (y: number) => mitre.find((point) => point[1] >= y)?.[0] ?? 0;
  // The cut in the mitre, drawn as a thin line that follows the surface.
  const cut = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const angle = -0.55 + t * 1.1;
    const y = 0.9 + t * 0.13;
    const radius = radiusAt(y) + 0.001;
    return new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle));
  });
  return {
    body: merge([
      lathe(
        foot(0.3),
        spline([0.234, 0.11], [0.16, 0.2], [0.11, 0.42], [0.095, 0.66]),
        [[0.16, 0.69], [0.168, 0.715], [0.15, 0.735], [0.1, 0.75]],
        mitre,
        arc(1.12, 0.05, -60, 90),
      ),
    ]),
    accent: merge([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cut), 24, 0.008, 6)]),
  };
}

interface LoftStation {
  x: number;
  y: number;
  /** Half size in the x-y plane, across the spine. */
  depth: number;
  /** Half size along z. */
  width: number;
}

/** Skins ellipses along a spine in the x-y plane, for organic forms a lathe cannot make. */
function loft(stations: LoftStation[], rings: number, segments = 20): THREE.BufferGeometry {
  const spine = new THREE.SplineCurve(stations.map(({ x, y }) => new THREE.Vector2(x, y)));
  const depth = new THREE.SplineCurve(stations.map((station, index) => new THREE.Vector2(index, station.depth)));
  const width = new THREE.SplineCurve(stations.map((station, index) => new THREE.Vector2(index, station.width)));
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const center = spine.getPoint(t);
    const tangent = spine.getTangent(t);
    const halfDepth = Math.max(depth.getPoint(t).y, 0);
    const halfWidth = Math.max(width.getPoint(t).y, 0);
    for (let j = 0; j < segments; j += 1) {
      const angle = (j / segments) * Math.PI * 2;
      positions.push(
        center.x - tangent.y * halfDepth * Math.cos(angle),
        center.y + tangent.x * halfDepth * Math.cos(angle),
        halfWidth * Math.sin(angle),
      );
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * segments + j;
      const b = i * segments + (j + 1) % segments;
      const c = a + segments;
      const d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function knightHead(): THREE.BufferGeometry {
  return loft([
    { x: -0.01, y: 0.31, depth: 0, width: 0 },
    { x: -0.02, y: 0.33, depth: 0.16, width: 0.125 },
    { x: -0.05, y: 0.48, depth: 0.165, width: 0.112 },
    { x: -0.06, y: 0.62, depth: 0.155, width: 0.098 },
    { x: -0.04, y: 0.76, depth: 0.14, width: 0.088 },
    { x: 0.015, y: 0.875, depth: 0.122, width: 0.084 },
    { x: 0.09, y: 0.875, depth: 0.112, width: 0.08 },
    { x: 0.17, y: 0.79, depth: 0.09, width: 0.068 },
    { x: 0.24, y: 0.705, depth: 0.072, width: 0.058 },
    { x: 0.285, y: 0.645, depth: 0.06, width: 0.052 },
    { x: 0.31, y: 0.615, depth: 0.032, width: 0.03 },
    { x: 0.315, y: 0.61, depth: 0, width: 0 },
  ], 56);
}

function knightMane(): THREE.BufferGeometry {
  const outline: ProfilePoint[] = [
    [-0.17, 0.36], [-0.245, 0.48], [-0.25, 0.64], [-0.195, 0.8], [-0.11, 0.95], [-0.03, 1.03],
    [0, 0.97], [-0.07, 0.82], [-0.11, 0.62], [-0.11, 0.42],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  shape.splineThru(outline.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  const mane = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 3,
  }).translate(0, 0, -0.015);
  return toCreasedNormals(mane, Math.PI / 2.4);
}

function knightEar(z: number): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.03, 0.135, 12).rotateZ(-0.12).rotateX(z > 0 ? 0.14 : -0.14).translate(0.018, 1.03, z);
}

function knight(): PieceGeometry {
  return {
    body: merge([
      lathe(
        foot(0.3),
        spline([0.234, 0.11], [0.19, 0.18], [0.165, 0.28]),
        [[0.2, 0.3], [0.205, 0.325], [0.16, 0.345], [0, 0.35]],
      ),
      knightHead(),
      knightMane(),
      knightEar(0.045),
      knightEar(-0.045),
    ]),
    accent: merge([
      sphere(0.019, 0.125, 0.875, 0.066),
      sphere(0.019, 0.125, 0.875, -0.066),
      sphere(0.011, 0.285, 0.655, 0.045),
      sphere(0.011, 0.285, 0.655, -0.045),
    ]),
  };
}

function queen(): PieceGeometry {
  const coronet = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    return sphere(0.034, 0.195 * Math.cos(angle), 1.205, 0.195 * Math.sin(angle));
  });
  return {
    body: merge([
      lathe(
        foot(0.33),
        spline([0.257, 0.11], [0.18, 0.2], [0.125, 0.46], [0.105, 0.82]),
        [[0.175, 0.85], [0.185, 0.875], [0.16, 0.895], [0.115, 0.91]],
        spline([0.115, 0.91], [0.14, 1.0], [0.205, 1.16]),
        [[0.21, 1.18], [0.17, 1.19]],
        spline([0.17, 1.19], [0.12, 1.24], [0.06, 1.29]),
        arc(1.32, 0.055, -60, 90),
      ),
      ...coronet,
    ]),
  };
}

function king(): PieceGeometry {
  return {
    body: merge([
      lathe(
        foot(0.34),
        spline([0.265, 0.11], [0.19, 0.2], [0.13, 0.5], [0.11, 0.9]),
        [[0.185, 0.93], [0.195, 0.96], [0.17, 0.98], [0.12, 0.995]],
        spline([0.12, 0.995], [0.145, 1.09], [0.2, 1.22]),
        [[0.205, 1.24], [0.165, 1.25]],
        spline([0.165, 1.25], [0.12, 1.31], [0.055, 1.35]),
        [[0.04, 1.36], [0, 1.365]],
      ),
      box(0.055, 0.22, 0.055, 0, 1.46),
      box(0.165, 0.055, 0.055, 0, 1.49),
    ]),
  };
}

const BUILDERS: Record<PieceType, () => PieceGeometry> = { pawn, rook, knight, bishop, queen, king };
const cache = new Map<PieceType, PieceGeometry>();

/** Geometry is shared between all pieces of a type. */
export function getPieceGeometry(type: PieceType): PieceGeometry {
  let geometry = cache.get(type);
  if (!geometry) {
    geometry = BUILDERS[type]();
    cache.set(type, geometry);
  }
  return geometry;
}

export function tallestPieceHeight(): number {
  return getPieceGeometry("king").body.boundingBox!.max.y;
}
