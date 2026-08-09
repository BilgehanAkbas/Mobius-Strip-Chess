import { type FC } from 'react';
import type { PieceData } from '../types';

const COLORS = { white: '#f0dcc0', black: '#1a1a1a' } as const;

const PawnShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.08, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
};

const RookShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.18, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.2, 0.21, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
};

const KnightShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.16, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0.07, 0.28, 0]}>
        <coneGeometry args={[0.11, 0.14, 12]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
};

const BishopShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.16, 0.16, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
};

const QueenShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <coneGeometry args={[0.2, 0.18, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <torusGeometry args={[0.14, 0.03, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {[0, 1, 2, 3].map(i => {
        const angle = i * Math.PI / 2;
        return (
          <mesh key={i} position={[0.13 * Math.cos(angle), 0.28, 0.13 * Math.sin(angle)]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial {...mat} />
          </mesh>
        );
      })}
    </group>
  );
};

const KingShape: FC<{ color: 'white' | 'black' }> = ({ color }) => {
  const c = COLORS[color];
  const mat = { color: c, roughness: 0.3, metalness: 0.05 };
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.04, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.18, 0.2, 0.18, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.06, 0.1, 0.02]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.345, 0]}>
        <boxGeometry args={[0.1, 0.02, 0.02]} />
        <meshStandardMaterial {...mat} />
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
