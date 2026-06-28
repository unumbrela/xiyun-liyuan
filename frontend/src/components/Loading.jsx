import React from 'react'

// 图表/数据加载骨架。rows 控制占位条数，h 控制高度。
export function Loading({ h = 340 }) {
  return <div className="skeleton" style={{ height: h, width: '100%' }} />
}

export function Empty({ msg = '暂无数据', ico = '◇' }) {
  return (
    <div className="empty">
      <div className="ico">{ico}</div>
      <div className="msg">{msg}</div>
    </div>
  )
}
