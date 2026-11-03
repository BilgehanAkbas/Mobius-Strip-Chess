import * as THREE from "three";
import type { PieceColor, Position } from "../types";
import { buildMobiusStripGeometry, getMobiusFrame, TWIST_CENTER } from "./mobiusGeometry";

export const MOBIUS_CAMERA_POSITION: [number, number, number] = [0, 17, 17];

const MIN_POLAR_ANGLE = 0.18;
// A surface seen more edge-on than this shrinks a move marker to a sliver.
const MIN_FACING = 0.3;
const FOLLOW_RADIUS = new THREE.Vector3(...MOBIUS_CAMERA_POSITION).length();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Tried in order: from across the ring first, because that shows the most of the board.
const FOLLOW_TILTS: [number, number][] = [
  [-0.7, 0], [0, 0], [-0.7, 0.8], [-0.7, -0.8], [0.7, 0], [0, 0.8], [0, -0.8], [0.7, 0.8], [0.7, -0.8],
  [-1.4, 0], [1.4, 0], [0, 1.6], [0, -1.6],
];

const WHITE_YAW = Math.PI + 0.85;
const BLACK_YAW = 2.3;

/**
 * Turning the strip half a turn around the axis through its twist maps it onto itself
 * but swaps the faces, so black gets the same well-lit view of its own army.
 */
export function mobiusViewQuaternion(color: PieceColor): THREE.Quaternion {
  if (color === "white") return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, WHITE_YAW);
  const twistAxis = new THREE.Vector3(Math.cos(TWIST_CENTER), 0, Math.sin(TWIST_CENTER));
  return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, BLACK_YAW)
    .multiply(new THREE.Quaternion().setFromAxisAngle(twistAxis, Math.PI));
}

let stripMesh: THREE.Mesh | null = null;
const raycaster = new THREE.Raycaster();

function strip(): THREE.Mesh {
  stripMesh ??= new THREE.Mesh(buildMobiusStripGeometry(), new THREE.MeshBasicMaterial());
  return stripMesh;
}

/** Can a camera at this position, in the strip's own space, see a piece on the square? */
export function isSquareVisibleFrom(square: Position, camera: THREE.Vector3): boolean {
  const { position, normal } = getMobiusFrame(square);
  const point = position.addScaledVector(normal, 0.5);
  const toCamera = camera.clone().sub(point);
  const distance = toCamera.length();
  toCamera.normalize();
  if (normal.dot(toCamera) < MIN_FACING) return false;
  raycaster.set(point, toCamera);
  raycaster.far = distance;
  return raycaster.intersectObject(strip()).length === 0;
}

function clampPolar(direction: THREE.Vector3): THREE.Vector3 {
  const spherical = new THREE.Spherical().setFromVector3(direction);
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, MIN_POLAR_ANGLE, Math.PI - MIN_POLAR_ANGLE);
  return new THREE.Vector3().setFromSpherical(spherical);
}

/** The orbit that gives a player the same view of their army as their opening camera, whichever way the strip is held. */
export function openingDirection(player: PieceColor, viewColor: PieceColor): THREE.Vector3 {
  return clampPolar(new THREE.Vector3(...MOBIUS_CAMERA_POSITION)
    .applyQuaternion(mobiusViewQuaternion(player).invert())
    .applyQuaternion(mobiusViewQuaternion(viewColor))
    .normalize());
}

/** What the camera should bring into view after a selection, if anything needs it. */
export function selectionFocus(selected: Position, moves: Position[], camera: THREE.Vector3): Position | null {
  if (moves.length && !moves.some((move) => isSquareVisibleFrom(move, camera))) return moves[0];
  return isSquareVisibleFrom(selected, camera) ? null : selected;
}

/** A world-space direction to orbit the camera to, so that a piece on the square can be seen. */
export function followDirection(square: Position, color: PieceColor): THREE.Vector3 {
  const view = mobiusViewQuaternion(color);
  const inverse = view.clone().invert();
  const { position, normal } = getMobiusFrame(square);
  const outward = new THREE.Vector3(position.x, 0, position.z).normalize();
  const along = new THREE.Vector3().crossVectors(Y_AXIS, outward);
  const candidates = FOLLOW_TILTS.map(([acrossRing, alongRing]) => (
    normal.clone().addScaledVector(outward, acrossRing).addScaledVector(along, alongRing)
  ));
  for (const candidate of candidates) {
    if (candidate.length() < 0.4) continue;
    const world = clampPolar(candidate.normalize().applyQuaternion(view));
    const camera = world.clone().multiplyScalar(FOLLOW_RADIUS).applyQuaternion(inverse);
    if (isSquareVisibleFrom(square, camera)) return world;
  }
  return clampPolar(normal.clone().applyQuaternion(view));
}
