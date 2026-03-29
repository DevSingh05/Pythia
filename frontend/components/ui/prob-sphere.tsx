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

    // ── 1. SHADOW DISC ────────────────────────────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(1.6, 64)
    const shadowMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float time;
        void main(){
          // elongated slightly left
          vec2 c = (vUv - vec2(0.52, 0.5)) * vec2(1.0, 0.55);
          float r = length(c);
          float pulse = sin(time*0.7)*0.04 + 0.96;
          float a = smoothstep(0.48, 0.0, r) * 0.38 * pulse;
          gl_FragColor = vec4(0.42, 0.18, 0.62, a);
        }
      `,
      transparent: true, depthWrite: false,
    })
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat)
    shadowMesh.rotation.x = -Math.PI / 2
    shadowMesh.position.set(0.1, -2.0, -0.3)
    scene.add(shadowMesh)

    // ── 2. MIST INTERIOR — BackSide ───────────────────────────────────────
    // Rendered from inside: we see the back face, giving us the volumetric
    // depth illusion. Front-to-back: bright lavender-white → deep indigo.
    const mistGeo = new THREE.SphereGeometry(1.71, 128, 128)
    const mistMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
      `,
      fragmentShader: `
        ${NOISE}
        uniform float time;
        varying vec3 vPos;

        // 2-octave FBM — low frequency, keeps it vaporous not marbled
        float mistFbm(vec3 p){
          float v = snoise(p)       * 0.60;
              v += snoise(p*2.1)    * 0.28;
              v += snoise(p*4.3)    * 0.12;
          return v;
        }

        void main(){
          vec3 p = normalize(vPos);
          float t = time * 0.06; // very slow drift

          // domain warp — one level, gentle, keeps vapour feel
          vec3 q = vec3(
            mistFbm(p*1.2 + vec3(0.0,  0.0,  t)),
            mistFbm(p*1.2 + vec3(2.8,  1.6,  t)),
            mistFbm(p*1.2 + vec3(5.1, -2.3,  t))
          );
          float mist = mistFbm(p*1.4 + 1.8*q + vec3(t*0.4));
          mist = mist * 0.5 + 0.5; // [0,1]

          // soft breathing bands — brightness variation, not hard lines
          // low multiplier (6.0) = wide, gentle undulations like the reference
          float bands = sin(mist * 9.0 + t * 0.5) * 0.5 + 0.5;
          bands = smoothstep(0.0, 1.0, bands); // fully soft, no crisp edges

          float pattern = mist * 0.65 + bands * 0.35;

          // ── colour: back=deep indigo, mid=purple, front=lavender-white ──
          // "depth" proxy: faces pointing away from camera are the back
          // vPos.z on BackSide: negative z = facing viewer = front of mist
          float depth = clamp((-vPos.z / 1.71) * 0.5 + 0.5, 0., 1.);

          vec3 cBack  = vec3(0.08, 0.02, 0.28); // deep violet-indigo (back)
          vec3 cMid   = vec3(0.38, 0.10, 0.72); // purple body
          vec3 cFront = vec3(0.72, 0.52, 0.98); // lavender (front)
          vec3 cCore  = vec3(0.92, 0.86, 1.00); // near-white glow centre

          // blend depth layers
          vec3 depthCol = mix(cBack, cMid,   smoothstep(0.0, 0.45, depth));
          depthCol      = mix(depthCol, cFront, smoothstep(0.45, 0.78, depth));

          // pattern brightens within the depth layer
          vec3 col = mix(depthCol * 0.7, depthCol * 1.25, pattern);

          // internal light source: front-left off-centre bright spot
          // simulate as a gaussian blob in position space
          vec3 lightCentre = vec3(-0.3, 0.1, 1.0); // front-left
          float distToLight = length(normalize(vPos) - normalize(lightCentre));
          float glow = exp(-distToLight * distToLight * 2.8);
          col = mix(col, cCore, glow * 0.65);

          // overall alpha: opaque in the deep back, slightly transparent front
          float alpha = mix(0.96, 0.82, depth);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    })
    const mistMesh = new THREE.Mesh(mistGeo, mistMat)
    scene.add(mistMesh)

    // ── 3. GLASS SHELL — FrontSide, near-invisible centre ─────────────────
    const glassGeo = new THREE.SphereGeometry(1.75, 128, 128)
    const glassMat = new THREE.ShaderMaterial({
      uniforms: {
        time:     { value: 0 },
        lightPos: { value: new THREE.Vector3(1.8, 1.6, 3.5) },
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vPosition; varying vec3 vViewDir;
        void main(){
          vNormal  = normalize(normalMatrix * normal);
          vec4 mv  = modelViewMatrix * vec4(position, 1.);
          vPosition = mv.xyz;
          vViewDir  = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3  lightPos;
        varying vec3  vNormal; varying vec3 vPosition; varying vec3 vViewDir;

        // Needle-thin 4-ray star — short rays, white-gold
        float starFlare(vec2 uv){
          float r = length(uv);
          float a = atan(uv.y, uv.x);
          // two perpendicular ray pairs, very high power = needle-thin
          float ray1 = pow(abs(cos(a)),        28.0);
          float ray2 = pow(abs(cos(a - 0.7854)), 28.0);
          float rays = ray1 * 0.55 + ray2 * 0.45;
          // short: exp falloff, tighter than before
          return rays * exp(-r * 11.0);
        }

        void main(){
          vec3 n = normalize(vNormal);
          vec3 v = normalize(vViewDir);

          float NdV     = max(dot(n, v), 0.0);
          // power 5 = thin rim, nearly invisible centre
          float fresnel = pow(1.0 - NdV, 5.0);

          // chromatic rim: top=blue-violet, bottom=deeper indigo
          // use world-space y (approximate via vNormal.y)
          float yBias  = vNormal.y * 0.5 + 0.5; // 0=bottom, 1=top
          vec3 rimTop  = vec3(0.30, 0.45, 1.00); // blue-violet
          vec3 rimBot  = vec3(0.20, 0.08, 0.60); // deeper indigo
          vec3 rimColor = mix(rimBot, rimTop, yBias);
          // subtle iridescent shimmer along the rim
          float shift  = sin(fresnel * 7.0 + time * 0.4) * 0.3 + 0.7;
          rimColor     = mix(rimColor, vec3(0.55, 0.30, 1.0), shift * fresnel * 0.4);

          // ── golden star flare, upper-right, faint ──────────────────────
          vec3  lDir = normalize(lightPos - vPosition);
          vec3  refl = reflect(-lDir, n);
          float base = pow(max(dot(refl, v), 0.0), 180.0);

          // offset in reflection space → upper-right quadrant
          vec2  starUV    = refl.xy - vec2(0.25, 0.20);
          float star      = starFlare(starUV) * 0.42; // faint
          star            = clamp(star, 0.0, 1.0);

          vec3 goldWhite  = mix(vec3(1.0, 0.90, 0.55), vec3(1.0), star);
          vec3 specColor  = goldWhite * (star + base * 0.2);

          // ── assemble ───────────────────────────────────────────────────
          vec3  col   = rimColor * fresnel * 0.8 + specColor;
          float alpha = fresnel * 0.60 + star * 0.45 + base * 0.15;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    const glassMesh = new THREE.Mesh(glassGeo, glassMat)
    scene.add(glassMesh)

    // ── 4. OUTER BREATH HALO ──────────────────────────────────────────────
    const haloGeo = new THREE.SphereGeometry(2.05, 32, 32)
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; void main(){ vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform float time; varying vec3 vN;
        void main(){
          float f = pow(1.-abs(dot(normalize(vN),vec3(0.,0.,1.))), 5.5);
          float p = sin(time*0.75)*0.07+0.93;
          gl_FragColor = vec4(0.48, 0.12, 0.80, f*0.22*p);
        }
      `,
      transparent: true, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const haloMesh = new THREE.Mesh(haloGeo, haloMat)
    scene.add(haloMesh)

    // ── Lights ────────────────────────────────────────────────────────────
    const keyLight = new THREE.PointLight(0xbb88ff, 2.5, 18)
    keyLight.position.set(1.8, 1.6, 4.0)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight(0x330088, 1.2, 14)
    fillLight.position.set(-2.5, -0.5, 2)
    scene.add(fillLight)

    scene.add(new THREE.AmbientLight(0x0d0020, 1.0))

    // ── Mouse: subtle drift, sparkle stays upper-right ────────────────────
    const handleMouseMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth  - 0.5) * 1.0
      const my = (e.clientY / window.innerHeight - 0.5) * -0.7
      glassMat.uniforms.lightPos.value.set(1.8 + mx, 1.6 + my, 3.5)
      keyLight.position.set(1.8 + mx, 1.6 + my, 4.0)
    }

    // ── Animate ───────────────────────────────────────────────────────────
    let frameId: number
    const animate = (t: number) => {
      const time = t * 0.001
      mistMat.uniforms.time.value  = time
      glassMat.uniforms.time.value = time
      haloMat.uniforms.time.value  = time
      shadowMat.uniforms.time.value = time

      // slow dignified rotation
      mistMesh.rotation.y  += 0.0010
      mistMesh.rotation.x  += 0.0002
      glassMesh.rotation.y  = mistMesh.rotation.y
      glassMesh.rotation.x  = mistMesh.rotation.x
      haloMesh.rotation.y   = mistMesh.rotation.y * 0.35

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
      ;[mistGeo, mistMat, glassGeo, glassMat,
        haloGeo, haloMat, shadowGeo, shadowMat].forEach((o: any) => o.dispose?.())
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />
}
