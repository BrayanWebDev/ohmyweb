import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import BlackHoleSignature from "../BlackHoleSignature/BlackHoleSignature";

export default function Scene({ stage }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <BlackHoleSignature stage={stage} />
      <Preload all />
    </Canvas>
  );
}
