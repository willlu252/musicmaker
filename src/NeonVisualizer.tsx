import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing'
import * as THREE from 'three'
import * as Tone from 'tone'

function useAnalyser() {
  const analyser = useMemo(() => new Tone.Analyser('fft', 64), [])
  useMemo(() => { Tone.Destination.connect(analyser) }, [analyser])
  const buffer = useRef<Float32Array>(new Float32Array(64))
  return { analyser, buffer }
}

function Mobius({ analyser, buffer }: { analyser: Tone.Analyser, buffer: React.MutableRefObject<Float32Array> }) {
  const material = useRef<THREE.ShaderMaterial>(null!)
  const geometry = useMemo(() => new THREE.ParametricGeometry((u, v, target) => {
    u *= Math.PI * 2; v = (v - 0.5) * 2
    const a = 1 + (v / 2) * Math.cos(u / 2)
    const x = a * Math.cos(u)
    const y = a * Math.sin(u)
    const z = (v / 2) * Math.sin(u / 2)
    target.set(x, y, z)
  }, 240, 36), [])

  useFrame((state, dt) => {
    const arr = analyser.getValue() as Float32Array
    buffer.current.set(arr)
    const bass = Math.max(...arr.slice(0, 8)) / 100
    if (material.current) {
      const m = material.current
      m.uniforms.uTime.value += dt
      m.uniforms.uBass.value = THREE.MathUtils.lerp(m.uniforms.uBass.value, bass, 0.15)
    }
  })

  return (
    <mesh geometry={geometry} rotation={[0.2, 0.1, 0]}>
      <shaderMaterial ref={material} transparent={false}
        uniforms={{ uTime: { value: 0 }, uBass: { value: 0 } }}
        vertexShader={`
          uniform float uTime; varying vec2 vUv; varying vec3 vPos;
          void main(){ vUv = uv; vPos = position; vec3 p = position; p *= 1.0 + sin(uTime*0.6)*0.02; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }
        `}
        fragmentShader={`
          precision highp float; varying vec2 vUv; varying vec3 vPos; uniform float uBass;
          void main(){ float r = 0.5 + 0.5 * sin(vUv.x*20.0 + uBass*20.0); vec3 a = vec3(0.0,0.9,1.0); vec3 b = vec3(1.0,0.0,1.0); vec3 col = mix(a,b,r); gl_FragColor = vec4(col,1.0); }
        `}
      />
    </mesh>
  )
}

function TorusEnergy({ analyser }: { analyser: Tone.Analyser }){
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((_, dt)=>{
    const arr = analyser.getValue() as Float32Array
    const hi = Math.max(...arr.slice(32, 64)) / 100
    ref.current.rotation.x += dt * (0.2 + hi)
    ref.current.rotation.y += dt * (0.3 + hi*0.5)
    const s = 1.0 + hi*0.6
    ref.current.scale.set(s,s,s)
  })
  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[1.2, 0.22, 220, 36]} />
      <meshStandardMaterial color="#a0f" emissive="#40f" emissiveIntensity={0.6} metalness={0.2} roughness={0.3} />
    </mesh>
  )
}

export default function NeonVisualizer(){
  const { analyser, buffer } = useAnalyser()
  return (
    <div style={{ height: 260 }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 55 }}>
        <color attach="background" args={["#000"]} />
        <ambientLight intensity={0.3} />
        <Mobius analyser={analyser} buffer={buffer} />
        <group position={[2.8,0,-1]}>
          <TorusEnergy analyser={analyser} />
        </group>
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} intensity={1.2} />
          <ChromaticAberration offset={[0.0015, 0.001]} />
          <Noise opacity={0.04} />
        </EffectComposer>
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  )
}


