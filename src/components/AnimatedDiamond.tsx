import React, { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  MeshTransmissionMaterial,
  Float,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";

function Diamond() {
  const diamondRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!diamondRef.current) return;

    // Clockwise rotation
    diamondRef.current.rotation.y -= delta * 0.32;

    // Very subtle additional rotation
    diamondRef.current.rotation.x =
      Math.sin(Date.now() * 0.00035) * 0.035;
  });

  return (
    <Float
      speed={1.2}
      rotationIntensity={0.12}
      floatIntensity={0.35}
    >
      <group ref={diamondRef} scale={1.9}>
        {/* Upper diamond */}
        <mesh position={[0, 0.45, 0]}>
          <coneGeometry
            args={[1.05, 0.85, 8, 3]}
          />

          <MeshTransmissionMaterial
            backside
            samples={8}
            thickness={0.45}
            chromaticAberration={0.08}
            anisotropy={0.25}
            distortion={0.08}
            distortionScale={0.25}
            temporalDistortion={0.08}
            transmission={1}
            roughness={0.08}
            ior={2.1}
            color="#39A9FF"
            attenuationColor="#0A7CFF"
            attenuationDistance={2}
          />
        </mesh>

        {/* Lower diamond point */}
        <mesh position={[0, -0.25, 0]}>
          <coneGeometry
            args={[1.05, 1.15, 8, 3]}
          />

          <MeshTransmissionMaterial
            backside
            samples={8}
            thickness={0.5}
            chromaticAberration={0.1}
            anisotropy={0.3}
            distortion={0.08}
            distortionScale={0.25}
            temporalDistortion={0.08}
            transmission={1}
            roughness={0.06}
            ior={2.15}
            color="#178CFF"
            attenuationColor="#006EFF"
            attenuationDistance={2}
          />
        </mesh>

        {/* Inner crystal core */}
        <mesh scale={0.55}>
          <icosahedronGeometry args={[1, 2]} />

          <meshPhysicalMaterial
            transparent
            opacity={0.28}
            transmission={0.9}
            thickness={0.3}
            roughness={0.05}
            metalness={0.05}
            color="#7DE8FF"
          />
        </mesh>
      </group>
    </Float>
  );
}

function RotatingBase() {
  const baseRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!baseRef.current) return;

    // ANTI-CLOCKWISE
    baseRef.current.rotation.y += delta * 0.45;
  });

  return (
    <group ref={baseRef} position={[0, -2.05, 0]}>
      {/* Main platform */}
      <mesh>
        <cylinderGeometry args={[1.75, 1.95, 0.28, 96]} />

        <meshPhysicalMaterial
          transparent
          opacity={0.72}
          transmission={0.55}
          roughness={0.12}
          metalness={0.25}
          color="#147DFF"
        />
      </mesh>

      {/* Inner glowing ring */}
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[1.35, 0.035, 16, 96]} />

        <meshBasicMaterial
          color="#37D8FF"
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Outer glowing ring */}
      <mesh position={[0, 0.18, 0]}>
        <torusGeometry args={[1.72, 0.025, 16, 96]} />

        <meshBasicMaterial
          color="#FFFFFF"
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Bottom ring */}
      <mesh position={[0, -0.16, 0]}>
        <torusGeometry args={[1.9, 0.045, 16, 96]} />

        <meshBasicMaterial
          color="#168CFF"
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

function CrystalScene() {
  return (
    <>
      <Environment preset="city" />

      <ambientLight intensity={1.4} />

      <directionalLight
        position={[4, 6, 5]}
        intensity={3}
        color="#FFFFFF"
      />

      <pointLight
        position={[3, 2, 4]}
        intensity={35}
        distance={10}
        color="#27C9FF"
      />

      <pointLight
        position={[-3, 1, 2]}
        intensity={25}
        distance={8}
        color="#2878FF"
      />

      <pointLight
        position={[0, -2, 3]}
        intensity={18}
        distance={7}
        color="#FFFFFF"
      />

      <Diamond />

      <RotatingBase />
    </>
  );
}

export default function AnimatedDiamond() {
  return (
    <div
      className="w-full h-full min-h-[480px] lg:min-h-[580px] relative flex items-center justify-center"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <Canvas
        camera={{
          position: [0, 0.2, 7],
          fov: 42,
        }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <Suspense fallback={null}>
          <CrystalScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
