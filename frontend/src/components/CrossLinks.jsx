import React from 'react'

// 跨模块下钻：携当前全局选中剧目，一键跳到其它任务模块查看同一部剧。
// 各任务模块均会在 selected.play_id 变化时自动载入该剧详情，故此处只需 goto。
const TARGETS = [
  { id: 'task1', label: '行当', title: '在「行当分类」查看本剧角色画像' },
  { id: 'task2', label: '关系网络', title: '在「关系网络」查看本剧角色网络' },
  { id: 'task3', label: '主题', title: '在「主题提取」查看本剧主题构成' },
  { id: 'task4', label: '叙事', title: '在「叙事结构」查看本剧强度弧线' },
  { id: 'task5', label: '综合', title: '在「综合关联」查看本剧四维档案' },
  { id: 'compare', label: '双剧对比', title: '在「双剧对比」以本剧为基准' },
]

export default function CrossLinks({ current, goto, play }) {
  if (!goto || !play?.play_id) return null
  return (
    <div className="cross-links">
      <span className="cl-label">联动查看《{play.title}》：</span>
      {TARGETS.filter((t) => t.id !== current).map((t) => (
        <button key={t.id} className="cl-btn" onClick={() => goto(t.id)} title={t.title}>{t.label}</button>
      ))}
    </div>
  )
}
