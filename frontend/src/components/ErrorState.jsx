import React from 'react'

// 统一的错误/空态占位：替代「永远载入中」，并可选提供重试。
export default function ErrorState({ message, onRetry, hint }) {
  return (
    <div className="error-state">
      <div className="es-mask" aria-hidden>✕</div>
      <div className="es-title">数据加载未完成</div>
      <div className="es-msg">{message || '后端无响应或数据产物缺失。'}</div>
      {hint && <div className="es-hint">{hint}</div>}
      {onRetry && (
        <button className="es-retry" onClick={onRetry}>重试</button>
      )}
    </div>
  )
}
