'use client'

import { useRef, useEffect, useState } from 'react'

const GREEK = [
  'Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω',
  'α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω',
]
const ORACLE = ['∴','∵','⊕','⊗','⋈','∞','∇','∆','⌬','⍟','⊾','ℵ','∮','⊙','◯','✦']

function pick(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)] }
function randChar(): string {
  const r = Math.random()
  if (r < 0.82) return pick(GREEK)
  if (r < 0.97) return pick(ORACLE)
  return pick(['·', '.', ':', '′'])
}

const LAYERS = [
  { fontSize: 11, opacity: 0.6, speed: 0.18,  drift:  0.04, maxDensity: 0.40 },
  { fontSize: 14, opacity: 0.7, speed: 0.09,  drift: -0.02, maxDensity: 0.45 },
  { fontSize: 18, opacity: 0.9, speed: 0,     drift:  0,    maxDensity: 0.50 },
]

// fraction of min(vw,vh) kept clear around orb centre
const CLEAR_R = 0.38

interface Cell {
  char: string
  x: number
  y: number
  flickerOffset: number
  flickerDur: number
}

function buildGrid(vw: number, vh: number, fontSize: number, maxDensity: number): Cell[] {
  const colW  = fontSize * 1.7
  const rowH  = fontSize * 2.0
  const cols  = Math.ceil((vw + colW) / colW)
  const rows  = Math.ceil((vh + rowH) / rowH)
  const cx    = vw / 2
  const cy    = vh / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const clearR  = Math.min(vw, vh) * CLEAR_R
  const cells: Cell[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x    = c * colW
      const y    = r * rowH
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist < clearR) continue
      const norm = Math.min(dist / maxDist, 1)
      const prob = norm * norm * maxDensity
      if (Math.random() < prob) {
        cells.push({ char: randChar(), x, y,
          flickerOffset: Math.random() * 10,
          flickerDur:    6 + Math.random() * 5,
        })
      }
    }
  }
  return cells
}

// ── Canvas layer renderer ─────────────────────────────────────────────────────
function GreekLayer({ layerIdx, vw, vh }: { layerIdx: number; vw: number; vh: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cfg    = LAYERS[layerIdx]
  const isNear = layerIdx === 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || vw === 0 || vh === 0) return

    canvas.width  = vw + 80
    canvas.height = vh + 80

    const ctx = canvas.getContext('2d')!
    ctx.font  = `${cfg.fontSize}px 'JetBrains Mono', 'Courier New', monospace`

    const cells     = buildGrid(vw, vh, cfg.fontSize, cfg.maxDensity)
    let scrollY     = 0
    let scrollX     = 0
    let startTime   = 0
    let frameId: number

    const draw = (ts: number) => {
      if (!startTime) startTime = ts
      const elapsed = (ts - startTime) / 1000

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgb(160, 100, 255)'

      for (const cell of cells) {
        let alpha = cfg.opacity

        if (isNear) {
          // per-cell torch-light flicker — slow sine, unique phase per cell
          const sine  = Math.sin((elapsed / cell.flickerDur + cell.flickerOffset) * Math.PI * 2)
          alpha = cfg.opacity * (0.35 + 0.65 * (sine * 0.5 + 0.5))
        }

        ctx.globalAlpha = alpha
        ctx.fillText(cell.char, cell.x + scrollX, cell.y + scrollY)
      }

      if (!isNear) {
        scrollY -= cfg.speed
        scrollX += cfg.drift
        const rowH = cfg.fontSize * 2.0
        if (Math.abs(scrollY) > rowH) scrollY += rowH
        if (Math.abs(scrollX) > 80)   scrollX  = 0
      }

      frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [vw, vh, cfg, isNear])

  // clear centre (orb zone), letters only on periphery
  const mask = `radial-gradient(ellipse 38% 45% at 50% 48%,
    transparent 0%,
    transparent 60%,
    rgba(0,0,0,0.6) 75%,
    rgba(0,0,0,1.0) 90%
  )`

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: vw,
        height: vh,
        pointerEvents: 'none',
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function OracleBackground() {
  const [dims, setDims] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth  : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))

  useEffect(() => {
    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        opacity: 1,
      }}
    >
      <GreekLayer layerIdx={0} vw={dims.w} vh={dims.h} />
      <GreekLayer layerIdx={1} vw={dims.w} vh={dims.h} />
      <GreekLayer layerIdx={2} vw={dims.w} vh={dims.h} />
    </div>
  )
}
