// BlackHoleSignature.jsx
import { useEffect, useMemo, useRef, useCallback } from "react";
import { useFrame, extend } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Object3D,
  DoubleSide,
} from "three";
import { shaderMaterial } from "@react-three/drei";
import gsap from "gsap";

/** PRNG determinístico (puro): mulberry32 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sprite suave (smoke) procedural */
function makeNebulaSprite(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.45)");
  g.addColorStop(0.5, "rgba(255,255,255,0.14)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

function makeNebulaPositions({ count, radius, seed }) {
  const rand = mulberry32(seed);
  const arr = new Float32Array(count * 3);

  const clumps = [
    { x: -0.9, y: 0.35, z: 0.15 },
    { x: 0.65, y: -0.25, z: -0.35 },
    { x: 0.15, y: 0.55, z: -0.1 },
    { x: -0.35, y: -0.15, z: 0.25 },
  ];

  for (let i = 0; i < count; i++) {
    const isClump = rand() < 0.72;
    const c = clumps[Math.floor(rand() * clumps.length)];

    const r = radius * Math.pow(rand(), isClump ? 2.35 : 1.35);
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const phi = Math.acos(u);

    let x = r * Math.sin(phi) * Math.cos(theta);
    let y = r * Math.sin(phi) * Math.sin(theta);
    let z = r * Math.cos(phi);

    y *= 0.55;

    if (isClump) {
      const tight = 0.48 + rand() * 0.32;
      x = x * tight + c.x;
      y = y * tight + c.y;
      z = z * tight + c.z;
    }

    arr[i * 3 + 0] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }

  return arr;
}

function NebulaLayer({
  count,
  radius,
  seed,
  color,
  size,
  rot,
  materialRef,
  spriteTex,
}) {
  const pointsRef = useRef();

  const positions = useMemo(() => {
    return makeNebulaPositions({ count, radius, seed });
  }, [count, radius, seed]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * rot;
    pointsRef.current.rotation.x += delta * (rot * 0.25);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>

      <pointsMaterial
        ref={materialRef}
        map={spriteTex}
        alphaMap={spriteTex}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        color={color}
        size={size}
        opacity={1}
        alphaTest={0.02}
        sizeAttenuation
      />
    </points>
  );
}

/* -------------------- GAS / NUBES -------------------- */

const NebulaGasMaterial = shaderMaterial(
  {
    uTime: 0,
    uOpacity: 0.25,
    uContrast: 1.35,
    uWarp: 0.3,
    uColorA: new Color("#ff4fbf"),
    uColorB: new Color("#6a4cff"),
    uColorC: new Color("#8fd3ff"),
  },
  `varying vec2 vUv;
   void main() {
     vUv = uv;
     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }`,
  `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uContrast;
  uniform float uWarp;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
  }

  float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    for(int i=0;i<5;i++){
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;

    float w = fbm(uv * 2.2 + vec2(uTime * 0.02, -uTime * 0.015));
    uv += (w - 0.5) * uWarp;

    float r = length(p);
    float core = smoothstep(0.60, 0.0, r);
    float edge = smoothstep(0.98, 0.22, r);

    float n1 = fbm(uv * 2.8 + vec2(uTime * 0.03, -uTime * 0.02));
    float n2 = fbm(uv * 6.4 - vec2(uTime * 0.02,  uTime * 0.03));
    float cloud = mix(n1, n2, 0.55);

    cloud = pow(cloud, uContrast);

    float a = core * edge * (0.12 + cloud * 1.05);
    a = smoothstep(0.18, 0.92, a);

    vec3 col = mix(uColorB, uColorA, cloud);
    col = mix(col, uColorC, core * 0.35);

    gl_FragColor = vec4(col, a * uOpacity);
    if (gl_FragColor.a < 0.02) discard;
  }`
);

extend({ NebulaGasMaterial });

function NebulaGas({ matRef, meshRef, base }) {
  useEffect(() => {
    const m = meshRef?.current;
    if (!m) return;
    const [sx, sy, sz] = base.scale;
    const [px, py, pz] = base.pos;
    m.position.set(px, py, pz);
    m.scale.set(sx, sy, sz);
    m.rotation.set(0, 0, base.rotZ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uTime += delta;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1, 1, 1]} />
      {/* @ts-ignore */}
      <nebulaGasMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

/* -------------------- ESTRELLAS CENTRALES -------------------- */

function CentralSwirlStars({
  count = 180,
  seed = 4242,
  spriteTex,
  swirlRef,
  opacityRef,
}) {
  const instRef = useRef();
  const matRef = useRef();
  const dummy = useMemo(() => new Object3D(), []);

  const bases = useMemo(() => {
    const rand = mulberry32(seed);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const r = 0.35 + rand() * 1.35;
      const a = rand() * Math.PI * 2;
      const y = (rand() * 2 - 1) * 0.35;
      const z = (rand() * 2 - 1) * 0.25;
      const size = 0.04 + rand() * 0.08;
      const phase = rand() * Math.PI * 2;
      const w = 0.6 + rand() * 1.2;
      arr.push({ r, a, y, z, size, phase, w });
    }
    return arr;
  }, [count, seed]);

  useEffect(() => {
    if (!instRef.current) return;
    instRef.current.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);

  useFrame((state) => {
    const inst = instRef.current;
    const mat = matRef.current;
    if (!inst || !mat) return;

    const t = state.clock.elapsedTime;
    const p = swirlRef.current;
    const o = opacityRef.current;

    mat.opacity = 0.95 * o * (1 - p * 0.85);

    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      const ang = b.a + t * 0.35 * b.w + p * 6.2;
      const rr = b.r * (1 - p);

      const wob = 0.08 * Math.sin(t * 1.2 * b.w + b.phase);

      const x = Math.cos(ang) * rr + wob;
      const y = b.y * (1 - p) + wob * 0.4;
      const z = b.z * (1 - p);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, ang * 0.15);
      const s = b.size * (1 - p * 0.6);
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={instRef} args={[null, null, bases.length]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        map={spriteTex}
        alphaMap={spriteTex}
        opacity={0}
        color={"white"}
      />
    </instancedMesh>
  );
}

/* -------------------- FX -------------------- */

function BurstSprite({ spriteTex, burstRef }) {
  const meshRef = useRef();
  const matRef = useRef();

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;

    const a = burstRef.current.a;
    const s = burstRef.current.s;

    matRef.current.opacity = a;
    meshRef.current.scale.set(s, s, 1);

    burstRef.current.a = Math.max(0, burstRef.current.a - delta * 3.2);
    burstRef.current.s = Math.max(0, burstRef.current.s - delta * 0.35);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.05]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        map={spriteTex}
        alphaMap={spriteTex}
        color={"white"}
        opacity={0}
      />
    </mesh>
  );
}

function ShockwaveRing({ shockRef }) {
  const meshRef = useRef();
  const matRef = useRef();

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;

    const a = shockRef.current.a;
    const s = shockRef.current.s;

    matRef.current.opacity = a;
    meshRef.current.scale.set(s, s, 1);

    shockRef.current.a = Math.max(0, shockRef.current.a - delta * 1.8);
    shockRef.current.s = Math.min(20, shockRef.current.s + delta * 6.0);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[Math.PI / 2.2, 0, 0]}
      position={[0, 0, 0.06]}
    >
      <ringGeometry args={[1.25, 1.75, 64]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
        color={"white"}
        opacity={0}
      />
    </mesh>
  );
}

function MicroExplosion({ spriteTex, flashRef }) {
  const meshRef = useRef();
  const matRef = useRef();

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;

    const a = flashRef.current.a;
    const s = flashRef.current.s;

    matRef.current.opacity = a;
    meshRef.current.scale.set(s, s, 1);

    flashRef.current.a = Math.max(0, flashRef.current.a - delta * 2.8);
    flashRef.current.s = Math.max(0, flashRef.current.s - delta * 0.2);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.02]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        map={spriteTex}
        alphaMap={spriteTex}
        color={"white"}
        opacity={0}
      />
    </mesh>
  );
}

