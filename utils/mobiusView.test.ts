import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { PieceColor, Position } from "../types";
import { getMobiusFrame, MOBIUS_COLUMNS, MOBIUS_ROWS } from "./mobiusGeometry";
import { followDirection, isSquareVisibleFrom, MOBIUS_CAMERA_POSITION, mobiusViewQuaternion, openingDirection, selectionFocus } from "./mobiusView";

const SQUARES: Position[] = Array.from({ length: MOBIUS_COLUMNS * MOBIUS_ROWS }, (_, index) => ({
  x: Math.floor(index / MOBIUS_ROWS),
  y: index % MOBIUS_ROWS,
}));

const ARMY_COLUMNS: Record<PieceColor, number[]> = { white: [0, 1, 2, 3], black: [8, 9, 10, 11] };

function cameraInStripSpace(world: THREE.Vector3, color: PieceColor): THREE.Vector3 {
  return world.clone().applyQuaternion(mobiusViewQuaternion(color).invert());
}

describe.each(["white", "black"] as PieceColor[])("%s view", (color) => {
  it("opens with the player's army facing up", () => {
    for (const x of ARMY_COLUMNS[color]) {
      const up = getMobiusFrame({ x, y: 1 }).normal.applyQuaternion(mobiusViewQuaternion(color)).y;
      expect(up).toBeGreaterThan(0);
    }
  });

  it("shows the player's whole army from the opening camera", () => {
    const camera = cameraInStripSpace(new THREE.Vector3(...MOBIUS_CAMERA_POSITION), color);
    for (const x of ARMY_COLUMNS[color]) {
      for (let y = 0; y < MOBIUS_ROWS; y += 1) {
        expect(isSquareVisibleFrom({ x, y }, camera), `square ${x},${y}`).toBe(true);
      }
    }
  });

  it("hides the other army from the opening camera", () => {
    const other = ARMY_COLUMNS[color === "white" ? "black" : "white"];
    const camera = cameraInStripSpace(new THREE.Vector3(...MOBIUS_CAMERA_POSITION), color);
    const seen = other.filter((x) => isSquareVisibleFrom({ x, y: 1 }, camera));
    expect(seen.length).toBeLessThan(other.length);
  });

  it("finds a camera direction that shows every square", () => {
    const radius = new THREE.Vector3(...MOBIUS_CAMERA_POSITION).length();
    for (const square of SQUARES) {
      const direction = followDirection(square, color);
      expect(direction.length()).toBeCloseTo(1, 5);
      const camera = cameraInStripSpace(direction.clone().multiplyScalar(radius), color);
      expect(isSquareVisibleFrom(square, camera), `square ${square.x},${square.y}`).toBe(true);
    }
  });
});

describe("two players on one screen", () => {
  it.each([["white", "black"], ["black", "black"], ["white", "white"], ["black", "white"]] as [PieceColor, PieceColor][])(
    "gives %s a full view of its army when the strip is held for %s",
    (player, viewColor) => {
      const radius = new THREE.Vector3(...MOBIUS_CAMERA_POSITION).length();
      const camera = cameraInStripSpace(openingDirection(player, viewColor).multiplyScalar(radius), viewColor);
      for (const x of ARMY_COLUMNS[player]) {
        for (let y = 0; y < MOBIUS_ROWS; y += 1) {
          expect(isSquareVisibleFrom({ x, y }, camera), `square ${x},${y}`).toBe(true);
        }
      }
    },
  );
});

describe("selectionFocus", () => {
  const camera = cameraInStripSpace(new THREE.Vector3(...MOBIUS_CAMERA_POSITION), "white");
  const visible = { x: 1, y: 1 };
  const hidden = { x: 9, y: 1 };

  it("leaves the camera alone when the piece and a move can be seen", () => {
    expect(selectionFocus(visible, [visible], camera)).toBeNull();
    expect(selectionFocus(visible, [hidden, visible], camera)).toBeNull();
  });

  it("goes to the moves when none of them can be seen", () => {
    expect(selectionFocus(visible, [hidden], camera)).toEqual(hidden);
  });

  it("goes to the piece itself when it is hidden and has no moves", () => {
    expect(selectionFocus(hidden, [], camera)).toEqual(hidden);
    expect(selectionFocus(visible, [], camera)).toBeNull();
  });
});

describe("visibility", () => {
  it("cannot see a piece from behind the strip", () => {
    const { position, normal } = getMobiusFrame({ x: 1, y: 1 });
    const behind = position.clone().addScaledVector(normal, -20);
    expect(isSquareVisibleFrom({ x: 1, y: 1 }, behind)).toBe(false);
  });
});
