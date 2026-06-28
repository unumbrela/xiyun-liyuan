import React, { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import ErrorState from '../components/ErrorState'
import { api } from '../api'
import { TYPE_COLORS } from '../theme'
import { Card, ModuleHead } from './Task1'
import { pairwiseSigOption } from '../charts2'
import {
  arcCurvesOption, peakHistOption, rhythmByTypeOption, narrativeCurveOption,
  silhouetteOption, weightSensitivityOption,
} from '../charts4'

export default function Task4({ selected, onSelect, filter }) {
  const dramaType = filter?.dramaType || ''
  const [pat, setPat] = useState(null)
  const [arc, setArc] = useState('')
  const [q, setQ] = useState('')
  const [plays, setPlays] = useState({ plays: [], total: 0 })
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [bandId, setBandId] = useState(null)   // 弧线分位带聚焦
  const [sigMetric, setSigMetric] = useState('做打量')
  const [err, setErr] = useState(null)

  const loadAll = () => {
    setErr(null)
    api.narPatterns().then(setPat).catch((e) => setErr(e.message))
  }
  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    api.narPlays({ q, arc, drama_type: dramaType, limit: 250 }).then((d) => {
      setPlays(d)
      if (!selected?.play_id) {
        if (d.plays.length) load(d.plays[0].play_id)
        else { setSel(null); setDetail(null) }
      }
    }).catch((e) => setErr(e.message))
  }, [q, arc, dramaType])

  useEffect(() => { if (selected?.play_id) load(selected.play_id) }, [selected?.play_id])

  const load = (id) => { setSel(id); api.narPlay(id).then(setDetail) }
  const pick = (id, title) => onSelect({ play_id: id, title })

  // 全库图表记忆化：选剧/检索时只重算与单剧无关图中受 bandId/sigMetric 影响者（卡顿源）
  const arcOpt = useMemo(() => (pat ? arcCurvesOption(pat.arcs, pat.L, bandId) : null), [pat, bandId])
  const peakOpt = useMemo(() => (pat ? peakHistOption(pat.peak_hist) : null), [pat])
  const rhythmOpt = useMemo(() => (pat ? rhythmByTypeOption(pat.by_drama_type) : null), [pat])
  const sigOpt = useMemo(() => (pat?.type_significance ? pairwiseSigOption(pat.type_significance, sigMetric) : null), [pat, sigMetric])
  const silOpt = useMemo(() => (pat?.k_selection ? silhouetteOption(pat.k_selection, 5) : null), [pat])
  const weightOpt = useMemo(() => (pat?.weight_sensitivity ? weightSensitivityOption(pat.weight_sensitivity) : null), [pat])

  if (err) return <ErrorState message={err} onRetry={loadAll} />
  if (!pat) return <div className="loading">载入中…</div>

  return (
    <div>
      <ModuleHead title="任务四 · 叙事结构分析"
        desc="以表演形式标记（唱念做打）合成逐场戏剧强度曲线，识别开端/发展/高潮/结局关键阶段，刻画剧情起伏与节奏；并聚类典型叙事弧线模式、比较不同剧目的结构差异。" />

      <div className="grid">
        <Card title="典型叙事弧线原型"
          hint="按强度曲线聚类得到的 5 种叙事模式（图例含剧目数）：平稳铺陈 / 前段先声夺人 / 中段经典弧线 / 后段渐强 / 结尾陡升。点下方按钮聚焦某弧线，叠加其簇内 p25–p75 离散度带。">
          <div className="filters" style={{ marginBottom: 6 }}>
            <button className={'seg' + (bandId == null ? ' on' : '')} onClick={() => setBandId(null)}>全部</button>
            {pat.arcs.map((a) => (
              <button key={a.id} className={'seg' + (bandId === a.id ? ' on' : '')}
                onClick={() => setBandId(bandId === a.id ? null : a.id)}>{a.label}</button>
            ))}
          </div>
          <ReactECharts theme="opera-dark" notMerge option={arcOpt} className="echart" />
        </Card>
        <Card title="高潮位置分布"
          hint="全库剧目高潮出现的剧情进度位置——多数戏将高潮置于剧情后半（渐强收束）。">
          <ReactECharts theme="opera-dark" option={peakOpt} className="echart" />
        </Card>
      </div>

      <Card title="跨剧目类型 · 节奏特征对比"
        hint="各类型的平均高潮位置、渐强指数与做打量。历史戏做打最多、节奏外放；家庭/公案戏更依赖唱念抒情。">
        <ReactECharts theme="opera-dark" option={rhythmOpt} className="echart" />
        <div className="type-stats">
          {Object.entries(pat.by_drama_type).map(([t, s]) => (
            <div key={t} className="type-stat">
              <span className="type-dot" style={{ background: TYPE_COLORS[t] }} />
              <b>{t}</b> {s.count}部 · 高潮位{s.mean_peak_pos} · 做打{s.mean_action} ·
              唱占比{(s.mean_sing_ratio * 100).toFixed(1)}%
            </div>
          ))}
        </div>
      </Card>

      {pat.type_significance && (
        <Card title="类型节奏差异显著性 · 两两检验"
          hint="各剧目类型在做打量/高潮位置/唱腔占比上的两两 Mann–Whitney U 检验（BH-FDR 校正）。读作「行 vs 列」：▲=行显著更高、▼=显著更低、·=不显著。可见历史戏做打量显著高于家庭戏与神怪戏，但与公案戏差异未达显著——比『历史戏做打最多』更精确。">
          <div className="filters" style={{ marginBottom: 6 }}>
            {pat.type_significance.metrics.map((mname) => (
              <button key={mname} className={'seg' + (sigMetric === mname ? ' on' : '')}
                onClick={() => setSigMetric(mname)}>{mname}</button>
            ))}
          </div>
          <ReactECharts theme="opera-dark" notMerge
            option={sigOpt} className="echart" />
        </Card>
      )}

      {pat.k_selection && (
        <div className="grid">
          <Card title="弧线数 K · 轮廓系数选择"
            hint="对 K=2…8 聚类计算轮廓系数。曲线整体平缓（0.12–0.14），K=2 仅能区分「平稳 vs 起伏」；K=5 以极小的轮廓代价换取 5 种可辨叙事弧形，兼顾区分度与可解释性。">
            <ReactECharts theme="opera-dark" option={silOpt} className="echart" />
          </Card>
          <Card title="强度权重敏感性 · 弧线划分稳健性"
            hint="改变文/武/冲突合成权重后，弧线聚类与采用权重(0.4/0.4/0.2)的一致性（调整兰德指数 ARI）。±0.1 的文武微调仍保留约 0.55–0.60 的一致性——划分对权重选择中等稳健，文武平衡是最敏感因素。">
            <ReactECharts theme="opera-dark" option={weightOpt} className="echart" />
          </Card>
        </div>
      )}

      <div className="grid-3">
        <Card title="剧目检索">
          <div className="filters">
            <input placeholder="剧名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="filters">
            <select value={arc} onChange={(e) => setArc(e.target.value)}>
              <option value="">全部叙事模式</option>
              {pat.arcs.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.size})</option>)}
            </select>
          </div>
          <div className="hint">共 {plays.total} 部 · 按场次数排序</div>
          {plays.plays.length === 0
            ? <div className="empty-hint">没有符合条件的剧目</div>
            : <div className="scroll">
            <table className="plays">
              <thead><tr><th>剧目</th><th>场</th><th>高潮位</th><th>高潮</th></tr></thead>
              <tbody>
                {plays.plays.map((p) => (
                  <tr key={p.play_id} className={sel === p.play_id ? 'active' : ''} onClick={() => pick(p.play_id, p.title)}>
                    <td>{p.title}</td><td>{p.n_scenes}</td>
                    <td>{(p.peak_pos * 100).toFixed(0)}%</td>
                    <td><span className={'climax ' + (p.climax_type.includes('武') ? 'wu' : 'wen')}>{p.climax_type.includes('武') ? '武' : '文'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {detail ? <NarDetail d={detail} /> : <div className="loading">选择左侧剧目查看叙事曲线</div>}
        </div>
      </div>
    </div>
  )
}

function NarDetail({ d }) {
  return (
    <div>
      <div className="detail-head">
        <span className="title">《{d.title}》</span>
        <span className="type-pill" style={{ background: TYPE_COLORS[d.drama_type] }}>{d.drama_type}</span>
        <span className="meta">{d.n_scenes} 场 · {d.arc_label || '—'} · 高潮位 {(d.peak_pos * 100).toFixed(0)}% · {d.climax_type}高潮</span>
      </div>
      <div className="plot-box" style={{ maxHeight: 70 }}>{d.plot}</div>
      <ReactECharts theme="opera-dark" option={narrativeCurveOption(d)} style={{ height: 360 }} notMerge />
      <div className="legend">
        <span><i style={{ background: '#8c3a30' }} />阶段分带(开端/发展/高潮/结局)</span>
        <span>实线=综合强度</span>
        <span>紫虚线=唱腔(文)</span>
        <span>绿虚线=武打(武)</span>
      </div>
    </div>
  )
}
