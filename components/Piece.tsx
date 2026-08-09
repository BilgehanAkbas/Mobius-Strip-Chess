import { type FC } from 'react';
import type { PieceData } from '../types';

const PALETTE = {
  white: { base: '#f4ead8', accent: '#d8c49a' },
  black: { base: '#26221f', accent: '#0d0b0a' },
} as const;

interface ShapeProps {
  color: 'white' | 'black';
}

function useMat(color: 'white' | 'black') {
  const { base, accent } = PALETTE[color];
  return {
    body: { color: base, roughness: 0.82, metalness: 0 },
    accent: { color: accent, roughness: 0.85, metalness: 0 },
  };
}

const Base: FC<{ mat: { color: string; roughness: number; metalness: number }; r?: number }> = ({ mat, r = 0.22 }) => (
  <>
    <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r * 1.18, 0.04, 20]} />
      <meshStandardMaterial {...mat} />
    </mesh>
    <mesh position={[0, 0.055, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r * 0.82, r * 0.94, 0.03, 20]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  </>
);

const PawnShape: FC<ShapeProps> = ({ color }) => {
  const { body } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.19} />
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 0.14, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.185, 0]} castShadow>
        <torusGeometry args={[0.095, 0.02, 10, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
    </group>
  );
};

const RookShape: FC<ShapeProps> = ({ color }) => {
  const { body } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.24} />
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.2, 0.22, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.215, 0.2, 0.05, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            castShadow
            position={[0.17 * Math.cos(angle), 0.355, 0.17 * Math.sin(angle)]}
          >
            <boxGeometry args={[0.075, 0.06, 0.075]} />
            <meshStandardMaterial {...body} />
          </mesh>
        );
      })}
    </group>
  );
};

const KnightShape: FC<ShapeProps> = ({ color }) => {
  const { body, accent } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.22} />
      <mesh position={[0, 0.16, 0.02]} rotation={[0.35, 0, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.19, 0.22, 16]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.3, -0.09]} rotation={[-0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.11, 0.24, 0.13]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.24, -0.17]} rotation={[-0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.09, 0.1, 0.1]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0.045, 0.42, -0.02]} rotation={[-0.2, 0, -0.15]} castShadow>
        <coneGeometry args={[0.035, 0.09, 10]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.36, 0.06]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.04, 0.16, 0.05]} />
        <meshStandardMaterial {...accent} />
      </mesh>
      <mesh position={[0.065, 0.3, -0.1]}>
        <sphereGeometry args={[0.016, 10, 10]} />
        <meshStandardMaterial color={color === 'white' ? '#2a2420' : '#000000'} roughness={0.2} />
      </mesh>
    </group>
  );
};

const BishopShape: FC<ShapeProps> = ({ color }) => {
  const { body } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.21} />
      <mesh position={[0, 0.17, 0]} castShadow>
        <coneGeometry args={[0.15, 0.24, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <torusGeometry args={[0.075, 0.018, 10, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.395, 0.01]} rotation={[0, 0, Math.PI / 10]} castShadow>
        <boxGeometry args={[0.022, 0.07, 0.09]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.43, 0]}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshStandardMaterial {...body} />
      </mesh>
    </group>
  );
};

const QueenShape: FC<ShapeProps> = ({ color }) => {
  const { body } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.25} />
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.21, 0.26, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.335, 0]} castShadow>
        <torusGeometry args={[0.155, 0.028, 10, 24]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const angle = (i / 7) * Math.PI * 2;
        const r = 0.145;
        return (
          <mesh key={i} position={[r * Math.cos(angle), 0.4, r * Math.sin(angle)]} castShadow>
            <coneGeometry args={[0.032, 0.11, 10]} />
            <meshStandardMaterial {...body} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.47, 0]}>
        <sphereGeometry args={[0.04, 14, 14]} />
        <meshStandardMaterial {...body} />
      </mesh>
    </group>
  );
};

const KingShape: FC<ShapeProps> = ({ color }) => {
  const { body } = useMat(color);
  return (
    <group>
      <Base mat={body} r={0.25} />
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.21, 0.28, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <torusGeometry args={[0.155, 0.03, 10, 24]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.045, 0.16, 0.045]} />
        <meshStandardMaterial {...body} />
      </mesh>
      <mesh position={[0, 0.545, 0]} castShadow>
        <boxGeometry args={[0.13, 0.045, 0.045]} />
        <meshStandardMaterial {...body} />
      </mesh>
    </group>
  );
};

interface PieceProps {
  data: PieceData;
}

export const Piece: FC<PieceProps> = ({ data }) => {
  const { type, color } = data;

  switch (type) {
    case 'pawn': return <PawnShape color={color} />;
    case 'rook': return <RookShape color={color} />;
    case 'knight': return <KnightShape color={color} />;
    case 'bishop': return <BishopShape color={color} />;
    case 'queen': return <QueenShape color={color} />;
    case 'king': return <KingShape color={color} />;
  }
};