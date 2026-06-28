import React, { useEffect, useRef } from 'react'

// 祥云流动背景：传统「如意卷云 / 流云带 / 四合团云」线描纹样缓缓横向飘移，
// 淡墨与古铜描金为主、偶有一朵朱砂点睛；分层速度营造远近景深。
// 取代旧的「飘点」——与京剧戏台帷幕、戏服云纹气韵相呼应。
// 尊重 prefers-reduced-motion（更少更慢，不完全关闭）；tab 隐藏暂停；按屏宽缩放朵数。

// —— 三种祥云纹样（线描 SVG path）——
const MOTIFS = [
  { // A2 如意双卷云
    w: 280, h: 150,
    paths: ['M140,48 C116,48 110,74 88,78 C70,81 66,63 79,59 C66,62 67,80 90,82 C118,84 124,64 140,64 C156,64 162,84 190,82 C213,80 214,62 201,59 C214,63 210,81 192,78 C170,74 164,48 140,48 Z'],
  },
  { // B 三卷流云带
    w: 300, h: 130,
    paths: [
      'M24,92 q14,2 20,-12 q6,-20 28,-16 q16,3 14,22 q4,-24 30,-22 q22,2 18,24 q6,-22 30,-20 q20,2 18,22 q14,-12 28,-4',
      'M44,80 a9,9 0 1 1 -3,-7', 'M104,82 a8,8 0 1 1 -2.5,-6',
      'M168,84 a8,8 0 1 1 -2.5,-6', 'M232,86 a8,8 0 1 1 -2.5,-6',
    ],
  },
  { // F 四合团云
    w: 240, h: 150,
    paths: [
      'M120,38 c-14,-2 -24,10 -22,22 c-16,-8 -34,4 -32,20 c-14,2 -18,20 -6,30 c8,8 24,8 32,0 c10,10 30,10 40,0 c8,8 24,8 32,0 c12,-10 8,-28 -6,-30 c2,-16 -16,-28 -32,-20 c2,-12 -8,-24 -22,-22 Z',
      'M104,84 a8,8 0 1 1 -2.5,-6', 'M150,84 a8,8 0 1 1 -2.5,-6',
    ],
  },
]

// 描线色：古铜（常见）、徽墨（次之）、朱砂（点睛·少量）
const TINTS = ['#A9762E', '#A9762E', '#A9762E', '#2A2420', '#2A2420', '#C0392B']

function cloudURL(motif, color) {
  const body = motif.paths.map((d) => `<path d='${d}'/>`).join('')
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${motif.w}' height='${motif.h}' viewBox='0 0 ${motif.w} ${motif.h}'>` +
    `<g fill='none' stroke='${color}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>${body}</g></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

export default function AmbientCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0, w = 0, h = 0, dpr = 1, running = true
    let clouds = []

    // 预渲染纹样×色 → Image（共享，按引用绘制）
    const sprites = []
    for (const m of MOTIFS) {
      for (const c of TINTS) {
        const img = new Image()
        img.src = cloudURL(m, c)
        sprites.push({ img, w: m.w, h: m.h, vermilion: c === '#C0392B', ink: c === '#2A2420' })
      }
    }

    const count = () => {
      const base = Math.round(window.innerWidth / 240)
      const cap = window.innerWidth < 760 ? 5 : 11
      return Math.round(Math.max(4, Math.min(cap, base)) * (reduce ? 0.6 : 1))
    }

    const spawn = (atEdge) => {
      const sp = sprites[(Math.random() * sprites.length) | 0]
      // 远近景深：小朵更淡更慢，大朵更显更快
      const scale = 0.42 + Math.random() * 0.95
      const depth = (scale - 0.42) / 0.95            // 0..1
      const baseA = sp.vermilion ? 0.18 : sp.ink ? 0.10 : 0.16
      return {
        sp, scale,
        a: baseA * (0.55 + depth * 0.7),
        x: atEdge ? -sp.w * scale - Math.random() * 220 : Math.random() * w,
        baseY: 40 + Math.random() * (h - 120),
        vx: (0.12 + depth * 0.34) * (reduce ? 0.5 : 1),   // 向右缓移
        bobAmp: 6 + Math.random() * 16,
        bobSp: 0.00018 + Math.random() * 0.0004,
        ph: Math.random() * Math.PI * 2,
      }
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = count()
      if (!clouds.length) clouds = Array.from({ length: target }, () => spawn(false))
      else if (clouds.length < target)
        clouds = clouds.concat(Array.from({ length: target - clouds.length }, () => spawn(true)))
      else clouds.length = target
    }

    const tick = (t) => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      for (const c of clouds) {
        c.x += c.vx
        const cw = c.sp.w * c.scale
        if (c.x > w + cw) Object.assign(c, spawn(true))   // 飘出右侧 → 左侧重生
        const y = c.baseY + Math.sin(t * c.bobSp + c.ph) * c.bobAmp
        if (c.sp.img.complete && c.sp.img.naturalWidth) {
          ctx.globalAlpha = c.a
          ctx.drawImage(c.sp.img, c.x, y, cw, c.sp.h * c.scale)
        }
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(tick)
    }

    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf) }
      else if (!running) { running = true; raf = requestAnimationFrame(tick) }
    }

    resize()
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} className="ambient-canvas" aria-hidden="true" />
}
