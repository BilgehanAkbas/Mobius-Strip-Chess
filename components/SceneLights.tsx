import { Environment, Lightformer } from "@react-three/drei";

interface SceneLightsProps {
  isMobius: boolean;
  /** Leave out for a scene without shadows. */
  shadowSize?: number;
}

export function SceneLights({ isMobius, shadowSize }: SceneLightsProps) {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.42}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 10, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 16, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#dfe4ff" position={[-11, 3, -4]} rotation={[0, Math.PI / 2, 0]} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} color="#fff1e4" position={[11, 1, 5]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 5, 1]} />
        <Lightformer form="rect" intensity={1.3} color="#ffffff" position={[0, -10, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[16, 16, 1]} />
      </Environment>

      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow={Boolean(shadowSize)}
        position={[7, 11, 7]}
        intensity={1.5}
        color="#fff7f3"
        shadow-mapSize={[shadowSize ?? 512, shadowSize ?? 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        {...(isMobius && { "shadow-camera-left": -9, "shadow-camera-right": 9, "shadow-camera-top": 9, "shadow-camera-bottom": -9 })}
      />
      <directionalLight position={[-8, 5, -5]} intensity={0.45} color="#c3c9ff" />
      {isMobius && <directionalLight position={[3, -11, 4]} intensity={0.8} color="#fff7f3" />}
    </>
  );
}
