import React, { useState } from 'react'

const STEPS = [
  { t: '欢迎使用 戏韵·梨园谱系', d: '本系统基于 1473 部京剧剧本（36 万条对白），完成五项可视分析任务。左栏可在「总览 / 行当 / 关系网络 / 主题 / 叙事 / 综合」之间切换。' },
  { t: '剧目全局联动', d: '在左栏搜索任意剧目并设为「当前剧目」后，五个任务模块会自动展示该剧的行当 / 网络 / 主题 / 叙事 / 多维档案，各模块数据保持同步。' },
  { t: '按类型筛选', d: '在任务二点击「剧目类型对比」的柱子，或使用左栏「剧目类型」下拉框，即可让任务二至五的全库视图都只看同一类剧目。' },
  { t: '结论的可信度', d: '任务一提供基线对照与置信度校准曲线；任务二用随机零模型给出 z-score；任务三给出主题数 K 的选择曲线；任务四提供权重敏感性分析；任务五的相关性经 FDR 校正——各项结论都附有可信度依据。' },
  { t: 'AI 分析助手', d: '点击右下角的「问」按钮打开对话助手，它会基于系统已算出的结果回答问题，并根据当前选中的剧目和模块给出相应的回答。' },
]

export default function GuidedTour({ onClose }) {
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const s = STEPS[i]
  return (
    <div className="tour-mask" onClick={onClose}>
      <div className="tour-card" onClick={(e) => e.stopPropagation()}>
        <div className="tour-step">{i + 1} / {STEPS.length}</div>
        <h3 className="tour-t">{s.t}</h3>
        <p className="tour-d">{s.d}</p>
        <div className="tour-dots">
          {STEPS.map((_, k) => (
            <span key={k} className={'tour-dot' + (k === i ? ' on' : '')} onClick={() => setI(k)} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>跳过</button>
          {i > 0 && <button className="tour-btn ghost" onClick={() => setI(i - 1)}>上一步</button>}
          {last
            ? <button className="tour-btn" onClick={onClose}>开始探索</button>
            : <button className="tour-btn" onClick={() => setI(i + 1)}>下一步</button>}
        </div>
      </div>
    </div>
  )
}
