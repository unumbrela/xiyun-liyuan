import React from 'react'

// 启动页：幕布拉开 + 后端就绪进度。status: 'booting' | 'ready'
export default function Splash({ status, open, done }) {
  return (
    <div className={'splash' + (open ? ' open' : '') + (done ? ' hide' : '')}>
      <div className="curtain l" />
      <div className="curtain r" />
      <div className="splash-core">
        <div className="splash-cn">戏韵</div>
        <div className="splash-sub">梨园谱系 · 京剧剧本可视分析</div>
        <div className="splash-status">
          {status === 'ready' ? '数据加载完成 · 1473 部剧本' : '正在启动分析引擎…'}
        </div>
        <div className="splash-bar"><i /></div>
      </div>
    </div>
  )
}
