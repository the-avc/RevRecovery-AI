import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Minimal floating glowing orbs — purely decorative Three.js background

interface OrbProps {
  position: [number, number, number];
  color: string;
  scale: number;
  speed: number;
  phase: number;
}

function Orb({ position, color, scale, speed, phase }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    meshRef.current.position.y = position[1] + Math.sin(t * speed + phase) * 0.4;
    meshRef.current.position.x = position[0] + Math.cos(t * speed * 0.7 + phase) * 0.3;
    meshRef.current.rotation.z = t * 0.1;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.12}
        roughness={0.1}
        metalness={0.8}
        emissive={color}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

const ORBS: OrbProps[] = [
  { position: [-4, 2, -3], color: '#7c3aed', scale: 2.2, speed: 0.4, phase: 0 },
  { position: [5, -1, -4], color: '#8b5cf6', scale: 1.6, speed: 0.3, phase: 1.5 },
  { position: [2, 3, -5], color: '#ec4899', scale: 1.8, speed: 0.5, phase: 3 },
  { position: [-3, -2, -6], color: '#7c3aed', scale: 2.5, speed: 0.25, phase: 2 },
  { position: [4, 1, -2], color: '#a78bfa', scale: 1.2, speed: 0.6, phase: 4 },
  { position: [-1, -3, -4], color: '#ec4899', scale: 1.4, speed: 0.35, phase: 0.8 },
];

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={1} color="#7c3aed" />
      {ORBS.map((orb, i) => (
        <Orb key={i} {...orb} />
      ))}
    </>
  );
}

export default function FloatingOrbs() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.7,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        gl={{ alpha: true, antialias: false }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
