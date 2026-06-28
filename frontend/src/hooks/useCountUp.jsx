import { useEffect, useRef, useState } from 'react'

// 数字滚动计数：从 0 缓动到 target。
// 尊重 prefers-reduced-motion（直出终值）。返回当前数值（整数）。
export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const end = Number(target) || 0
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setVal(end); return }
    const from = fromRef.current
    const t0 = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)        // easeOutCubic
      setVal(from + (end - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = end
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// 计数展示组件：整数 + 千分位（可选小数位）。
export function Counter({ value, decimals = 0, suffix = '', className = '' }) {
  const v = useCountUp(value)
  const text = v.toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
  return <span className={'count ' + className}>{text}{suffix}</span>
}
