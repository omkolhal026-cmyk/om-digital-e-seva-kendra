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
  indices: number[];
  type: 'table' | 'star' | 'kite' | 'upper_girdle' | 'girdle' | 'lower_girdle' | 'pavilion' | 'culet';
  spectralHue?: number;
  hasGoldAccent?: boolean;
}

export const DiamondShowcase: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let rotationAngleY = 0.5; // Starts at an engaging 3D angle
    const rotationAngleX = 0.28; // ~16 degree downward tilt to show top table and pavilion facets clearly
    const rotationAngleZ = 0.015;

    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener('change', handleMotionChange);

    // -------------------------------------------------------------
    // 1. GENERATE TRUE BRILLIANT-CUT 3D FACETED DIAMOND GEOMETRY
    // -------------------------------------------------------------
    const vertices: Vertex3D[] = [];

    // Vertex 0: Center of flat table facet
    const tableY = -0.58;
    vertices.push({ x: 0, y: tableY, z: 0 }); // [0]

    // Vertices 1..8: Table octagon ring
    const tableRadius = 0.70;
    for (let i = 0; i < 8; i++) {
      const angle = (i * 2 * Math.PI) / 8;
      vertices.push({
        x: Math.cos(angle) * tableRadius,
        y: tableY,
        z: Math.sin(angle) * tableRadius,
      });
    } // [1..8]

    // Vertices 9..16: Star / Crown apex points (offset by PI/8)
    const starRadius = 0.96;
    const starY = -0.32;
    for (let i = 0; i < 8; i++) {
      const angle = ((i + 0.5) * 2 * Math.PI) / 8;
      vertices.push({
        x: Math.cos(angle) * starRadius,
        y: starY,
        z: Math.sin(angle) * starRadius,
      });
    } // [9..16]

    // Vertices 17..32: Upper girdle ring (16 vertices along top equator)
    const girdleRadius = 1.36;
    const girdleUpperY = -0.03;
    for (let i = 0; i < 16; i++) {
      const angle = (i * 2 * Math.PI) / 16;
      vertices.push({
        x: Math.cos(angle) * girdleRadius,
        y: girdleUpperY,
        z: Math.sin(angle) * girdleRadius,
      });
    } // [17..32]

    // Vertices 33..48: Lower girdle ring (16 vertices along bottom equator)
    const girdleLowerY = 0.07;
    for (let i = 0; i < 16; i++) {
      const angle = (i * 2 * Math.PI) / 16;
      vertices.push({
        x: Math.cos(angle) * girdleRadius,
        y: girdleLowerY,
        z: Math.sin(angle) * girdleRadius,
      });
    } // [33..48]

    // Vertices 49..56: Mid Pavilion ring (8 vertices tapering down)
    const pavilionMidRadius = 0.76;
    const pavilionMidY = 0.74;
    for (let i = 0; i < 8; i++) {
      const angle = (i * 2 * Math.PI) / 8;
      vertices.push({
        x: Math.cos(angle) * pavilionMidRadius,
        y: pavilionMidY,
        z: Math.sin(angle) * pavilionMidRadius,
      });
    } // [49..56]

    // Vertex 57: Culet (Sharp apex point at bottom of diamond)
    const culetY = 1.48;
    vertices.push({ x: 0, y: culetY, z: 0 }); // [57]

    // -------------------------------------------------------------
    // 2. CONSTRUCT TRIANGULAR & POLYGONAL FACETS
    // -------------------------------------------------------------
    const faces: Face[] = [];

    // A. Table octagonal facets (center 0 to octagon edges 1..8)
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      faces.push({
        indices: [0, 1 + i, 1 + next],
        type: 'table',
        spectralHue: (i * 45 + 190) % 360,
        hasGoldAccent: i % 4 === 0,
      });
    }

    // B. Star facets (8 triangles between table edge and star apexes)
    for (let i = 0; i < 8; i++) {
      const tA = 1 + i;
      const tB = 1 + ((i + 1) % 8);
      const star = 9 + i;
      faces.push({
        indices: [tA, star, tB],
        type: 'star',
        spectralHue: (i * 45 + 200) % 360,
        hasGoldAccent: i % 3 === 0,
      });
    }

    // C. Kite / Bezel facets and Upper Girdle triangles
    for (let i = 0; i < 8; i++) {
      const starPrev = 9 + ((i + 7) % 8);
      const starCurr = 9 + i;
      const tableVertex = 1 + i;

      const g0 = 17 + i * 2;
      const g1 = 17 + i * 2 + 1;
      const g2 = 17 + ((i * 2 + 2) % 16);

      // Kite facets split into two crisp triangles
      faces.push({
        indices: [tableVertex, starCurr, g1],
        type: 'kite',
        spectralHue: (i * 45 + 215) % 360,
        hasGoldAccent: i % 2 === 0,
      });
      faces.push({
        indices: [tableVertex, g1, starPrev],
        type: 'kite',
        spectralHue: (i * 45 + 225) % 360,
      });

      // Upper girdle triangles
      faces.push({
        indices: [starCurr, g1, g2],
        type: 'upper_girdle',
        spectralHue: (i * 45 + 185) % 360,
        hasGoldAccent: i === 1 || i === 5,
      });
      faces.push({
        indices: [starPrev, g0, g1],
        type: 'upper_girdle',
        spectralHue: (i * 45 + 195) % 360,
      });
    }

    // D. Girdle band facets (vertical waist)
    for (let i = 0; i < 16; i++) {
      const uA = 17 + i;
      const uB = 17 + ((i + 1) % 16);
      const lA = 33 + i;
      const lB = 33 + ((i + 1) % 16);
      faces.push({ indices: [uA, lA, uB], type: 'girdle' });
      faces.push({ indices: [uB, lA, lB], type: 'girdle' });
    }

    // E. Lower girdle facets (from girdle down to mid-pavilion ring)
    for (let i = 0; i < 8; i++) {
      const g0 = 33 + i * 2;
      const g1 = 33 + i * 2 + 1;
      const g2 = 33 + ((i * 2 + 2) % 16);
      const pMid = 49 + i;
      const pMidNext = 49 + ((i + 1) % 8);

      faces.push({
        indices: [g0, pMid, g1],
        type: 'lower_girdle',
        spectralHue: (i * 45 + 205) % 360,
        hasGoldAccent: i % 3 === 1,
      });
      faces.push({
        indices: [g1, pMid, g2],
        type: 'lower_girdle',
        spectralHue: (i * 45 + 215) % 360,
      });
      faces.push({
        indices: [g2, pMid, pMidNext],
        type: 'pavilion',
        spectralHue: (i * 45 + 225) % 360,
        hasGoldAccent: i % 2 === 1,
      });
    }

    // F. Culet facets (8 triangles tapering to bottom point 57)
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      faces.push({
        indices: [49 + i, 57, 49 + next],
        type: 'culet',
        spectralHue: (i * 45 + 195) % 360,
      });
    }

    // -------------------------------------------------------------
    // 3. LIGHT SOURCES (WHITE, ROYAL BLUE, CYAN & SUBTLE GOLD GLINTS)
    // -------------------------------------------------------------
    // L1: Primary overhead key light (pure brilliance & white highlights)
    const L1 = { x: 0.65, y: -0.75, z: 0.5 };
    const l1Len = Math.hypot(L1.x, L1.y, L1.z);
    L1.x /= l1Len; L1.y /= l1Len; L1.z /= l1Len;

    // L2: Left cyan electric rim light
    const L2 = { x: -0.65, y: -0.35, z: 0.65 };
    const l2Len = Math.hypot(L2.x, L2.y, L2.z);
    L2.x /= l2Len; L2.y /= l2Len; L2.z /= l2Len;

    // L3: Subtle warm gold specular accent light (for delicate golden reflections)
    const L3 = { x: 0.45, y: -0.4, z: 0.8 };
    const l3Len = Math.hypot(L3.x, L3.y, L3.z);
    L3.x /= l3Len; L3.y /= l3Len; L3.z /= l3Len;

    // -------------------------------------------------------------
    // 4. ANIMATION & RENDERING LOOP
    // -------------------------------------------------------------
    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // AUTOMATIC CLOCKWISE ROTATION
      // Exactly 20.0 seconds for one complete 360° rotation: (2 * PI) / 20 = 0.314159 rad/sec
      if (!prefersReducedMotion) {
        rotationAngleY += ((2 * Math.PI) / 20.0) * dt;
      }

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const resMultiplier = width / (520 * dpr);
      const centerX = width / 2;
      // Diamond floats slightly above center
      const centerY = height / 2 - 28 * resMultiplier;
      const scale = Math.min(width, height) * 0.31;

      // Trigonometric functions for 3D rotation
      const cosY = Math.cos(rotationAngleY);
      const sinY = Math.sin(rotationAngleY);
      const cosX = Math.cos(rotationAngleX);
      const sinX = Math.sin(rotationAngleX);
      const cosZ = Math.cos(rotationAngleZ);
      const sinZ = Math.sin(rotationAngleZ);

      // Rotate and project all vertices
      const projected: ProjectedVertex[] = [];
      const fov = 4.2;

      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];

        // 1. Clockwise Rotation around Y-axis
        const x1 = v.x * cosY + v.z * sinY;
        const y1 = v.y;
        const z1 = -v.x * sinY + v.z * cosY;

        // 2. Pitch around X-axis
        const x2 = x1;
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;

        // 3. Roll around Z-axis
        const x3 = x2 * cosZ - y2 * sinZ;
        const y3 = x2 * sinZ + y2 * cosZ;
        const z3 = z2;

        // Perspective projection
        const depth = z3 + fov;
        const factor = depth > 0.1 ? scale / depth : scale;

        projected.push({
          x: x3,
          y: y3,
          z: z3,
          px: centerX + x3 * factor * 3.4,
          py: centerY + y3 * factor * 3.4,
        });
      }

      // Process facets, compute normals and light interactions
      const processedFacets = faces.map((face) => {
        const p0 = projected[face.indices[0]];
        const p1 = projected[face.indices[1]];
        const p2 = projected[face.indices[2]];

        // Screen-space 2D normal for backface culling & winding
        const normalZ = (p1.px - p0.px) * (p2.py - p0.py) - (p1.py - p0.py) * (p2.px - p0.px);

        // 3D normal vector in view coordinates
        const v01x = p1.x - p0.x;
        const v01y = p1.y - p0.y;
        const v01z = p1.z - p0.z;

        const v02x = p2.x - p0.x;
        const v02y = p2.y - p0.y;
        const v02z = p2.z - p0.z;

        let nx = v01y * v02z - v01z * v02y;
        let ny = v01z * v02x - v01x * v02z;
        let nz = v01x * v02y - v01y * v02x;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        const dotL1 = nx * L1.x + ny * L1.y + nz * L1.z;
        const dotL2 = nx * L2.x + ny * L2.y + nz * L2.z;
        const dotL3 = nx * L3.x + ny * L3.y + nz * L3.z;

        const avgZ = (p0.z + p1.z + p2.z) / 3;

        return {
          face,
          normalZ,
          p0,
          p1,
          p2,
          avgZ,
          dotL1,
          dotL2,
          dotL3,
        };
      });

      // Painter's algorithm sort from farthest to nearest
      processedFacets.sort((a, b) => a.avgZ - b.avgZ);

      // -------------------------------------------------------------
      // PASS 1: BACK FACETS (INTERNAL PRISMATIC REFRACTION & GLOW)
      // -------------------------------------------------------------
      processedFacets.forEach(({ normalZ, p0, p1, p2, dotL2, dotL3, face }) => {
        if (normalZ < 0) {
          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.lineTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.closePath();

          const lightFactor = Math.max(0, dotL2) * 0.4 + Math.max(0, dotL3) * 0.35;
          const hue = (face.spectralHue || 205) + Math.sin(rotationAngleY * 2) * 15;

          const grad = ctx.createLinearGradient(p0.px, p0.py, p2.px, p2.py);
          grad.addColorStop(0, `hsla(${hue}, 85%, 88%, ${0.28 + lightFactor * 0.22})`);
          grad.addColorStop(0.5, `hsla(${hue + 25}, 80%, 94%, ${0.35 + lightFactor * 0.25})`);
          grad.addColorStop(1, `hsla(210, 90%, 86%, ${0.22 + lightFactor * 0.18})`);

          ctx.fillStyle = grad;
          ctx.fill();

          ctx.lineWidth = 0.8 * resMultiplier;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.40)';
          ctx.stroke();
        }
      });

      // -------------------------------------------------------------
      // PASS 2: FRONT-FACING FACETS (SPECULAR GLEAM & LIGHT SHIFT)
      // -------------------------------------------------------------
      const sparkles: { x: number; y: number; intensity: number; size: number; isGold?: boolean }[] = [];

      processedFacets.forEach(({ normalZ, p0, p1, p2, dotL1, dotL2, dotL3, face }) => {
        if (normalZ >= 0) {
          ctx.beginPath();
          ctx.moveTo(p0.px, p0.py);
          ctx.lineTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.closePath();

          // Specular highlights
          const specWhite = Math.pow(Math.max(0, dotL1), 7);
          const specGold = face.hasGoldAccent ? Math.pow(Math.max(0, dotL3), 8) : 0;
          const diffuse = Math.max(0, dotL1);
          const fillCyan = Math.max(0, dotL2);

          const grad = ctx.createLinearGradient(p0.px, p0.py, p2.px, p2.py);

          if (specGold > 0.4) {
            // Subtle golden reflection catch
            grad.addColorStop(0, 'rgba(254, 240, 138, 0.95)'); // soft warm gold
            grad.addColorStop(0.4, 'rgba(253, 230, 138, 0.85)');
            grad.addColorStop(1, 'rgba(219, 234, 254, 0.65)');
          } else if (specWhite > 0.42) {
            // Intense pristine white specular gleam
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
            grad.addColorStop(0.35, 'rgba(240, 249, 255, 0.90)');
            grad.addColorStop(1, 'rgba(186, 230, 253, 0.65)');
          } else if (face.type === 'table') {
            // Table octagonal facet: clear crystalline sky blue
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
            grad.addColorStop(0.5, 'rgba(240, 249, 255, 0.86)');
            grad.addColorStop(1, 'rgba(224, 242, 254, 0.72)');
          } else {
            // Triangular crown & pavilion facets: dynamic refraction
            const alpha = 0.50 + diffuse * 0.35 + fillCyan * 0.15;
            const hue = (face.spectralHue || 210) + Math.sin(rotationAngleY) * 20;

            if (face.hasGoldAccent && dotL3 > 0.25) {
              grad.addColorStop(0, `hsla(45, 90%, 94%, ${alpha})`); // subtle golden edge
              grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.95})`);
              grad.addColorStop(1, `hsla(205, 90%, 90%, ${alpha * 0.75})`);
            } else {
              grad.addColorStop(0, `hsla(${hue}, 85%, 96%, ${alpha})`);
              grad.addColorStop(0.45, `rgba(255, 255, 255, ${alpha * 0.92})`);
              grad.addColorStop(1, `hsla(210, 85%, 88%, ${alpha * 0.75})`);
            }
          }

          ctx.fillStyle = grad;
          ctx.fill();

          // High-contrast clean silver-cyan edges
          ctx.lineWidth = (specWhite > 0.3 || specGold > 0.35 ? 1.8 : 1.1) * resMultiplier;
          const edgeAlpha = Math.min(0.95, 0.45 + normalZ * 0.35);

          if (specGold > 0.4) {
            ctx.strokeStyle = `rgba(245, 158, 11, ${edgeAlpha * 0.85})`; // subtle gold line
          } else if (specWhite > 0.35) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha})`;
          } else {
            ctx.strokeStyle = `rgba(71, 85, 105, ${edgeAlpha * 0.65})`;
          }
          ctx.stroke();

          // Collect starburst sparkle points
          if (
            (specWhite > 0.55 || specGold > 0.52) &&
            (face.type === 'table' || face.type === 'star' || face.type === 'kite')
          ) {
            sparkles.push({
              x: (p0.px + p1.px + p2.px) / 3,
              y: (p0.py + p1.py + p2.py) / 3,
              intensity: Math.max(specWhite, specGold),
              size: (15 + Math.max(specWhite, specGold) * 18) * resMultiplier,
              isGold: specGold > specWhite,
            });
          }
        }
      });

      // -------------------------------------------------------------
      // PASS 3: STARBURST LENS FLARES & DIAMOND SPARKLES
      // -------------------------------------------------------------
      sparkles.forEach(({ x, y, size, isGold }) => {
        ctx.save();
        ctx.translate(x, y);

        // Core bright center dot
        ctx.fillStyle = isGold ? '#fef08a' : '#ffffff';
        ctx.shadowColor = isGold ? '#f59e0b' : '#38bdf8';
        ctx.shadowBlur = 12 * resMultiplier;
        ctx.beginPath();
        ctx.arc(0, 0, 3.4 * resMultiplier, 0, Math.PI * 2);
        ctx.fill();

        // Horizontal & vertical flare rays
        ctx.strokeStyle = isGold ? 'rgba(254, 240, 138, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.8 * resMultiplier;
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.moveTo(0, -size);
        ctx.lineTo(0, size);
        ctx.stroke();

        // Diagonal flare rays
        ctx.strokeStyle = isGold ? 'rgba(253, 230, 138, 0.75)' : 'rgba(186, 230, 253, 0.8)';
        ctx.lineWidth = 1.1 * resMultiplier;
        const diagSize = size * 0.65;
        ctx.beginPath();
        ctx.moveTo(-diagSize, -diagSize);
        ctx.lineTo(diagSize, diagSize);
        ctx.moveTo(-diagSize, diagSize);
        ctx.lineTo(diagSize, -diagSize);
        ctx.stroke();

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    // -------------------------------------------------------------
    // 5. AUTO-RESIZE FOR CRISP HIGH-DPI CANVAS RENDERING
    // -------------------------------------------------------------
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
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateSize);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[440px] sm:h-[490px] lg:h-[530px] flex flex-col items-center justify-center select-none"
    >
      {/* 1. Luminous Ambient Light Glow Halos (Cyan, Royal Blue, Soft Gold) */}
      <div className="absolute w-80 h-80 lg:w-[420px] lg:h-[420px] rounded-full bg-gradient-to-tr from-blue-300/35 via-sky-200/45 to-cyan-200/35 blur-3xl pointer-events-none -z-10" />
      <div className="absolute w-56 h-56 rounded-full bg-cyan-300/30 blur-2xl pointer-events-none -z-10 animate-base-pulse" />
      <div className="absolute -top-6 right-10 w-28 h-28 rounded-full bg-amber-200/20 blur-xl pointer-events-none -z-10" />

      {/* 2. FLOATING 3D FACETED DIAMOND CONTAINER (CLOCKWISE 360° SPIN + FLOATING) */}
      <div className="relative w-full h-[330px] sm:h-[370px] lg:h-[400px] flex items-center justify-center z-20 animate-diamond-float">
        <canvas
          ref={canvasRef}
          className="w-full h-full block pointer-events-none"
          style={{ width: '100%', height: '100%' }}
          title="3D Faceted Diamond - Automatic 360° Clockwise Rotation"
        />
      </div>

      {/* ======================================================== */}
      {/* 3. FUTURISTIC CIRCULAR GLASS PLATFORM / BASE            */}
      {/*    ROTATES IN OPPOSITE DIRECTION (ANTI-CLOCKWISE)       */}
      {/* ======================================================== */}
      <div
        className="absolute bottom-2 sm:bottom-4 lg:bottom-6 w-full max-w-[380px] sm:max-w-[430px] lg:max-w-[470px] h-[150px] flex items-center justify-center pointer-events-none z-10"
        style={{ perspective: '800px' }}
      >
        {/* Isometric 3D Platform Plane */}
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{ transform: 'rotateX(68deg)' }}
        >
          {/* Ring 1 (OUTER RING: ANTI-CLOCKWISE OPPOSITE ROTATION) */}
          <div className="absolute w-[360px] sm:w-[410px] h-[360px] sm:h-[410px] rounded-full animate-base-anticlockwise">
            <svg viewBox="0 0 400 400" className="w-full h-full">
              {/* Outer Cyan Glowing Track with Segmented Dashes */}
              <circle
                cx="200"
                cy="200"
                r="188"
                fill="none"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth="1.5"
                strokeDasharray="16 28"
              />
              <circle
                cx="200"
                cy="200"
                r="196"
                fill="none"
                stroke="rgba(37, 99, 235, 0.35)"
                strokeWidth="1.2"
                strokeDasharray="4 48"
              />
              {/* Glowing Corner Orbit Nodes */}
              <circle cx="200" cy="12" r="3.5" fill="#38bdf8" />
              <circle cx="388" cy="200" r="3.5" fill="#38bdf8" />
              <circle cx="200" cy="388" r="3.5" fill="#38bdf8" />
              <circle cx="12" cy="200" r="3.5" fill="#38bdf8" />
            </svg>
          </div>

          {/* Ring 2 (MIDDLE RING: CLOCKWISE SYNCHRONIZED ROTATION) */}
          <div className="absolute w-[290px] sm:w-[330px] h-[290px] sm:h-[330px] rounded-full animate-base-clockwise">
            <svg viewBox="0 0 320 320" className="w-full h-full">
              <circle
                cx="160"
                cy="160"
                r="148"
                fill="none"
                stroke="rgba(14, 165, 233, 0.55)"
                strokeWidth="1.8"
                strokeDasharray="12 18"
              />
              {/* Subtle Gold Precision Accents */}
              <circle cx="160" cy="12" r="2.5" fill="#fbbf24" />
              <circle cx="160" cy="308" r="2.5" fill="#fbbf24" />
            </svg>
          </div>

          {/* Ring 3 (INNER RING: ANTI-CLOCKWISE SPEED) */}
          <div className="absolute w-[220px] sm:w-[250px] h-[220px] sm:h-[250px] rounded-full animate-base-anticlockwise">
            <svg viewBox="0 0 240 240" className="w-full h-full">
              <circle
                cx="120"
                cy="120"
                r="112"
                fill="none"
                stroke="rgba(56, 189, 248, 0.70)"
                strokeWidth="2"
                strokeDasharray="32 14"
              />
            </svg>
          </div>

          {/* Frosted Glass Core Platform Disc */}
          <div className="absolute w-[180px] sm:w-[210px] h-[180px] sm:h-[210px] rounded-full bg-gradient-to-tr from-sky-400/20 via-white/50 to-cyan-400/25 backdrop-blur-md border-2 border-cyan-400/50 shadow-[0_0_35px_rgba(56,189,248,0.40)] flex items-center justify-center">
            {/* Center glowing caustic pool */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-400/35 via-cyan-300/45 to-sky-300/35 blur-md animate-pulse" />
            
            {/* Glass Surface Radial Reflection Ring */}
            <div className="absolute inset-2 rounded-full border border-white/60" />
            <div className="absolute inset-5 rounded-full border border-cyan-300/40 border-dashed" />
          </div>

          {/* Soft Ground Contact Shadow / Light Splash */}
          <div className="absolute w-[240px] sm:w-[280px] h-[70px] rounded-full bg-blue-900/10 blur-xl -z-10" />
        </div>
      </div>
    </div>
  );
};
