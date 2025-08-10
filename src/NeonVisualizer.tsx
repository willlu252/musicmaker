import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'

// Floating particles around the fractal
function ParticleField(){
  const points = useRef<THREE.Points>(null!)
  const particlesCount = 500
  
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(particlesCount * 3)
    const col = new Float32Array(particlesCount * 3)
    
    for(let i = 0; i < particlesCount; i++){
      const i3 = i * 3
      const radius = 4 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      
      pos[i3] = radius * Math.sin(phi) * Math.cos(theta)
      pos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      pos[i3 + 2] = radius * Math.cos(phi)
      
      const color = new THREE.Color()
      color.setHSL(0.8 + Math.random() * 0.2, 1, 0.5)
      col[i3] = color.r
      col[i3 + 1] = color.g
      col[i3 + 2] = color.b
    }
    
    return [pos, col]
  }, [])
  
  useFrame((state) => {
    if(points.current){
      points.current.rotation.y = state.clock.elapsedTime * 0.05
      points.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.2
    }
  })
  
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particlesCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  )
}

// 3D Fractal Sphere that pulses and morphs
function Fractal3D({ isPlaying = false, bpm = 110 }: { isPlaying?: boolean, bpm?: number }){
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.ShaderMaterial>(null!)
  const [squish, setSquish] = React.useState(1.0)
  const startTime = useRef(Date.now())
  const frameCount = useRef(0)
  const lastLogTime = useRef(Date.now())
  const lastUniformValue = useRef(0)
  
  const geo = useMemo(() => {
    return new THREE.IcosahedronGeometry(2.5, 128) // Increased size and resolution
  }, [])
  
  // Memoize shader strings to prevent recreation
  const vertexShader = useMemo(() => `
    varying vec3 vPosition;
    varying vec3 vNormal;
    uniform float uTime;
    
    // Simplex noise function for smooth organic movement
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      vec3 ns = 0.142857142857 * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = floor(j - 7.0 * x_) * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    
    void main() {
      vPosition = position;
      vNormal = normal;
      
      // Complex vertex displacement
      vec3 pos = position;
      float t = uTime * 0.5;
      
      // Layered noise for organic movement
      float noise1 = snoise(pos * 1.5 + vec3(t, 0.0, 0.0)) * 0.15;
      float noise2 = snoise(pos * 3.0 - vec3(0.0, t * 1.3, 0.0)) * 0.08;
      float noise3 = snoise(pos * 6.0 + vec3(0.0, 0.0, t * 0.7)) * 0.04;
      
      float totalNoise = noise1 + noise2 + noise3;
      
      // Pulsing effect
      float pulse = sin(t * 2.0) * 0.02 + sin(t * 3.7) * 0.01;
      
      pos += normal * (totalNoise + pulse);
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `, [])
  
  const fragmentShader = useMemo(() => `
    precision highp float;
    varying vec3 vPosition;
    varying vec3 vNormal;
    uniform float uTime;
    
    // Full rainbow HSL to RGB conversion
    vec3 hsl2rgb(vec3 hsl) {
      vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
    }
    
    // Rainbow palette that cycles through all colors
    vec3 rainbow(float t) {
      float hue = mod(t, 1.0); // Cycle through all hues
      return hsl2rgb(vec3(hue, 0.8, 0.6)); // High saturation, medium lightness
    }
    
    // Mandelbulb-inspired 3D fractal
    float mandelbulb(vec3 pos) {
      vec3 z = pos;
      float dr = 1.0;
      float r = 0.0;
      float power = 8.0 + sin(uTime * 0.1) * 2.0; // Animate power
      
      for(int i = 0; i < 8; i++) {
        r = length(z);
        if(r > 2.0) break;
        
        // Convert to polar coordinates
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        
        // Scale and rotate the point
        float zr = pow(r, power);
        theta = theta * power;
        phi = phi * power;
        
        // Convert back to cartesian coordinates
        z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
        z += pos;
      }
      return 0.5 * log(r) * r / dr;
    }
    
    // Kleinian fractal pattern
    float kleinian(vec3 p) {
      float scale = 1.0;
      float orb = 10000.0;
      
      for(int i = 0; i < 12; i++) {
        p = abs(p) / dot(p, p) - 1.2;
        float d = length(p);
        orb = min(orb, d);
        p *= 1.5;
        scale *= 1.5;
        
        // Rotation based on time
        float angle = uTime * 0.05;
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p.xy = rot * p.xy;
      }
      
      return orb * 0.25 / scale;
    }
    
    void main() {
      vec3 pos = normalize(vPosition);
      
      // Create rippling stripe pattern
      float stripes = sin(length(pos.xy) * 20.0 - uTime * 2.0) * 0.5 + 0.5;
      stripes += sin(length(pos.yz) * 15.0 + uTime * 1.5) * 0.3;
      stripes += sin(length(pos.xz) * 25.0 - uTime * 3.0) * 0.2;
      
      // Combine multiple fractal types
      float mandel = mandelbulb(pos * 1.5);
      float klein = kleinian(pos * 2.0 + vec3(sin(uTime * 0.1), cos(uTime * 0.15), 0.0));
      
      // Mix fractals with stripes
      float fractal = mix(mandel, klein, 0.5 + 0.5 * sin(uTime * 0.2));
      fractal = 1.0 / (1.0 + fractal * fractal * 5.0);
      fractal = mix(fractal, stripes, 0.5);
      
      // Calculate surface distortion for additional pattern
      vec3 p = pos * 4.0;
      for(int i = 0; i < 6; i++) {
        p = abs(p) / dot(p, p) - vec3(0.9, 1.1, 1.3);
        p.xyz = p.yzx;
        p *= 1.02;
      }
      
      float pattern = length(p) * 0.08;
      
      // Full rainbow color based on position and time
      float colorIndex = fractal + pattern + uTime * 0.1;
      vec3 color = rainbow(colorIndex);
      
      // Add secondary rainbow layer based on normal
      float normalColor = dot(vNormal, vec3(1.0, 1.0, 1.0)) * 0.3;
      vec3 color2 = rainbow(normalColor + uTime * 0.15);
      color = mix(color, color2, 0.3);
      
      // Enhanced rim lighting with rainbow
      float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
      rim = pow(rim, 1.2);
      vec3 rimColor = rainbow(rim + uTime * 0.2);
      
      // Mix all colors
      color = mix(color, rimColor, rim * 0.4);
      
      // Brighten the colors
      color = color * 1.2 + 0.1;
      
      // Ensure rippling effect is visible everywhere
      color *= 0.8 + stripes * 0.4;
      
      gl_FragColor = vec4(color, 1.0); // Fully opaque
    }
  `, [])
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }
  }), [])
  
  // Use useEffect with requestAnimationFrame for guaranteed continuous animation
  React.useEffect(() => {
    let animationId: number
    let isRunning = true
    
    const animate = () => {
      if (!isRunning) return
      
      // Calculate elapsed time independently of React Three Fiber
      const elapsed = (Date.now() - startTime.current) * 0.001 // Convert to seconds
      
      if(matRef.current){
        try {
          matRef.current.uniforms.uTime.value = elapsed
          
          // Removed verbose logging - animation is working
        } catch (error) {
          console.error('[Fractal3D] Error updating uniform:', error)
        }
      } else {
        // Log if material ref is missing
        if (Date.now() - lastLogTime.current > 1000) {
          console.warn('[Fractal3D] matRef.current is null')
          lastLogTime.current = Date.now()
        }
      }
      
      animationId = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      isRunning = false
      if(animationId) cancelAnimationFrame(animationId)
    }
  }, [])
  
  useFrame((state, delta) => {
    if(meshRef.current){
      meshRef.current.rotation.x += 0.003
      meshRef.current.rotation.y += 0.005
      
      // Base scale for squish animation
      let baseScale = squish
      
      // Pulse to BPM when playing
      if(isPlaying){
        const time = (Date.now() - startTime.current) * 0.001
        const beatFrequency = (bpm / 60) * Math.PI * 2 // Convert BPM to radians per second
        const pulse = Math.sin(time * beatFrequency) * 0.08 + 1 // Increased from 0.02 to 0.08
        baseScale *= pulse
      }
      
      // Apply scale smoothly
      meshRef.current.scale.x = THREE.MathUtils.lerp(meshRef.current.scale.x, baseScale, 0.1)
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, baseScale, 0.1)
      meshRef.current.scale.z = THREE.MathUtils.lerp(meshRef.current.scale.z, baseScale, 0.1)
      
      // Reset squish after animation
      if(squish < 1.0){
        setSquish(prev => Math.min(1.0, prev + delta * 2))
      }
    }
  })
  
  const handleClick = () => {
    setSquish(0.7) // Squish to 70% size on click
  }
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geo}
      onClick={handleClick}
      onPointerOver={() => document.body.style.cursor = 'pointer'}
      onPointerOut={() => document.body.style.cursor = 'auto'}
    >
      <shaderMaterial
        ref={matRef}
        transparent
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={true}
        blending={THREE.NormalBlending}
      />
    </mesh>
  )
}

