import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type ModelType = 'shield' | 'cube' | 'knot';
export type BackgroundTheme = 'dark' | 'light';

interface ThreeCanvasBackgroundProps {
  theme?: BackgroundTheme;
  modelType?: ModelType;
}

export const ThreeCanvasBackground: React.FC<ThreeCanvasBackgroundProps> = ({
  theme = 'dark',
  modelType = 'shield',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let animId: number | null = null;

    try {
      const scene = new THREE.Scene();
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      camera.position.z = 18;

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const isDark = theme === 'dark';

      // 1. Lighting Setup
      const ambientColor = isDark ? 0x0a1936 : 0xe0f2fe;
      const ambientIntensity = isDark ? 1.8 : 2.5;
      const ambientLight = new THREE.AmbientLight(ambientColor, ambientIntensity);
      scene.add(ambientLight);

      const light1Color = isDark ? 0x00e5ff : 0x0284c7;
      const light1 = new THREE.PointLight(light1Color, isDark ? 3.5 : 3.0, 50);
      light1.position.set(10, 8, 8);
      scene.add(light1);

      const light2Color = isDark ? 0x6366f1 : 0x818cf8;
      const light2 = new THREE.PointLight(light2Color, isDark ? 3.0 : 2.0, 50);
      light2.position.set(-10, -8, 6);
      scene.add(light2);

      const mouseLight = new THREE.PointLight(isDark ? 0x38bdf8 : 0x0ea5e9, 2.0, 35);
      mouseLight.position.set(0, 0, 10);
      scene.add(mouseLight);

      // 2. Central 3D Mesh Construction based on modelType
      const centralGroup = new THREE.Group();
      scene.add(centralGroup);

      // Disposables tracker
      const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

      if (modelType === 'shield') {
        // --- Procedural 3D Security Shield ---
        const shape = new THREE.Shape();
        shape.moveTo(0, 3.4);
        shape.quadraticCurveTo(2.0, 3.3, 3.0, 2.6);
        shape.quadraticCurveTo(3.2, 0.6, 2.2, -1.0);
        shape.quadraticCurveTo(1.2, -2.6, 0, -3.8);
        shape.quadraticCurveTo(-1.2, -2.6, -2.2, -1.0);
        shape.quadraticCurveTo(-3.2, 0.6, -3.0, 2.6);
        shape.quadraticCurveTo(-2.0, 3.3, 0, 3.4);

        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: 0.5,
          bevelEnabled: true,
          bevelSegments: 4,
          steps: 1,
          bevelSize: 0.25,
          bevelThickness: 0.3,
        };
        const shieldGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        shieldGeo.center();
        disposables.push(shieldGeo);

        const shieldMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x091e42 : 0xcfd8dc,
          roughness: isDark ? 0.25 : 0.2,
          metalness: isDark ? 0.85 : 0.65,
          emissive: isDark ? 0x032857 : 0x0284c7,
          emissiveIntensity: isDark ? 0.5 : 0.2,
        });
        disposables.push(shieldMat);

        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        centralGroup.add(shieldMesh);

        // Cyber Wireframe Edge for Shield
        const shieldWireMat = new THREE.MeshBasicMaterial({
          color: isDark ? 0x00e5ff : 0x0284c7,
          wireframe: true,
          transparent: true,
          opacity: isDark ? 0.25 : 0.3,
        });
        disposables.push(shieldWireMat);
        const shieldWireMesh = new THREE.Mesh(shieldGeo, shieldWireMat);
        centralGroup.add(shieldWireMesh);

        // Inner glowing core emblem (Octahedron)
        const emblemGeo = new THREE.OctahedronGeometry(1.2, 0);
        disposables.push(emblemGeo);
        const emblemMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x00e5ff : 0x0ea5e9,
          emissive: isDark ? 0x00e5ff : 0x0284c7,
          emissiveIntensity: 0.7,
          roughness: 0.1,
          metalness: 0.9,
        });
        disposables.push(emblemMat);
        const emblemMesh = new THREE.Mesh(emblemGeo, emblemMat);
        emblemMesh.position.z = 0.6;
        centralGroup.add(emblemMesh);
      } else if (modelType === 'cube') {
        // --- Procedural 3D Holographic Cyber Cube ---
        const outerCubeGeo = new THREE.BoxGeometry(4.5, 4.5, 4.5);
        disposables.push(outerCubeGeo);
        const outerCubeMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x061938 : 0xb0bec5,
          roughness: 0.2,
          metalness: 0.8,
          transparent: true,
          opacity: 0.6,
          wireframe: false,
        });
        disposables.push(outerCubeMat);
        const outerCube = new THREE.Mesh(outerCubeGeo, outerCubeMat);
        centralGroup.add(outerCube);

        // Outer Wireframe
        const cubeWireMat = new THREE.MeshBasicMaterial({
          color: isDark ? 0x00e5ff : 0x0284c7,
          wireframe: true,
          transparent: true,
          opacity: isDark ? 0.4 : 0.45,
        });
        disposables.push(cubeWireMat);
        const cubeWire = new THREE.Mesh(outerCubeGeo, cubeWireMat);
        centralGroup.add(cubeWire);

        // Inner spinning octahedron crystal core
        const coreGeo = new THREE.OctahedronGeometry(2.0, 0);
        disposables.push(coreGeo);
        const coreMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x38bdf8 : 0x0369a1,
          emissive: isDark ? 0x00e5ff : 0x0284c7,
          emissiveIntensity: 0.7,
          roughness: 0.1,
          metalness: 0.9,
        });
        disposables.push(coreMat);
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        centralGroup.add(coreMesh);
      } else {
        // --- 3D Torus Knot ---
        const knotGeo = new THREE.TorusKnotGeometry(4.2, 1.05, 128, 24, 2, 3);
        disposables.push(knotGeo);
        const knotMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x091e42 : 0xcfd8dc,
          roughness: 0.25,
          metalness: 0.85,
          emissive: isDark ? 0x07152b : 0x0284c7,
          emissiveIntensity: isDark ? 0.5 : 0.2,
        });
        disposables.push(knotMat);
        const knotMesh = new THREE.Mesh(knotGeo, knotMat);
        centralGroup.add(knotMesh);

        const knotWireMat = new THREE.MeshBasicMaterial({
          color: isDark ? 0x00e5ff : 0x0284c7,
          wireframe: true,
          transparent: true,
          opacity: isDark ? 0.2 : 0.3,
        });
        disposables.push(knotWireMat);
        const knotWireMesh = new THREE.Mesh(knotGeo, knotWireMat);
        centralGroup.add(knotWireMesh);
      }

      // 3. Orbiting Concentric 3D Rings
      const ringGroup = new THREE.Group();
      scene.add(ringGroup);

      const ringGeo1 = new THREE.TorusGeometry(6.8, 0.05, 16, 100);
      disposables.push(ringGeo1);
      const ringMat1 = new THREE.MeshBasicMaterial({
        color: isDark ? 0x38bdf8 : 0x0284c7,
        transparent: true,
        opacity: isDark ? 0.35 : 0.3,
      });
      disposables.push(ringMat1);
      const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
      ring1.rotation.x = Math.PI / 3;
      ringGroup.add(ring1);

      const ringGeo2 = new THREE.TorusGeometry(8.2, 0.04, 16, 120);
      disposables.push(ringGeo2);
      const ringMat2 = new THREE.MeshBasicMaterial({
        color: isDark ? 0x818cf8 : 0x6366f1,
        transparent: true,
        opacity: isDark ? 0.25 : 0.25,
      });
      disposables.push(ringMat2);
      const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
      ring2.rotation.y = Math.PI / 4;
      ringGroup.add(ring2);

      // 4. Floating 3D Geometric Crystals
      const crystals: { mesh: THREE.Mesh; rotSpeedX: number; rotSpeedY: number; floatOffset: number; basePosY: number }[] = [];
      const crystalGeo = new THREE.IcosahedronGeometry(0.8, 0);
      disposables.push(crystalGeo);

      const crystalMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x1e3a8a : 0x93c5fd,
        emissive: isDark ? 0x0ea5e9 : 0x0284c7,
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.9,
      });
      disposables.push(crystalMat);

      const crystalPositions = [
        [-9, 5, -2],
        [10, -5, -3],
        [-8, -6, 1],
        [9, 6, -1],
        [-11, 0, -4],
        [11, 2, -2],
      ];

      crystalPositions.forEach(([x, y, z], idx) => {
        const mesh = new THREE.Mesh(crystalGeo, crystalMat);
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(0.7 + (idx % 3) * 0.35);
        scene.add(mesh);
        crystals.push({
          mesh,
          rotSpeedX: 0.008 + (idx % 3) * 0.004,
          rotSpeedY: 0.01 + (idx % 2) * 0.005,
          floatOffset: idx * 1.2,
          basePosY: y,
        });
      });

      // 5. 3D Particle Starfield with Depth
      const particleCount = 450;
      const particleGeo = new THREE.BufferGeometry();
      disposables.push(particleGeo);

      const posArray = new Float32Array(particleCount * 3);
      const colorArray = new Float32Array(particleCount * 3);

      const color1 = new THREE.Color(isDark ? 0x00e5ff : 0x0284c7);
      const color2 = new THREE.Color(isDark ? 0x6366f1 : 0x3b82f6);
      const color3 = new THREE.Color(isDark ? 0xffffff : 0x0284c7);

      for (let i = 0; i < particleCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 45;
        posArray[i + 1] = (Math.random() - 0.5) * 35;
        posArray[i + 2] = (Math.random() - 0.5) * 30 - 2;

        const mixedColor = Math.random() < 0.45 ? color1 : Math.random() < 0.8 ? color2 : color3;
        colorArray[i] = mixedColor.r;
        colorArray[i + 1] = mixedColor.g;
        colorArray[i + 2] = mixedColor.b;
      }

      particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      particleGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

      const particleMat = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: isDark ? 0.75 : 0.65,
        blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      disposables.push(particleMat);

      const particleSystem = new THREE.Points(particleGeo, particleMat);
      scene.add(particleSystem);

      // 6. Mouse Parallax Motion
      let mouseX = 0;
      let mouseY = 0;
      let targetX = 0;
      let targetY = 0;

      const handleMouseMove = (e: MouseEvent) => {
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        mouseX = (e.clientX - halfW) / halfW;
        mouseY = (e.clientY - halfH) / halfH;

        mouseLight.position.x = mouseX * 12;
        mouseLight.position.y = -mouseY * 8;
      };

      window.addEventListener('mousemove', handleMouseMove);

      // 7. Responsive Resize
      const handleResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      window.addEventListener('resize', handleResize);

      // 8. Animation Loop
      const clock = new THREE.Clock();

      const animate = () => {
        animId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        targetX += (mouseX - targetX) * 0.04;
        targetY += (mouseY - targetY) * 0.04;

        camera.position.x = targetX * 1.8;
        camera.position.y = -targetY * 1.4;
        camera.lookAt(0, 0, 0);

        // Rotate central 3D mesh smoothly
        if (modelType === 'shield') {
          centralGroup.rotation.y = Math.sin(elapsedTime * 0.6) * 0.35 + targetX * 0.4;
          centralGroup.rotation.x = Math.sin(elapsedTime * 0.4) * 0.15 + targetY * 0.2;
          centralGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.25;
        } else if (modelType === 'cube') {
          centralGroup.rotation.x = elapsedTime * 0.35 + targetY * 0.3;
          centralGroup.rotation.y = elapsedTime * 0.45 + targetX * 0.4;
          centralGroup.rotation.z = Math.sin(elapsedTime * 0.2) * 0.2;
        } else {
          centralGroup.rotation.x = elapsedTime * 0.22 + targetY * 0.3;
          centralGroup.rotation.y = elapsedTime * 0.32 + targetX * 0.4;
        }

        // Oscillate concentric rings
        ring1.rotation.z = elapsedTime * 0.18;
        ring2.rotation.x = Math.PI / 4 + Math.sin(elapsedTime * 0.3) * 0.2;
        ring2.rotation.z = -elapsedTime * 0.12;

        // Floating crystals
        crystals.forEach((c) => {
          c.mesh.rotation.x += c.rotSpeedX;
          c.mesh.rotation.y += c.rotSpeedY;
          c.mesh.position.y = c.basePosY + Math.sin(elapsedTime * 1.2 + c.floatOffset) * 0.4;
        });

        // Starfield drift
        particleSystem.rotation.y = elapsedTime * 0.03;
        particleSystem.rotation.x = Math.sin(elapsedTime * 0.02) * 0.05;

        if (renderer) {
          renderer.render(scene, camera);
        }
      };

      animate();

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        if (animId !== null) cancelAnimationFrame(animId);

        disposables.forEach((item) => item.dispose());

        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
          renderer.dispose();
        }
      };
    } catch (err) {
      console.warn('Three.js WebGL initialization skipped:', err);
    }
  }, [theme, modelType]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
      style={{ opacity: theme === 'dark' ? 0.92 : 0.85 }}
    />
  );
};
