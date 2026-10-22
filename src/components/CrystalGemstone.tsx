import React, { useEffect, useRef } from 'react';

interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

interface ProjectedVertex {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
}

interface Face {
  indices: [number, number, number];
  colorType?: 'crown' | 'girdle' | 'pavilion' | 'star' | 'culet';
}

export const CrystalGemstone: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rotationAngleY = 0;
    let rotationAngleX = 0.18; // subtle 3D downward viewing tilt
    let rotationAngleZ = 0.04;
    let floatTime = 0;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Smooth ~21 seconds per full 360 rotation
    const rotationSpeed = prefersReducedMotion ? 0.0005 : 0.0055;

    // 1. GENERATE GEOMETRY OF THE LARGE FUTURISTIC FACETED CRYSTAL GEMSTONE
    const baseVertices: Vertex3D[] = [];

    // Apex (top point)
    baseVertices.push({ x: 0, y: -1.25, z: 0 }); // index 0

    // Ring 1: Upper crown (8 irregular vertices)
    const r1Count = 8;
    const r1Radius = 0.65;
    const r1Y = -0.82;
    for (let i = 0; i < r1Count; i++) {
      const theta = (i * 2 * Math.PI) / r1Count;
      const varR = r1Radius * (1 + 0.08 * Math.sin(i * 3 + 0.4));
      baseVertices.push({
        x: Math.cos(theta) * varR,
        y: r1Y + 0.05 * Math.cos(i * 2),
        z: Math.sin(theta) * varR,
      });
    } // indices 1..8

    // Ring 2: Mid upper crown facets (14 vertices with alternating height and radius)
    const r2Count = 14;
    const r2Y = -0.36;
    for (let i = 0; i < r2Count; i++) {
      const theta = (i * 2 * Math.PI) / r2Count;
      const isAlt = i % 2 === 1;
      const r = isAlt ? 1.08 : 0.96;
      const yOff = isAlt ? 0.06 : -0.06;
      baseVertices.push({
        x: Math.cos(theta) * r,
        y: r2Y + yOff,
        z: Math.sin(theta) * r,
      });
    } // indices 9..22

    // Ring 3: Equator Girdle facets (14 vertices)
    const r3Count = 14;
    const r3Y = 0.16;
    for (let i = 0; i < r3Count; i++) {
      const theta = ((i + 0.5) * 2 * Math.PI) / r3Count;
      const isAlt = i % 2 === 0;
      const r = isAlt ? 1.14 : 1.02;
      const yOff = isAlt ? -0.05 : 0.05;
      baseVertices.push({
        x: Math.cos(theta) * r,
        y: r3Y + yOff,
        z: Math.sin(theta) * r,
      });
    } // indices 23..36

    // Ring 4: Lower Pavilion (8 vertices)
    const r4Count = 8;
    const r4Radius = 0.72;
    const r4Y = 0.72;
    for (let i = 0; i < r4Count; i++) {
      const theta = (i * 2 * Math.PI) / r4Count;
      const varR = r4Radius * (1 + 0.06 * Math.sin(i * 2 + 1));
      baseVertices.push({
        x: Math.cos(theta) * varR,
        y: r4Y,
        z: Math.sin(theta) * varR,
      });
    } // indices 37..44

    // Culet (bottom point)
    baseVertices.push({ x: 0, y: 1.22, z: 0 }); // index 45

    // 2. DEFINE TRIANGULAR FACETS (Indices)
    const faces: Face[] = [];

    // Top Apex to Ring 1 (Star facets)
    for (let i = 0; i < r1Count; i++) {
      const next = (i + 1) % r1Count;
      faces.push({ indices: [0, 1 + i, 1 + next], colorType: 'star' });
    }

    // Ring 1 to Ring 2 (8 vertices to 14 vertices crown facets)
    for (let i = 0; i < 14; i++) {
      const next = (i + 1) % 14;
      const r1Idx = Math.floor((i * r1Count) / 14);
      const nextR1Idx = (r1Idx + 1) % r1Count;
      faces.push({ indices: [1 + r1Idx, 9 + i, 9 + next], colorType: 'crown' });
      if (i % 2 === 0) {
        faces.push({ indices: [1 + r1Idx, 9 + next, 1 + nextR1Idx], colorType: 'crown' });
      }
    }

    // Ring 2 to Ring 3 (14 to 14 girdle band facets)
    for (let i = 0; i < 14; i++) {
      const next = (i + 1) % 14;
      const v2A = 9 + i;
      const v2B = 9 + next;
      const v3A = 23 + i;
      const v3B = 23 + next;
      faces.push({ indices: [v2A, v3A, v2B], colorType: 'girdle' });
      faces.push({ indices: [v2B, v3A, v3B], colorType: 'girdle' });
    }

    // Ring 3 to Ring 4 (14 to 8 pavilion facets)
    for (let i = 0; i < 14; i++) {
      const nextR3 = (i + 1) % 14;
      const r4Idx = Math.floor((i * r4Count) / 14);
      const nextR4Idx = (r4Idx + 1) % r4Count;
      faces.push({ indices: [23 + i, 37 + r4Idx, 23 + nextR3], colorType: 'pavilion' });
      if (i % 2 === 1) {
        faces.push({ indices: [23 + nextR3, 37 + r4Idx, 37 + nextR4Idx], colorType: 'pavilion' });
      }
    }

    // Ring 4 to Bottom Culet (45)
    for (let i = 0; i < r4Count; i++) {
      const next = (i + 1) % r4Count;
      faces.push({ indices: [37 + i, 45, 37 + next], colorType: 'culet' });
    }

    // Ambient floating energy particles around the crystal
    const particles = Array.from({ length: 28 }, () => ({
      x: (Math.random() - 0.5) * 3.0,
      y: (Math.random() - 0.5) * 2.8,
      z: (Math.random() - 0.5) * 2.6,
      size: Math.random() * 2.2 + 1.2,
      alpha: Math.random() * 0.7 + 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    // Lighting vector setup matching Navy / Royal / Cyan / Violet theme:
    const L1 = { x: 0.6, y: -0.75, z: 0.4 };
    const l1Len = Math.hypot(L1.x, L1.y, L1.z);
    L1.x /= l1Len; L1.y /= l1Len; L1.z /= l1Len;

    const L2 = { x: -0.7, y: 0.45, z: -0.4 };
    const l2Len = Math.hypot(L2.x, L2.y, L2.z);
    L2.x /= l2Len; L2.y /= l2Len; L2.z /= l2Len;

    const L3 = { x: -0.5, y: -0.6, z: 0.7 };
    const l3Len = Math.hypot(L3.x, L3.y, L3.z);
    L3.x /= l3Len; L3.y /= l3Len; L3.z /= l3Len;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2 - 28 * (width / 540);
      const scale = Math.min(width, height) * 0.31;
      const resMultiplier = width / 540;

      // Trigonometric rotation values
      const cosY = Math.cos(rotationAngleY);
      const sinY = Math.sin(rotationAngleY);
      const cosX = Math.cos(rotationAngleX);
      const sinX = Math.sin(rotationAngleX);
      const cosZ = Math.cos(rotationAngleZ);
      const sinZ = Math.sin(rotationAngleZ);

      // 3. DRAW FUTURISTIC DARK-NAVY CIRCULAR GLASS PLATFORM DIRECTLY IN CANVAS
      const platformY = centerY + scale * 1.38;
      const platformRadiusX = scale * 1.5;
      const platformRadiusY = scale * 0.38;

      // Ambient radial base glow
      const baseGlow = ctx.createRadialGradient(
        centerX, platformY, 5,
        centerX, platformY, platformRadiusX * 1.3
      );
      baseGlow.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
      baseGlow.addColorStop(0.3, 'rgba(30, 64, 175, 0.35)');
      baseGlow.addColorStop(0.7, 'rgba(15, 23, 42, 0.1)');
      baseGlow.addColorStop(1, 'rgba(7, 13, 30, 0)');

      ctx.save();
      ctx.fillStyle = baseGlow;
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX * 1.3, platformRadiusY * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Outer luminous orbital ring 1 (drawn cleanly on canvas without HTML/CSS GPU tile glitch)
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX * 1.18, platformRadiusY * 1.18, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1.4 * resMultiplier;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.stroke();

      // Counter-rotating dashed accent orbital ring 2
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX * 1.08, platformRadiusY * 1.08, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1.2 * resMultiplier;
      ctx.setLineDash([8 * resMultiplier, 8 * resMultiplier]);
      ctx.lineDashOffset = -rotationAngleY * 35 * resMultiplier;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.stroke();
      ctx.setLineDash([]); // clear dash

      // Glass Pedestal Disc 1 (Outer Dark Navy Glass Disc)
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX, platformRadiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 25, 60, 0.7)';
      ctx.fill();
      ctx.lineWidth = 1.6 * resMultiplier;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.stroke();

      // Platform Disc 2 (Inner Ring with Glowing Cyan Border)
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX * 0.74, platformRadiusY * 0.74, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 35, 80, 0.8)';
      ctx.fill();
      ctx.lineWidth = 2.0 * resMultiplier;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
      ctx.stroke();

      // Rotating Holographic Laser Rings and Tick Marks
      ctx.save();
      ctx.translate(centerX, platformY);
      const ringAngle = rotationAngleY * 0.75;
      ctx.scale(1, 0.38);
      ctx.rotate(ringAngle);

      for (let i = 0; i < 28; i++) {
        const a = (i * Math.PI * 2) / 28;
        const rInner = platformRadiusX * 0.84;
        const rOuter = (i % 4 === 0) ? platformRadiusX * 0.97 : platformRadiusX * 0.91;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
        ctx.lineTo(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
        ctx.strokeStyle = (i % 4 === 0) ? 'rgba(56, 189, 248, 0.95)' : 'rgba(14, 165, 233, 0.45)';
        ctx.lineWidth = (i % 4 === 0) ? 2.2 * resMultiplier : 1.1 * resMultiplier;
        ctx.stroke();
      }
      ctx.restore();

      // Soft reflection of the crystal on the dark-blue glass pedestal
      const reflectionGlow = ctx.createRadialGradient(
        centerX, platformY, 2,
        centerX, platformY, platformRadiusX * 0.55
      );
      reflectionGlow.addColorStop(0, 'rgba(56, 189, 248, 0.75)');
      reflectionGlow.addColorStop(0.4, 'rgba(30, 64, 175, 0.4)');
      reflectionGlow.addColorStop(0.7, 'rgba(147, 51, 234, 0.15)');
      reflectionGlow.addColorStop(1, 'rgba(7, 13, 30, 0)');
      ctx.fillStyle = reflectionGlow;
      ctx.beginPath();
      ctx.ellipse(centerX, platformY, platformRadiusX * 0.55, platformRadiusY * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. PROJECT ALL 3D VERTICES WITH CAMERA PERSPECTIVE
      const projected: ProjectedVertex[] = baseVertices.map((v) => {
        // Rotate around Y axis
        const x1 = v.x * cosY + v.z * sinY;
        const y1 = v.y;
        const z1 = -v.x * sinY + v.z * cosY;

        // Rotate around X axis
        const x2 = x1;
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;

        // Rotate around Z axis (subtle wobble)
        const x3 = x2 * cosZ - y2 * sinZ;
        const y3 = x2 * sinZ + y2 * cosZ;
        const z3 = z2;

        // Perspective projection
        const fov = 3.6;
        const perspective = fov / (fov + z3 * 0.45);

        return {
          x: x3,
          y: y3,
          z: z3,
          px: centerX + x3 * scale * perspective,
          py: centerY + y3 * scale * perspective,
        };
      });

      // 5. DRAW DEEP BLUE & CYAN PULSING ENERGY CORE
      const corePulse = 0.88 + 0.12 * Math.sin(floatTime * 2.2);
      const coreRadius = scale * 0.58 * corePulse;
      const coreGlow = ctx.createRadialGradient(
        centerX, centerY, 5,
        centerX, centerY, coreRadius
      );
      coreGlow.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      coreGlow.addColorStop(0.2, 'rgba(56, 189, 248, 0.85)');
      coreGlow.addColorStop(0.5, 'rgba(37, 99, 235, 0.6)');
      coreGlow.addColorStop(0.75, 'rgba(126, 34, 206, 0.35)'); // subtle violet highlight
      coreGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');

      ctx.save();
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. PROCESS AND DEPTH-SORT FACES (PAINTER'S ALGORITHM)
      interface ProcessedFace {
        face: Face;
        avgZ: number;
        normalZ: number;
        p0: ProjectedVertex;
        p1: ProjectedVertex;
        p2: ProjectedVertex;
        dotL1: number;
        dotL2: number;
        dotL3: number;
      }

      const processedFaces: ProcessedFace[] = faces.map((face) => {
        const p0 = projected[face.indices[0]];
        const p1 = projected[face.indices[1]];
        const p2 = projected[face.indices[2]];

        const avgZ = (p0.z + p1.z + p2.z) / 3;

        // 3D normal vector in rotated camera space
        const ax = p1.x - p0.x;
        const ay = p1.y - p0.y;
        const az = p1.z - p0.z;

        const bx = p2.x - p0.x;
        const by = p2.y - p0.y;
        const bz = p2.z - p0.z;

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const dotL1 = nx * L1.x + ny * L1.y + nz * L1.z;
        const dotL2 = nx * L2.x + ny * L2.y + nz * L2.z;
        const dotL3 = nx * L3.x + ny * L3.y + nz * L3.z;

        return {
          face,
          avgZ,
          normalZ: nz,
          p0,
          p1,
          p2,
          dotL1,
          dotL2,
          dotL3,
        };
      });

      // Back-to-front rendering for realistic glass transparency and depth
      processedFaces.sort((a, b) => a.avgZ - b.avgZ);

      // 7. RENDER BACK-FACING FACETS (Internal Deep Refractions & Violet nuances)
      processedFaces.forEach(({ normalZ, p0, p1, p2, dotL2, dotL3 }) => {
        if (normalZ < 0) {
          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.lineTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.closePath();

          const violetFactor = Math.max(0, dotL2);
          const cyanFactor = Math.max(0, dotL3);

          // Deep royal blue base with violet nuance
          const r = Math.floor(18 + violetFactor * 75);
          const g = Math.floor(45 + cyanFactor * 65);
          const b = Math.floor(160 + violetFactor * 50);
          const alpha = 0.22 + Math.abs(normalZ) * 0.18;

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.fill();

          ctx.lineWidth = 0.9 * resMultiplier;
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.stroke();
        }
      });

      // 8. RENDER FRONT-FACING FACETS (Specular High-Gleam Glass Surface)
      processedFaces.forEach(({ normalZ, p0, p1, p2, dotL1, dotL2, dotL3, face }) => {
        if (normalZ >= 0) {
          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.lineTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.closePath();

          // Calculate facet lighting components
          const specWhite = Math.pow(Math.max(0, dotL1), 7); // Intense gleaming glint
          const cyanLight = Math.max(0, dotL3) * 0.55;
          const violetLight = Math.max(0, dotL2) * 0.35;
          const electricBlue = Math.max(0, dotL1) * 0.45;

          // Gradient across facet plane
          const grad = ctx.createLinearGradient(p0.px, p0.py, p2.px, p2.py);

          if (specWhite > 0.42) {
            // Intense White & Electric Blue Gleam
            grad.addColorStop(0, `rgba(255, 255, 255, ${0.85 + specWhite * 0.15})`);
            grad.addColorStop(0.45, `rgba(186, 230, 253, ${0.65 + specWhite * 0.25})`);
            grad.addColorStop(1, `rgba(56, 189, 248, 0.45)`);
          } else if (violetLight > 0.18) {
            // Subtle violet/indigo refraction facet
            grad.addColorStop(0, `rgba(192, 132, 252, ${0.45 + violetLight * 0.3})`);
            grad.addColorStop(0.55, `rgba(96, 165, 250, 0.4)`);
            grad.addColorStop(1, `rgba(30, 58, 138, 0.35)`);
          } else {
            // Vivid Royal Blue & Radiant Cyan crystalline facet
            const alpha = 0.38 + electricBlue * 0.35 + cyanLight * 0.25;
            grad.addColorStop(0, `rgba(224, 242, 254, ${alpha})`);
            grad.addColorStop(0.5, `rgba(6, 182, 212, ${alpha * 0.85})`);
            grad.addColorStop(1, `rgba(30, 64, 175, ${alpha * 0.8})`);
          }

          ctx.fillStyle = grad;
          ctx.fill();

          // High-contrast glowing borders & edges
          ctx.lineWidth = (specWhite > 0.35 ? 2.2 : 1.3) * resMultiplier;
          const edgeAlpha = Math.min(0.98, 0.5 + specWhite * 0.5 + normalZ * 0.3);
          if (specWhite > 0.35) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha})`;
          } else if (violetLight > 0.2) {
            ctx.strokeStyle = `rgba(216, 180, 254, ${edgeAlpha})`;
          } else {
            ctx.strokeStyle = `rgba(125, 211, 252, ${edgeAlpha})`;
          }
          ctx.stroke();

          // Star glint cross sparkle on prominent specular hits
          if (specWhite > 0.62 && (face.colorType === 'star' || face.colorType === 'crown')) {
            const sparkleX = (p0.px + p1.px + p2.px) / 3;
            const sparkleY = (p0.py + p1.py + p2.py) / 3;
            const sSize = 12 * specWhite * resMultiplier;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 1.8 * resMultiplier;
            ctx.beginPath();
            ctx.moveTo(sparkleX - sSize, sparkleY);
            ctx.lineTo(sparkleX + sSize, sparkleY);
            ctx.moveTo(sparkleX, sparkleY - sSize);
            ctx.lineTo(sparkleX, sparkleY + sSize);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            ctx.beginPath();
            ctx.arc(sparkleX, sparkleY, 2.8 * resMultiplier, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      });

      // 9. AMBIENT FLOATING LIGHT PARTICLES
      particles.forEach((p) => {
        const px1 = p.x * Math.cos(rotationAngleY * 0.4) + p.z * Math.sin(rotationAngleY * 0.4);
        const py1 = p.y + Math.sin(floatTime + p.phase) * 0.09;
        const pz1 = -p.x * Math.sin(rotationAngleY * 0.4) + p.z * Math.cos(rotationAngleY * 0.4);

        const scrX = centerX + px1 * scale * 1.35;
        const scrY = centerY + py1 * scale * 1.35;

        const pAlpha = p.alpha * (0.6 + 0.4 * Math.sin(floatTime * 2.2 + p.phase));

        ctx.save();
        ctx.fillStyle = `rgba(186, 230, 253, ${pAlpha})`;
        ctx.beginPath();
        ctx.arc(scrX, scrY, p.size * resMultiplier, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Advance rotation & floating variables
      rotationAngleY += rotationSpeed;
      rotationAngleX = 0.18 + Math.sin(floatTime * 0.7) * 0.04;
      rotationAngleZ = Math.cos(floatTime * 0.5) * 0.025;
      floatTime += 0.02;

      animationFrameId = requestAnimationFrame(render);
    };

    // Canvas scaling & resize handler
    const updateSize = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      
      const targetWidth = Math.round(rect.width * dpr);
      const targetHeight = Math.round(rect.height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[440px] sm:h-[500px] lg:h-[560px] flex items-center justify-center select-none pointer-events-none"
    >
      {/* Soft ambient background glow circles behind crystal */}
      <div className="absolute w-72 h-72 lg:w-96 lg:h-96 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
      <div className="absolute w-60 h-60 lg:w-80 lg:h-80 rounded-full bg-blue-600/25 blur-2xl pointer-events-none" />
      <div className="absolute w-44 h-44 rounded-full bg-purple-600/15 blur-2xl pointer-events-none" />

      {/* Floating Canvas container with smooth floating & breathing animation */}
      <div className="relative z-10 w-full h-full flex items-center justify-center animate-crystal-float">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};