function TorusEnergy({ levels }: { levels: React.MutableRefObject<{bass:number;mids:number;highs:number}> }){
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((_, dt)=>{
    const hi = levels.current.highs
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

function FractalField({ levels, colorA, colorB }: { levels: React.MutableRefObject<{bass:number;mids:number;highs:number}>, colorA: string, colorB: string }){
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const geo = useMemo(()=> new THREE.PlaneGeometry(6,3.5,1,1), [])
  useFrame((_,dt)=>{ if(mat.current){ const t = mat.current.uniforms.uTime.value; mat.current.uniforms.uTime.value = t + dt; const { bass, highs } = levels.current; mat.current.uniforms.uBass.value = bass; mat.current.uniforms.uHigh.value = highs }})
  return (
    <mesh geometry={geo}>
      <shaderMaterial ref={mat} transparent={false}
        uniforms={{ uTime:{value:0}, uBass:{value:0}, uHigh:{value:0}, uColorA:{value:new THREE.Color(colorA)}, uColorB:{value:new THREE.Color(colorB)} }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`precision highp float; varying vec2 vUv; uniform float uTime; uniform float uBass; uniform float uHigh; uniform vec3 uColorA; uniform vec3 uColorB; 
          float noise(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          void main(){ vec2 uv = vUv*2.0-1.0; float t=uTime*0.2; float a=0.0; vec2 p=uv; for(int i=0;i<6;i++){ p=abs(p)/dot(p,p)-0.9; a+=length(p); p+=vec2(sin(t*1.3),cos(t*1.1))*(0.02+uBass*0.1); }
            float n = smoothstep(0.0,1.0, a*0.12 + uHigh*0.6);
            vec3 col = mix(uColorA, uColorB, n);
            gl_FragColor = vec4(col,1.0);
          }`}
      />
    </mesh>
  )
}

function SmokeField({ levels, colorA, colorB, dispersion }: { levels: React.MutableRefObject<{bass:number;mids:number;highs:number}>, colorA:string, colorB:string, dispersion:number }){
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const geo = useMemo(()=> new THREE.PlaneGeometry(6,3.5,1,1), [])
  useFrame((_,dt)=>{ if(mat.current){ mat.current.uniforms.uTime.value += dt; const { bass, highs } = levels.current; mat.current.uniforms.uBass.value = bass; mat.current.uniforms.uHigh.value = highs; mat.current.uniforms.uDisp.value = dispersion }})
  return (
    <mesh geometry={geo}>
      <shaderMaterial ref={mat}
        uniforms={{ uTime:{value:0}, uBass:{value:0}, uHigh:{value:0}, uDisp:{value:dispersion}, uColorA:{value:new THREE.Color(colorA)}, uColorB:{value:new THREE.Color(colorB)} }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`precision highp float; varying vec2 vUv; uniform float uTime,uBass,uHigh,uDisp; uniform vec3 uColorA,uColorB; 
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);} 
          float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
          void main(){ vec2 uv=vUv*2.0-1.0; float t=uTime*0.08; float flow = noise(uv*2.0 + t) + noise(uv*4.0 - t*0.7); float wob = sin((uv.x+uv.y+t*3.0)*6.2831); float d = flow*0.6 + wob*0.2 + uBass*0.5; d *= (0.6 + uDisp*0.8); vec3 col = mix(uColorA, uColorB, smoothstep(-0.2,0.8,d)); gl_FragColor=vec4(col, 1.0); }`}
      />
    </mesh>
  )
}
function Orbitals({ levels }: { levels: React.MutableRefObject<{bass:number;mids:number;highs:number}> }){
  const group = useRef<THREE.Group>(null!)
  const spheres = useMemo(()=> new Array(60).fill(0).map((_,i)=>({ phi: Math.random()*Math.PI*2, theta: Math.random()*Math.PI, r: 1.8+Math.random()*1.5, size: 0.04+Math.random()*0.08 })), [])
  useFrame((_, dt)=>{
    const { bass, highs } = levels.current
    if(!group.current) return
    const g = group.current
    let idx = 0
    g.children.forEach((m: any)=>{
      const s = spheres[idx++]
      s.phi += dt*(0.3 + highs*1.5)
      const r = s.r*(1.0 + bass*0.3)
      const x = r*Math.sin(s.theta)*Math.cos(s.phi)
      const y = r*Math.cos(s.theta)
      const z = r*Math.sin(s.theta)*Math.sin(s.phi)
      m.position.set(x,y,z)
      const sc = s.size*(0.8 + highs*1.2)
      m.scale.setScalar(sc)
    })
    g.rotation.y += dt*0.2
  })
  return (
    <group ref={group}>
      {spheres.map((s,i)=>(
        <mesh key={i}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color="#8ff" />
        </mesh>
      ))}
    </group>
  )
}

function Tesseract({ levels }: { levels: React.MutableRefObject<{bass:number;mids:number;highs:number}> }){
  const ref = useRef<THREE.Group>(null!)
  const geom = useMemo(()=>{
    const group = new THREE.Group()
    const createCube = (s:number, color:number)=>{
      const geo = new THREE.BoxGeometry(s,s,s)
      const edges = new THREE.EdgesGeometry(geo)
      const mat = new THREE.LineBasicMaterial({ color })
      const line = new THREE.LineSegments(edges, mat)
      return line
    }
    group.add(createCube(1.5, 0x44ffff))
    group.add(createCube(0.9, 0xff44ff))
    return group
  },[])
  useFrame((_,dt)=>{
    if(ref.current){
      const { mids } = levels.current
      ref.current.rotation.x += dt*(0.2 + mids*0.6)
      ref.current.rotation.y += dt*(0.25 + mids*0.6)
      const s = 0.9 + mids*0.4
      ref.current.scale.set(s,s,s)
    }
  })
  return <primitive object={geom} ref={ref} />
}

export default function NeonVisualizer({ isPlaying = false, bpm = 110 }: { isPlaying?: boolean, bpm?: number }){
  return (
    <div style={{ 
      height: 320,
      background: 'radial-gradient(circle at center, #1a0033 0%, #000000 70%)',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '2px solid rgba(255, 0, 255, 0.3)',
      boxShadow: '0 0 40px rgba(255, 0, 255, 0.2), inset 0 0 40px rgba(0, 255, 255, 0.1)'
    }}>
      <Canvas 
        camera={{ position: [0, 0, 8], fov: 45 }}
        frameloop="always"
        dpr={[1, 2]}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            console.error('[NeonVisualizer] WebGL context lost!', e)
          })
        }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#ff00ff" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00ffff" />
        <ParticleField />
        <Fractal3D isPlaying={isPlaying} bpm={bpm} />
        <OrbitControls 
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  )
}


