import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { dragRotation, placeCamera } from "../utils/mobiusView";

// The same inertia the classic board has: a drag eases in and out without adding any turn.
const SMOOTHING = 0.075;
const SMOOTHING_FPS = 60;
const STOP_RADIANS = 0.0001;
const STOP_ZOOM = 0.0005;
const WHEEL_ZOOM = 0.001;

interface FreeRotateControlsProps {
  minDistance: number;
  maxDistance: number;
}

/**
 * Turns the camera around the strip in any direction, over the top and underneath too,
 * with no fixed "up". Built on pointer events so that tapping a square keeps working on a phone.
 */
export function FreeRotateControls({ minDistance, maxDistance }: FreeRotateControlsProps) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const controls = useMemo(() => new THREE.EventDispatcher<{ start: object }>(), []);
  // What the drag and the wheel have asked for and the camera has not done yet.
  const spin = useRef({ x: 0, y: 0 });
  const zoom = useRef(0);

  useEffect(() => {
    const previous = get().controls;
    set({ controls });
    return () => set({ controls: previous });
  }, [controls, get, set]);

  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number }>();
    const fingerGap = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // Letting go outside the window has to end the drag too.
      canvas.setPointerCapture(event.pointerId);
      spin.current = { x: 0, y: 0 };
      controls.dispatchEvent({ type: "start" });
    };
    const onMove = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const gapBefore = pointers.size === 2 ? fingerGap() : 0;
      const dragged = { x: event.clientX - last.x, y: event.clientY - last.y };
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        zoom.current += Math.log(gapBefore / Math.max(fingerGap(), 1));
      } else if (pointers.size === 1) {
        // Dragging the height of the canvas is one full turn.
        const perPixel = (Math.PI * 2) / canvas.clientHeight;
        spin.current.x += dragged.x * perPixel;
        spin.current.y += dragged.y * perPixel;
      }
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom.current += event.deltaY * WHEEL_ZOOM;
      controls.dispatchEvent({ type: "start" });
      invalidate();
    };
    const onContextMenu = (event: Event) => event.preventDefault();

    const touchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      canvas.style.touchAction = touchAction;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [camera, canvas, controls, invalidate]);

  useFrame((state, delta) => {
    const { x, y } = spin.current;
    const moving = Math.hypot(x, y) > STOP_RADIANS;
    const zooming = Math.abs(zoom.current) > STOP_ZOOM;
    if (!moving && !zooming) return;

    const part = 1 - (1 - SMOOTHING) ** (delta * SMOOTHING_FPS);
    if (moving) {
      camera.quaternion.copy(dragRotation(camera.quaternion, x * part, y * part));
      spin.current = { x: x * (1 - part), y: y * (1 - part) };
    } else {
      spin.current = { x: 0, y: 0 };
    }
    const wanted = camera.position.length() * Math.exp(zoom.current * part);
    zoom.current = zooming ? zoom.current * (1 - part) : 0;
    placeCamera(camera, camera.quaternion, THREE.MathUtils.clamp(wanted, minDistance, maxDistance));
    state.invalidate();
  });

  return null;
}