/* -------------------- FX EXTRA (PARTÍCULAS + RAYOS) -------------------- */

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function BurstParticles({ spriteTex, fxRef, count = 220, seed = 9001 }) {
  const instRef = useRef();
  const matRef = useRef();
  const dummy = useMemo(() => new Object3D(), []);

  const particles = useMemo(() => {
    const rand = mulberry32(seed);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) };

      const speed = 2.2 + rand() * 6.5;
      const spin = (rand() * 2 - 1) * 6.0;
      const size = 0.03 + rand() * 0.09;
      const z = 0.03 + rand() * 0.12;
      const phase = rand() * Math.PI * 2;

      arr.push({ dir, speed, spin, size, z, phase });
    }
    return arr;
  }, [count, seed]);

  useEffect(() => {
    if (!instRef.current) return;
    instRef.current.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);

  useFrame((state, delta) => {
    const inst = instRef.current;
    const mat = matRef.current;
    if (!inst || !mat) return;

    const fx = fxRef.current;
    if (!fx.active) {
      mat.opacity = 0;
      return;
    }

    fx.t += delta;
    const t = fx.t;

    const LIFE = 0.75;
    const lifeN = Math.min(1, t / LIFE);

    const fadeIn = smoothstep(0.0, 0.08, lifeN);
    const fadeOut = 1.0 - smoothstep(0.35, 1.0, lifeN);
    mat.opacity = 0.95 * fadeIn * fadeOut;

    const swirl = 1.8 * (1.0 - lifeN);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      const dist = p.speed * t;

      const wob =
        0.25 * Math.sin(state.clock.elapsedTime * 10.0 + p.phase) * (1 - lifeN);

      const ang = Math.atan2(p.dir.y, p.dir.x) + swirl * lifeN;

      const x = Math.cos(ang) * dist + wob * p.dir.y;
      const y = Math.sin(ang) * dist * 0.55 - wob * p.dir.x;

      dummy.position.set(x, y, p.z);

      const s = p.size * (1.0 - lifeN * 0.55);
      dummy.scale.set(s, s, 1);

      dummy.rotation.set(0, 0, ang + p.spin * t);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;

    if (t >= LIFE) {
      fx.active = false;
      fx.t = 0;
    }
  });

  return (
    <instancedMesh ref={instRef} args={[null, null, particles.length]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        map={spriteTex}
        alphaMap={spriteTex}
        opacity={0}
        color={"white"}
      />
    </instancedMesh>
  );
}

function EnergyRays({ spriteTex, fxRef, count = 24, seed = 7331 }) {
  const instRef = useRef();
  const matRef = useRef();
  const dummy = useMemo(() => new Object3D(), []);

  const rays = useMemo(() => {
    const rand = mulberry32(seed);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rand() * 0.25 - 0.125);
      const len = 0.9 + rand() * 1.9;
      const w = 0.06 + rand() * 0.12;
      const rot = (rand() * 2 - 1) * 0.6;
      arr.push({ ang, len, w, rot });
    }
    return arr;
  }, [count, seed]);

  useEffect(() => {
    if (!instRef.current) return;
    instRef.current.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);

  useFrame((_, delta) => {
    const inst = instRef.current;
    const mat = matRef.current;
    if (!inst || !mat) return;

    const fx = fxRef.current;
    if (!fx.active) {
      mat.opacity = 0;
      return;
    }

    fx.t += delta;
    const t = fx.t;

    const LIFE = 0.35;
    const n = Math.min(1, t / LIFE);

    const fadeIn = smoothstep(0.0, 0.12, n);
    const fadeOut = 1.0 - smoothstep(0.25, 1.0, n);
    mat.opacity = 1.0 * fadeIn * fadeOut;

    const grow = smoothstep(0.0, 0.25, n);

    for (let i = 0; i < rays.length; i++) {
      const r = rays[i];

      const x = Math.cos(r.ang) * (0.2 + 0.35 * grow);
      const y = Math.sin(r.ang) * (0.2 + 0.18 * grow) * 0.55;

      dummy.position.set(x, y, 0.08);
      dummy.rotation.set(0, 0, r.ang + r.rot);

      dummy.scale.set(r.w, r.len * (0.7 + 0.9 * grow), 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;

    if (t >= LIFE) {
      fx.active = false;
      fx.t = 0;
    }
  });

  return (
    <instancedMesh ref={instRef} args={[null, null, rays.length]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        map={spriteTex}
        alphaMap={spriteTex}
        opacity={0}
        color={"white"}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* ✅ Ajuste: subimos nebulaOpacity en star y supergiant para que el fondo NO se oscurezca tanto */

const STAGES = {
  nebula: {
    coreGlow: 0.05,
    coreOpacity: 0.08,
    coreScale: 0.65,
    diskScale: 0.0,
    spin: 0.05,
    nebulaOpacity: 1.0,
    diskOpacity: 0.0,
    emissive: "#ffffff",
  },
  star: {
    coreGlow: 1.35,
    coreOpacity: 1.0,
    coreScale: 1.05,
    diskScale: 1.6,
    spin: 0.5,
    nebulaOpacity: 0.62, // ⬅️ antes 0.45 (se oscurecía demasiado)
    diskOpacity: 0.5,
    emissive: "#fff6d6",
  },
  supergiant: {
    // “gigante roja”
    coreGlow: 2.35,
    coreOpacity: 1.0,
    coreScale: 1.42,
    diskScale: 3.15,
    spin: 1.05,
    nebulaOpacity: 0.48, // ⬅️ antes 0.28 (muy oscuro)
    diskOpacity: 0.75,
    emissive: "#ff6a2a",
  },
};

const GAS_BASE = [
  { scale: [9.6, 5.4, 1], pos: [0.0, 0.0, -0.35], rotZ: 0.1 },
  { scale: [7.8, 4.3, 1], pos: [0.6, -0.2, -0.28], rotZ: -0.22 },
  { scale: [6.3, 3.7, 1], pos: [-0.7, 0.25, -0.25], rotZ: 0.32 },
  { scale: [5.6, 3.2, 1], pos: [1.05, 0.15, -0.22], rotZ: -0.55 },
  { scale: [5.2, 3.0, 1], pos: [-1.05, -0.15, -0.2], rotZ: 0.62 },
];

const GAS_SPEEDS = [0.01, 0.012, 0.009, 0.008, 0.007];

export default function BlackHoleSignature({ stage = "nebula" }) {
  const coreRef = useRef();
  const coreMatRef = useRef();
  const diskRef = useRef();
  const diskMatRef = useRef();

  const nebulaOuterMatRef = useRef();
  const nebulaMidMatRef = useRef();
  const nebulaCoreMatRef = useRef();

  const gasARef = useRef();
  const gasBRef = useRef();
  const gasCRef = useRef();
  const gasDRef = useRef();
  const gasERef = useRef();

  const gasAMeshRef = useRef();
  const gasBMeshRef = useRef();
  const gasCMeshRef = useRef();
  const gasDMeshRef = useRef();
  const gasEMeshRef = useRef();

  const spinRef = useRef(STAGES.nebula.spin);
  const nebulaOpacityRef = useRef(STAGES.nebula.nebulaOpacity);

  const swirlRef = useRef(0);
  const swirlTargetRef = useRef(0);

  const swirlStarsOpacityRef = useRef(1);

  const microFlashRef = useRef({ a: 0, s: 1.0 });
  const burstRef = useRef({ a: 0, s: 2.8 });
  const shockRef = useRef({ a: 0, s: 0.15 });

  const burstParticlesFxRef = useRef({ active: false, t: 0 });
  const energyRaysFxRef = useRef({ active: false, t: 0 });

  const lastStageRef = useRef("nebula");
  const gasStartRef = useRef(null);

  const tlRef = useRef(null);

  const coreEmissiveRef = useRef({ r: 1, g: 1, b: 1 });

  const BASE_OUTER = 1.6;
  const BASE_MID = 1.35;
  const BASE_CORE = 1.1;

  const Y_FLATTEN = 0.55;
  const SWIRL_TURNS = 6.0;

  const spriteTex = useMemo(() => {
    const c = makeNebulaSprite(128);
    const t = new CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);

  const setEmissiveToStage = useCallback((k) => {
    const col = new Color(STAGES[k].emissive);
    coreEmissiveRef.current.r = col.r;
    coreEmissiveRef.current.g = col.g;
    coreEmissiveRef.current.b = col.b;
    if (coreMatRef.current) coreMatRef.current.emissive.setRGB(col.r, col.g, col.b);
  }, []);

  const tweenEmissiveToStage = useCallback((tl, k, at, dur = 0.9, ease = "power2.out") => {
    const col = new Color(STAGES[k].emissive);
    tl.to(coreEmissiveRef.current, { r: col.r, g: col.g, b: col.b, duration: dur, ease }, at);
  }, []);

  const fireBoom = useCallback(
    ({
      shockA = 0.9,
      shockS = 0.15,
      burstA = 1.0,
      burstS = 3.4,
      microA = 0.9,
      microS = 1.2,
      rays = true,
      particles = true,
    } = {}) => {
      shockRef.current.a = shockA;
      shockRef.current.s = shockS;

      burstRef.current.a = burstA;
      burstRef.current.s = burstS;

      microFlashRef.current.a = microA;
      microFlashRef.current.s = microS;

      if (rays) {
        energyRaysFxRef.current.active = true;
        energyRaysFxRef.current.t = 0;
      }
      if (particles) {
        burstParticlesFxRef.current.active = true;
        burstParticlesFxRef.current.t = 0;
      }
    },
    []
  );

  const captureGasPolar = useCallback(() => {
    const meshes = [
      gasAMeshRef.current,
      gasBMeshRef.current,
      gasCMeshRef.current,
      gasDMeshRef.current,
      gasEMeshRef.current,
    ];

    if (meshes.every(Boolean)) {
      gasStartRef.current = meshes.map((m) => {
        const x = m.position.x;
        const y = m.position.y;
        return {
          r0: Math.hypot(x, y),
          theta0: Math.atan2(y, x),
          z0: m.position.z,
          scale: [m.scale.x, m.scale.y, m.scale.z],
          rotZ: m.rotation.z,
        };
      });
    } else {
      gasStartRef.current = null;
    }
  }, []);

  const applyStageToRefs = useCallback(
    (k) => {
      const s = STAGES[k];
      nebulaOpacityRef.current = s.nebulaOpacity;
      spinRef.current = s.spin;

      if (coreRef.current) coreRef.current.scale.set(s.coreScale, s.coreScale, s.coreScale);
      if (coreMatRef.current) {
        coreMatRef.current.opacity = s.coreOpacity;
        coreMatRef.current.emissiveIntensity = s.coreGlow;
      }

      if (diskRef.current) diskRef.current.scale.set(s.diskScale, s.diskScale, 1);
      if (diskMatRef.current) diskMatRef.current.opacity = s.diskOpacity;

      setEmissiveToStage(k);
    },
    [setEmissiveToStage]
  );

  const runNebulaToStar = useCallback(
    (tl, at = 0) => {
      captureGasPolar();

      swirlTargetRef.current = swirlRef.current;
      swirlStarsOpacityRef.current = 1;

      tl.to(swirlTargetRef, { current: 1, duration: 1.6, ease: "power3.inOut" }, at);
      tl.to(nebulaOpacityRef, { current: STAGES.star.nebulaOpacity, duration: 1.2, ease: "power2.out" }, at + 0.1);

      tl.add(() => {
        fireBoom({
          shockA: 0.95,
          shockS: 0.15,
          burstA: 1.0,
          burstS: 3.6,
          microA: 0.95,
          microS: 1.25,
          rays: true,
          particles: true,
        });
      }, at + 1.42);

      const s = STAGES.star;

      if (coreRef.current) {
        tl.to(coreRef.current.scale, { x: s.coreScale, y: s.coreScale, z: s.coreScale, duration: 0.45, ease: "power3.out" }, at + 1.48);
      }
      if (coreMatRef.current) {
        tl.to(coreMatRef.current, { opacity: s.coreOpacity, emissiveIntensity: s.coreGlow, duration: 0.55, ease: "power3.out" }, at + 1.48);
      }
      tweenEmissiveToStage(tl, "star", at + 1.48, 0.7, "power2.out");

      if (diskRef.current) {
        tl.to(diskRef.current.scale, { x: s.diskScale, y: s.diskScale, z: 1, duration: 0.9, ease: "power3.out" }, at + 1.58);
      }
      if (diskMatRef.current) {
        tl.to(diskMatRef.current, { opacity: s.diskOpacity, duration: 0.7, ease: "power2.out" }, at + 1.58);
      }

      tl.to(spinRef, { current: s.spin, duration: 0.9, ease: "power2.out" }, at + 1.58);
      tl.to(swirlStarsOpacityRef, { current: 0, duration: 0.35, ease: "power2.out" }, at + 1.48);

      return at + 2.05;
    },
    [captureGasPolar, fireBoom, tweenEmissiveToStage]
  );

  const runStarToSupergiant = useCallback(
    (tl, at = 0) => {
      const s = STAGES.supergiant;

      if (coreRef.current) {
        tl.to(
          coreRef.current.scale,
          {
            keyframes: [
              { x: STAGES.star.coreScale * 1.04, y: STAGES.star.coreScale * 1.04, z: STAGES.star.coreScale * 1.04, duration: 0.18, ease: "power2.out" },
              { x: STAGES.star.coreScale * 0.985, y: STAGES.star.coreScale * 0.985, z: STAGES.star.coreScale * 0.985, duration: 0.22, ease: "power2.inOut" },
              { x: STAGES.star.coreScale * 1.06, y: STAGES.star.coreScale * 1.06, z: STAGES.star.coreScale * 1.06, duration: 0.20, ease: "power2.out" },
            ],
          },
          at
        );
      }

      tl.add(() => {
        fireBoom({ shockA: 0.65, shockS: 0.28, burstA: 0.85, burstS: 3.2, microA: 0.35, microS: 1.1, rays: true, particles: true });
      }, at + 0.18);

      tl.add(() => {
        fireBoom({ shockA: 0.95, shockS: 0.18, burstA: 1.0, burstS: 4.4, microA: 0.55, microS: 1.25, rays: true, particles: true });
      }, at + 0.52);

      if (coreMatRef.current) {
        tl.to(coreMatRef.current, { emissiveIntensity: s.coreGlow, opacity: s.coreOpacity, duration: 1.0, ease: "power3.out" }, at + 0.15);
      }
      tweenEmissiveToStage(tl, "supergiant", at + 0.1, 1.2, "power2.out");

      if (coreRef.current) {
        tl.to(
          coreRef.current.scale,
          {
            keyframes: [
              { x: s.coreScale * 0.92, y: s.coreScale * 0.92, z: s.coreScale * 0.92, duration: 0.22, ease: "power2.in" },
              { x: s.coreScale * 1.04, y: s.coreScale * 1.04, z: s.coreScale * 1.04, duration: 0.30, ease: "power3.out" },
              { x: s.coreScale, y: s.coreScale, z: s.coreScale, duration: 0.55, ease: "power3.out" },
            ],
          },
          at + 0.35
        );
      }

      if (diskRef.current) {
        tl.to(
          diskRef.current.scale,
          {
            keyframes: [
              { x: s.diskScale * 0.85, y: s.diskScale * 0.85, z: 1, duration: 0.25, ease: "power2.in" },
              { x: s.diskScale * 1.06, y: s.diskScale * 1.06, z: 1, duration: 0.35, ease: "power3.out" },
              { x: s.diskScale, y: s.diskScale, z: 1, duration: 0.55, ease: "power3.out" },
            ],
          },
          at + 0.35
        );
      }
      if (diskMatRef.current) {
        tl.to(diskMatRef.current, { opacity: s.diskOpacity, duration: 1.0, ease: "power2.out" }, at + 0.35);
      }

      // ✅ aquí estaba el oscurecimiento: ahora el target nebulaOpacity es más alto (ver STAGES)
      tl.to(nebulaOpacityRef, { current: s.nebulaOpacity, duration: 1.0, ease: "power2.out" }, at + 0.2);
      tl.to(spinRef, { current: s.spin, duration: 1.2, ease: "power2.out" }, at + 0.2);

      tl.add(() => {
        energyRaysFxRef.current.active = true;
        energyRaysFxRef.current.t = 0;
        burstParticlesFxRef.current.active = true;
        burstParticlesFxRef.current.t = 0;
      }, at + 1.15);

      return at + 1.6;
    },
    [fireBoom, tweenEmissiveToStage]
  );

  useFrame((_, delta) => {
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.12;
    if (diskRef.current) diskRef.current.rotation.y += delta * spinRef.current;

    if (coreMatRef.current) {
      coreMatRef.current.emissive.setRGB(coreEmissiveRef.current.r, coreEmissiveRef.current.g, coreEmissiveRef.current.b);
    }

    swirlRef.current += (swirlTargetRef.current - swirlRef.current) * (1 - Math.pow(0.0008, delta));

    const o = nebulaOpacityRef.current;

    if (nebulaOuterMatRef.current) nebulaOuterMatRef.current.opacity = BASE_OUTER * o;
    if (nebulaMidMatRef.current) nebulaMidMatRef.current.opacity = BASE_MID * o;
    if (nebulaCoreMatRef.current) nebulaCoreMatRef.current.opacity = BASE_CORE * o;

    if (gasARef.current) gasARef.current.uOpacity = 0.45 * o;
    if (gasBRef.current) gasBRef.current.uOpacity = 0.30 * o;
    if (gasCRef.current) gasCRef.current.uOpacity = 0.18 * o;
    if (gasDRef.current) gasDRef.current.uOpacity = 0.16 * o;
    if (gasERef.current) gasERef.current.uOpacity = 0.14 * o;

    const p = swirlRef.current;

    const meshes = [gasAMeshRef.current, gasBMeshRef.current, gasCMeshRef.current, gasDMeshRef.current, gasEMeshRef.current];

    if (p < 0.0001) {
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (!m) continue;
        m.rotation.z += delta * GAS_SPEEDS[i];
      }
    }

    if (p > 0.0001) {
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (!m) continue;

        const start = gasStartRef.current?.[i] ?? {
          r0: Math.hypot(m.position.x, m.position.y),
          theta0: Math.atan2(m.position.y, m.position.x),
          z0: m.position.z,
          scale: [m.scale.x, m.scale.y, m.scale.z],
          rotZ: m.rotation.z,
        };

        const theta = start.theta0 + p * SWIRL_TURNS;
        const r = start.r0 * (1 - p);

        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r * Y_FLATTEN;

        m.position.set(x, y, start.z0);

        const [sx, sy, sz] = start.scale;
        const k = 1 - p * 0.78;
        m.scale.set(sx * k, sy * k, sz);

        m.rotation.z = start.rotZ + p * 1.25;
      }
    }
  });

  useEffect(() => {
    const prev = lastStageRef.current;
    lastStageRef.current = stage;

    if (tlRef.current) {
      tlRef.current.kill();
      tlRef.current = null;
    }

    if (stage === "nebula") {
      swirlTargetRef.current = 0;
      swirlStarsOpacityRef.current = 1;
      gasStartRef.current = null;

      applyStageToRefs("nebula");

      microFlashRef.current.a = 0; microFlashRef.current.s = 1.0;
      burstRef.current.a = 0; burstRef.current.s = 2.8;
      shockRef.current.a = 0; shockRef.current.s = 0.15;
      burstParticlesFxRef.current.active = false; burstParticlesFxRef.current.t = 0;
      energyRaysFxRef.current.active = false; energyRaysFxRef.current.t = 0;

      return;
    }

    const tl = gsap.timeline({ defaults: { overwrite: true } });
    tlRef.current = tl;

    if (prev === "nebula" && stage === "star") {
      runNebulaToStar(tl, 0);
      return () => tl.kill();
    }

    if (prev === "star" && stage === "supergiant") {
      runStarToSupergiant(tl, 0);
      return () => tl.kill();
    }

    if (prev === "nebula" && stage === "supergiant") {
      const endStar = runNebulaToStar(tl, 0);
      runStarToSupergiant(tl, endStar + 0.08);
      return () => tl.kill();
    }

    applyStageToRefs(stage);
    return () => tl.kill();
  }, [stage, applyStageToRefs, runNebulaToStar, runStarToSupergiant]);

  useEffect(() => {
    applyStageToRefs("nebula");
  }, [applyStageToRefs]);

  return (
    <group>
      {/* GAS */}
      <NebulaGas matRef={gasARef} meshRef={gasAMeshRef} base={GAS_BASE[0]} />
      <NebulaGas matRef={gasBRef} meshRef={gasBMeshRef} base={GAS_BASE[1]} />
      <NebulaGas matRef={gasCRef} meshRef={gasCMeshRef} base={GAS_BASE[2]} />
      <NebulaGas matRef={gasDRef} meshRef={gasDMeshRef} base={GAS_BASE[3]} />
      <NebulaGas matRef={gasERef} meshRef={gasEMeshRef} base={GAS_BASE[4]} />

      {/* Estrellitas centrales */}
      <CentralSwirlStars
        count={180}
        seed={4242}
        spriteTex={spriteTex}
        swirlRef={swirlRef}
        opacityRef={swirlStarsOpacityRef}
      />

      {/* FX */}
      <EnergyRays spriteTex={spriteTex} fxRef={energyRaysFxRef} />
      <ShockwaveRing shockRef={shockRef} />
      <BurstSprite spriteTex={spriteTex} burstRef={burstRef} />
      <MicroExplosion spriteTex={spriteTex} flashRef={microFlashRef} />
      <BurstParticles spriteTex={spriteTex} fxRef={burstParticlesFxRef} />

      {/* Partículas */}
      <NebulaLayer
        count={1000}
        radius={6.6}
        seed={1337}
        color="#6a4cff"
        size={0.12}
        rot={0.02}
        materialRef={nebulaOuterMatRef}
        spriteTex={spriteTex}
      />
      <NebulaLayer
        count={820}
        radius={5.0}
        seed={2024}
        color="#ff4fbf"
        size={0.095}
        rot={0.035}
        materialRef={nebulaMidMatRef}
        spriteTex={spriteTex}
      />
      <NebulaLayer
        count={600}
        radius={3.6}
        seed={777}
        color="#8fd3ff"
        size={0.07}
        rot={0.05}
        materialRef={nebulaCoreMatRef}
        spriteTex={spriteTex}
      />

      {/* Núcleo */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color={"#080808"}
          emissive={"white"}
          emissiveIntensity={STAGES.nebula.coreGlow}
          transparent
          opacity={STAGES.nebula.coreOpacity}
          metalness={0.05}
          roughness={0.35}
        />
      </mesh>

      {/* Disco */}
      <mesh
        ref={diskRef}
        rotation={[Math.PI / 2.2, 0, 0]}
        scale={[STAGES.nebula.diskScale, STAGES.nebula.diskScale, 1]}
      >
        <ringGeometry args={[1.3, 2.2, 64]} />
        <meshStandardMaterial
          ref={diskMatRef}
          color={"#222222"}
          emissive={"white"}
          emissiveIntensity={0.6}
          transparent
          opacity={STAGES.nebula.diskOpacity}
          side={2}
        />
      </mesh>
    </group>
  );
}
