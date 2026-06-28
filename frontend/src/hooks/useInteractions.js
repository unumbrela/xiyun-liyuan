import { useEffect } from 'react'
import sound from '../sound'

// 触发点击音的可交互元素（仅按钮/导航类，避免在空白处点击也响）
const CLICK_SEL = 'button,.nav-item,.play-chip,a,[role="button"],[role="switch"]'

// 全局委托式交互（一处挂载，作用全局）：
//   1) 3D 倾斜悬浮 —— 鼠标所指处微微「往里压」，仿佛指尖有重量（press-in tilt）
//   2) 卡片光泽跟随 —— 写入最近方块的 --mx/--my（百分比），驱动 ::after 高光
//   3) 鼠标视差     —— 写入 .ambient 的 --amx/--amy，背景墨晕轻移
//   4) 点击墨晕涟漪 —— pointerdown 在 .ink-ripple-layer 追加一圈淡墨涟漪
// 交互由鼠标驱动、非自动循环，故不随 reduced-motion 关闭（用户明确希望保留）。
const TILT_SEL = [
  '.card', '.kpi', '.role-card', '.skill-card', '.genre-card', '.recap-card',
  '.face-swatch', '.task-card', '.arche-card', '.future-item', '.twin-card',
  '.audit-item', '.mini', '.quad-cell',
].join(',')
const MAX = 2.5  // 最大倾斜角（度）—— 极克制，几乎只作微抬

export default function useInteractions() {
  useEffect(() => {
    const ambient = document.querySelector('.ambient')
    let last = null
    let lastRect = null      // 缓存当前悬浮元素的几何，避免每帧 getBoundingClientRect 触发强制回流
    let frame = 0
    let pending = null

    const reset = (el) => {
      if (!el) return
      el.style.transform = ''
      el.style.transition = ''
      el.style.boxShadow = ''
      el.style.removeProperty('--mx')
      el.style.removeProperty('--my')
    }

    const apply = () => {
      frame = 0
      if (!pending) return
      const { x, y, el } = pending
      if (ambient) {
        ambient.style.setProperty('--amx', (x / window.innerWidth - 0.5).toFixed(3))
        ambient.style.setProperty('--amy', (y / window.innerHeight - 0.5).toFixed(3))
      }
      if (el !== last) { reset(last); last = el; lastRect = el ? el.getBoundingClientRect() : null }
      if (el) {
        const r = lastRect || (lastRect = el.getBoundingClientRect())
        const px = (x - r.left) / r.width
        const py = (y - r.top) / r.height
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%')
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%')
        // 鼠标所指处往里压：上方→top 后仰，左侧→left 后仰
        const rx = ((py - 0.5) * 2 * MAX).toFixed(2)
        const ry = ((px - 0.5) * -2 * MAX).toFixed(2)
        el.style.transition = 'transform .1s ease-out, box-shadow .1s ease-out'
        el.style.transform =
          `perspective(620px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px) scale(1.006)`
        el.style.boxShadow = '0 10px 24px rgba(42,36,32,0.12)'
      }
    }

    const onMove = (e) => {
      pending = { x: e.clientX, y: e.clientY, el: e.target.closest?.(TILT_SEL) || null }
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onLeave = () => { reset(last); last = null; lastRect = null }
    const invalidate = () => { lastRect = null }   // 滚动/缩放后缓存几何失效，下次移动重新测量

    const onDown = (e) => {
      const firstUnlock = sound.unlock()                // 首次手势：解锁音频、淡入 BGM、奏入场磬
      if (!firstUnlock && e.target.closest?.(CLICK_SEL)) sound.play('click')
      const layer = document.querySelector('.ink-ripple-layer')
      if (!layer) return
      const s = document.createElement('span')
      s.className = 'ink-ripple'
      s.style.left = e.clientX + 'px'
      s.style.top = e.clientY + 'px'
      layer.appendChild(s)
      s.addEventListener('animationend', () => s.remove(), { once: true })
      setTimeout(() => s.remove(), 1400)   // 兜底清理
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('scroll', invalidate, { passive: true, capture: true })
    window.addEventListener('resize', invalidate)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('scroll', invalidate, { capture: true })
      window.removeEventListener('resize', invalidate)
      cancelAnimationFrame(frame)
      reset(last)
    }
  }, [])
}
