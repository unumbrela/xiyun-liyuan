import React from 'react'

// 戏台匾额式自定义标题栏。窗口控件经 preload(window.opera) 透传给 Electron 主进程；
// 在浏览器(开发态)中 window.opera 不存在，则隐藏控件，仅保留匾额。
export default function TitleBar() {
  const win = typeof window !== 'undefined' ? window.opera : null
  return (
    <div className="titlebar">
      <div className="tb-left">
        <span className="tb-seal">韵</span>
        <span>ChinaVis 2026 · 赛题 1-I 京剧</span>
      </div>
      <div className="tb-plaque">戏韵 · 梨园谱系</div>
      {win && (
        <div className="win-controls">
          <button className="win-btn" title="最小化" onClick={() => win.minimize()}>—</button>
          <button className="win-btn" title="最大化" onClick={() => win.toggleMaximize()}>▢</button>
          <button className="win-btn close" title="关闭" onClick={() => win.close()}>✕</button>
        </div>
      )}
    </div>
  )
}
