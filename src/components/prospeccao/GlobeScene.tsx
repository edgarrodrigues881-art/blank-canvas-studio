import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";

/* ───────────── Atmosphere Shader ───────────── */
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 glowColor;
  void main() {
    float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
    gl_FragColor = vec4(glowColor, intensity * 0.55);
  }
`;

/* ───────────── Atmosphere Component ───────────── */
function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color(0.25, 0.75, 0.55) },
        },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  return (
    <mesh scale={[1.14, 1.14, 1.14]}>
      <sphereGeometry args={[1, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* ───────────── Earth Sphere ───────────── */
function Earth({ autoRotate }: { autoRotate: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const [colorMap, bumpMap, specMap] = useLoader(THREE.TextureLoader, [
    "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg",
    "https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png",
    "https://unpkg.com/three-globe@2.41.12/example/img/earth-water.png",
  ]);

  useFrame((_, delta) => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.06;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      <meshPhongMaterial
        map={colorMap}
        bumpMap={bumpMap}
        bumpScale={0.015}
        specularMap={specMap}
        specular={new THREE.Color(0x222222)}
        shininess={15}
      />
    </mesh>
  );
}

/* ───────────── Marker with Pulse ───────────── */
interface MarkerProps {
  lat: number;
  lng: number;
  radiusKm: number;
}

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function Marker({ lat, lng, radiusKm }: MarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const position = useMemo(() => latLngToVector3(lat, lng, 1.005), [lat, lng]);

  // Normal vector pointing outward from globe center
  const normal = useMemo(() => position.clone().normalize(), [position]);

  // Ring size proportional to radius
  const ringScale = useMemo(() => Math.max(0.02, radiusKm / 800), [radiusKm]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Pulse animation
    if (pulseRef.current) {
      const scale = 1 + Math.sin(t * 3) * 0.3;
      pulseRef.current.scale.set(scale, scale, scale);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.6 - Math.sin(t * 3) * 0.3;
    }

    // Ring pulse
    if (ringRef.current) {
      const ringPulse = 1 + Math.sin(t * 1.5) * 0.08;
      ringRef.current.scale.set(ringPulse, ringPulse, ringPulse);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.25 + Math.sin(t * 1.5) * 0.1;
    }
  });

  // Orient group to face outward
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return q;
  }, [normal]);

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      {/* Core dot */}
      <mesh>
        <sphereGeometry args={[0.008, 16, 16]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>

      {/* Inner glow */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.4} />
      </mesh>

      {/* Radius ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringScale * 0.9, ringScale, 64]} />
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Filled radius area */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ringScale * 0.9, 64]} />
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/* ───────────── Camera Controller ───────────── */
interface CameraControllerProps {
  target: { lat: number; lng: number } | null;
  controlsRef: React.MutableRefObject<any>;
}

function CameraController({ target, controlsRef }: CameraControllerProps) {
  const { camera } = useThree();
  const animating = useRef(false);
  const startTime = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const prevTarget = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    if (
      prevTarget.current &&
      Math.abs(prevTarget.current.lat - target.lat) < 0.001 &&
      Math.abs(prevTarget.current.lng - target.lng) < 0.001
    )
      return;

    prevTarget.current = target;

    const dest = latLngToVector3(target.lat, target.lng, 2.8);
    startPos.current.copy(camera.position);
    endPos.current.copy(dest);
    startTime.current = performance.now();
    animating.current = true;
  }, [target, camera]);

  useFrame(() => {
    if (!animating.current) return;

    const elapsed = (performance.now() - startTime.current) / 1000;
    const duration = 1.8;
    let t = Math.min(elapsed / duration, 1);
    // Ease in-out cubic
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startPos.current, endPos.current, t);
    camera.lookAt(0, 0, 0);

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }

    if (t >= 1) {
      animating.current = false;
    }
  });

  return null;
}

/* ───────────── Main Scene ───────────── */
interface GlobeSceneProps {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  onGlobeClick?: (lat: number, lng: number) => void;
}

export default function GlobeScene({ center, radiusKm, onGlobeClick }: GlobeSceneProps) {
  const controlsRef = useRef<any>(null);
  const [autoRotate, setAutoRotate] = useState(!center);

  useEffect(() => {
    setAutoRotate(!center);
  }, [center]);

  const handlePointerUp = (e: any) => {
    if (!onGlobeClick) return;

    // Get intersection point on the sphere
    const point: THREE.Vector3 = e.point;
    const normalized = point.clone().normalize();

    // Convert from 3D to lat/lng
    const lat = 90 - Math.acos(normalized.y) * (180 / Math.PI);
    const lng =
      -(Math.atan2(normalized.z, -normalized.x) * (180 / Math.PI)) - 180;
    const adjustedLng = lng < -180 ? lng + 360 : lng > 180 ? lng - 360 : lng;

    onGlobeClick(lat, adjustedLng);
  };

  return (
    <Canvas
      camera={{ position: [0, 0, 3.5], fov: 45, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      style={{ background: "#070b14" }}
      dpr={[1, 2]}
    >
      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 3, 5]} intensity={1.6} color="#fff8f0" />
      <directionalLight position={[-3, -1, -2]} intensity={0.15} color="#9ecfff" />
      <pointLight position={[0, 0, 5]} intensity={0.3} color="#b0d0ff" />

      {/* Starfield */}
      <Stars
        radius={80}
        depth={60}
        count={3000}
        factor={3}
        saturation={0.1}
        fade
        speed={0.4}
      />

      {/* Earth */}
      <Earth autoRotate={autoRotate} />

      {/* Atmosphere glow */}
      <Atmosphere />

      {/* Marker */}
      {center && (
        <Marker lat={center.lat} lng={center.lng} radiusKm={radiusKm} />
      )}

      {/* Click handler - invisible sphere slightly larger */}
      <mesh onPointerUp={handlePointerUp}>
        <sphereGeometry args={[1.01, 64, 64]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Camera animation */}
      <CameraController target={center} controlsRef={controlsRef} />

      {/* Controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        autoRotate={autoRotate}
        autoRotateSpeed={0.4}
        minDistance={1.5}
        maxDistance={8}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
      />
    </Canvas>
  );
}
