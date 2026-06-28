import React from 'react'
import { TYPE_COLORS } from '../theme'

// 全站统一的剧目类型图例（取自单一配色源 TYPE_COLORS）。
// 点击色块即设为全局剧目类型筛选；再次点击同项取消（双向联动）。
const TYPES = ['历史戏', '家庭戏', '公案戏', '神怪戏', '其他']

export default function TypeLegend({ active = '', onPick }) {
  return (
    <div className="type-legend">
      {TYPES.map((t) => (
        <button key={t} type="button"
          className={'type-legend-item' + (active === t ? ' on' : '') + (active && active !== t ? ' dim' : '')}
          onClick={() => onPick && onPick(active === t ? '' : t)}
          title={active === t ? '点击取消筛选' : `按「${t}」联动筛选全站`}>
          <i style={{ background: TYPE_COLORS[t] }} />{t}
        </button>
      ))}
    </div>
  )
}
