import { useEffect } from 'react'

// 滚动渐入：给进入视口的卡片加 .in-view（CSS 控制淡入上浮）。
// 按 active 模块切换重建 observer（模块整块替换 DOM）。
// 尊重 prefers-reduced-motion：直接全部标记可见，不做动画。
export default function useReveal(active) {
  useEffect(() => {
    const root = document.querySelector('.content')
    if (!root) return
    const sel = '.card, .role-card, .skill-card, .genre-card, .recap-card, .face-swatch, .audit-item'
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    // 等待模块 DOM 就绪（active 变更后内容已渲染）
    const id = requestAnimationFrame(() => {
      const els = Array.from(root.querySelectorAll(sel))
      if (reduce) { els.forEach((el) => el.classList.add('in-view')); return }
      els.forEach((el) => el.classList.add('reveal'))
      const io = new IntersectionObserver((entries, obs) => {
        for (const en of entries) {
          if (en.isIntersecting) { en.target.classList.add('in-view'); obs.unobserve(en.target) }
        }
      }, { root, threshold: 0.08, rootMargin: '0px 0px -8% 0px' })
      els.forEach((el) => io.observe(el))
      cleanup.io = io
    })

    const cleanup = { io: null }
    return () => { cancelAnimationFrame(id); cleanup.io?.disconnect() }
  }, [active])
}
