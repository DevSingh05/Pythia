'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'

export function ProbSphere() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 1000)
    camera.position.z = 5.5

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    // ── Shared GLSL: simplex noise ────────────────────────────────────────
    const NOISE = `
      vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
      vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
      vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
      float snoise(vec3 v){
        const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
        vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
        vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g;
        vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
        vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
        i=mod289(i);
        vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
        float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
        vec4 j=p-49.*floor(p*ns.z*ns.z);
        vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
        vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
        vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
        vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
        vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
        vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y);
        vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
        vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
        p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
        vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
        m=m*m; return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
      }
    `

    // ── 1. SOFT SHADOW DISC beneath orb ──────────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(1.4, 64)
    const shadowMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c);
          float pulse = sin(time*0.9)*0.05 + 0.95;
          float alpha = smoothstep(0.5, 0.0, r) * 0.45 * pulse;
          gl_FragColor = vec4(0.35, 0.05, 0.55, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat)
    shadowMesh.rotation.x = -Math.PI / 2
    shadowMesh.position.set(0, -2.05, -0.5)
    scene.add(shadowMesh)

    // ── 2. MARBLE INTERIOR — BackSide, swirling purple ────────────────────
    const interiorGeo = new THREE.SphereGeometry(1.72, 128, 128)
    const interiorMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec3 vPos; varying vec3 vNorm;
        void main(){ vPos=position; vNorm=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
      `,
      fragmentShader: `
        ${NOISE}
        uniform float time;
        varying vec3 vPos; varying vec3 vNorm;

        // FBM for marble veins
        float fbm(vec3 p){
          float v=0.; float a=0.5;
          for(int i=0;i<5;i++){ v+=a*snoise(p); p*=2.1; a*=0.5; }
          return v;
        }

        void main(){
          vec3 p = normalize(vPos);

          // swirling marble pattern — slow drift
          float t = time * 0.08;
          vec3 q = vec3(fbm(p + vec3(0.,0.,t)), fbm(p + vec3(5.2,1.3,t)), fbm(p + vec3(2.1,8.4,t)));
          float marble = fbm(p + 2.8*q + vec3(t*0.3));
          marble = marble * 0.5 + 0.5;

          // deep violet → mid purple → bright lavender
          vec3 c0 = vec3(0.10, 0.02, 0.22); // deep shadow
          vec3 c1 = vec3(0.42, 0.12, 0.72); // purple body
          vec3 c2 = vec3(0.72, 0.50, 1.00); // light vein
          vec3 c3 = vec3(0.90, 0.82, 1.00); // near-white highlight

          vec3 col = mix(c0, c1, smoothstep(0.0, 0.4, marble));
          col      = mix(col, c2, smoothstep(0.4, 0.7, marble));
          col      = mix(col, c3, smoothstep(0.72, 0.88, marble));

          // soft inner radial brightness — orb glows from inside
          float radial = 1.0 - length(vPos)/1.72;
          col += vec3(0.3, 0.1, 0.5) * pow(radial, 2.2) * 0.6;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    })
    const interiorMesh = new THREE.Mesh(interiorGeo, interiorMat)
    scene.add(interiorMesh)

    // ── 3. GLASS SHELL — transparent with refraction rim + star specular ──
    const glassGeo = new THREE.SphereGeometry(1.75, 128, 128)
    const glassMat = new THREE.ShaderMaterial({
      uniforms: {
        time:     { value: 0 },
        lightPos: { value: new THREE.Vector3(1.2, 1.5, 3.5) },
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vPosition; varying vec3 vViewDir;
        void main(){
          vNormal   = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position,1.);
          vPosition  = mvPos.xyz;
          vViewDir   = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3  lightPos;
        varying vec3  vNormal; varying vec3 vPosition; varying vec3 vViewDir;

        // 4-ray star burst for specular
        float starBurst(vec2 uv, float sharpness){
          float r = length(uv);
          float a = atan(uv.y, uv.x);
          float rays = abs(cos(a*2.0)) * abs(cos(a*2.0 + 0.7854));
          return pow(rays / (r*sharpness + 0.001), 1.5);
        }

        void main(){
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewDir);

          // Fresnel — glass edge
          float NdV    = max(dot(n, v), 0.0);
          float fresnel = pow(1.0 - NdV, 4.5);

          // Rim colour — blue-violet iridescence like reference
          vec3 rimA = vec3(0.2, 0.4, 1.0);  // blue
          vec3 rimB = vec3(0.7, 0.2, 1.0);  // violet
          float shift = sin(fresnel * 8.0 + time * 0.5) * 0.5 + 0.5;
          vec3 rimColor = mix(rimA, rimB, shift);

          // Star specular — sharp point highlight like reference image
          vec3 lDir  = normalize(lightPos - vPosition);
          vec3 hDir  = normalize(lDir + v);
          float NdH  = max(dot(n, hDir), 0.0);

          // project highlight onto screen-space for star shape
          vec3 refl  = reflect(-lDir, n);
          float base = pow(max(dot(refl, v), 0.0), 120.0);

          // star rays in reflection space
          vec2 reflXY = refl.xy;
          float star  = starBurst(reflXY * 2.0, 3.0) * base * 2.5;
          star = clamp(star, 0.0, 1.0);

          vec3 specColor = mix(vec3(0.8, 0.7, 1.0), vec3(1.0), star) * (base * 0.6 + star * 0.9);

          // assemble — glass is nearly invisible in centre, vivid on rim
          vec3 finalColor = rimColor * fresnel * 0.9 + specColor;
          float alpha     = fresnel * 0.7 + base * 0.5 + star * 0.6;

          gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    const glassMesh = new THREE.Mesh(glassGeo, glassMat)
    scene.add(glassMesh)

    // ── 4. OUTER GLOW HALO ────────────────────────────────────────────────
    const haloGeo = new THREE.SphereGeometry(2.1, 32, 32)
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; void main(){ vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform float time;
        varying vec3 vN;
        void main(){
          float f = pow(1.-abs(dot(normalize(vN), vec3(0.,0.,1.))), 5.0);
          float p = sin(time*0.8)*0.08 + 0.92;
          gl_FragColor = vec4(0.55, 0.15, 0.85, f * 0.28 * p);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const haloMesh = new THREE.Mesh(haloGeo, haloMat)
    scene.add(haloMesh)

    // ── Lights ────────────────────────────────────────────────────────────
    const keyLight = new THREE.PointLight(0xd0a0ff, 3.5, 20)
    keyLight.position.set(1.5, 2.0, 4.0)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight(0x4400bb, 1.5, 15)
    fillLight.position.set(-3, -1, 2)
    scene.add(fillLight)

    scene.add(new THREE.AmbientLight(0x110022, 1.0))

    // ── Mouse — moves specular star ───────────────────────────────────────
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth  - 0.5) * 6
      const y = (e.clientY / window.innerHeight - 0.5) * -4
      glassMat.uniforms.lightPos.value.set(x + 1.2, y + 1.5, 3.5)
      keyLight.position.set(x + 1.5, y + 2.0, 4.0)
    }

    // ── Animate ───────────────────────────────────────────────────────────
    let frameId: number
    const animate = (t: number) => {
      const time = t * 0.001
      interiorMat.uniforms.time.value = time
      glassMat.uniforms.time.value    = time
      haloMat.uniforms.time.value     = time
      shadowMat.uniforms.time.value   = time

      // Slow, dignified rotation
      interiorMesh.rotation.y += 0.0012
      interiorMesh.rotation.x += 0.0003
      glassMesh.rotation.y     = interiorMesh.rotation.y
      glassMesh.rotation.x     = interiorMesh.rotation.x
      haloMesh.rotation.y      = interiorMesh.rotation.y * 0.4

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)

    // ── Resize ────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!el) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      renderer.dispose()
      ;[interiorGeo, interiorMat, glassGeo, glassMat,
        haloGeo, haloMat, shadowGeo, shadowMat].forEach((o: any) => o.dispose?.())
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />
}
