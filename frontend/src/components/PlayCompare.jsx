import React, { useState, useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { api, ROLE_COLORS } from '../api'
import { Card, ModuleHead } from '../modules/Task1'
import { TYPE_COLORS, VERMILION_LIT, AZURE, MUTED } from '../theme'

// 选剧器：点击/聚焦展开下拉候选，输入剧名实时过滤，选定即用。
function Picker({ placeholder, onPick }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  // 有输入则按关键字检索，无输入则拉默认剧目列表（角色数从多到少）。
  useEffect(() => {
    let alive = true
    const params = q.trim() ? { q, limit: 20 } : { limit: 40 }
    api.plays(params).then((d) => alive && setRes(d.plays || []))
    return () => { alive = false }
  }, [q])
  // 点击外部关闭下拉。
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="compare-picker" ref={wrapRef}>
      <input placeholder={placeholder} value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)} />
      <span className="compare-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v) }}>▾</span>
      {open && (
        <div className="compare-pop">
          {res.length === 0 && <div className="compare-pop-empty">无匹配剧目</div>}
          {res.map((p) => (
            <div key={p.play_id} className="compare-pop-item"
              onClick={() => { onPick(p.play_id, p.title); setOpen(false); setQ(p.title) }}>
              <span className="compare-pop-title">{p.title}</span>
              {p.n_roles != null && <span className="compare-pop-meta">{p.period} · {p.n_roles}角</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const DIMS = [
  ['角色数', (d) => d.network.n_nodes],
  ['密度', (d) => d.network.density],
  ['中心势', (d) => d.network.centralization],
  ['模块度', (d) => d.network.modularity],
  ['做打', (d) => d.narrative.action_total],
  ['唱占比', (d) => d.narrative.sing_ratio],
  ['高潮位', (d) => d.narrative.peak_pos],
]

function compareRadar(a, b) {
  const inds = DIMS.map(([name, f]) => ({
    name, max: Math.max(f(a), f(b), 1e-6) * 1.15,
  }))
  return {
    tooltip: {},
    legend: { data: [a.title, b.title], top: 0, textStyle: { fontFamily: 'serif', fontSize: 11 } },
    radar: {
      indicator: inds, radius: '62%', center: ['50%', '54%'],
      axisName: { fontFamily: 'serif', fontSize: 11, color: MUTED },
      splitLine: { lineStyle: { color: 'rgba(42,36,32,0.12)' } },
      axisLine: { lineStyle: { color: 'rgba(42,36,32,0.18)' } },
    },
    series: [{
      type: 'radar',
      data: [
        { name: a.title, value: DIMS.map(([, f]) => f(a)),
          lineStyle: { color: VERMILION_LIT, width: 2 }, itemStyle: { color: VERMILION_LIT },
          areaStyle: { color: VERMILION_LIT, opacity: 0.08 } },
        { name: b.title, value: DIMS.map(([, f]) => f(b)),
          lineStyle: { color: AZURE, width: 2 }, itemStyle: { color: AZURE },
          areaStyle: { color: AZURE, opacity: 0.08 } },
      ],
    }],
  }
}

function roleBars(a, b) {
  const roles = ['生', '旦', '净', '丑']
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: [a.title, b.title], top: 0, textStyle: { fontFamily: 'serif', fontSize: 11 } },
    grid: { left: 36, right: 12, top: 30, bottom: 20 },
    xAxis: { type: 'category', data: roles, axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'value', axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    series: [
      { name: a.title, type: 'bar', itemStyle: { color: VERMILION_LIT },
        data: roles.map((r) => a.roles[r] || 0) },
      { name: b.title, type: 'bar', itemStyle: { color: AZURE },
        data: roles.map((r) => b.roles[r] || 0) },
    ],
  }
}

function Side({ d, color }) {
  if (!d) return <div className="loading">选择剧目</div>
  return (
    <div>
      <div className="detail-head">
        <span className="pc-dot" style={{ background: color }} />
        <span className="title">《{d.title}》</span>
        <span className="type-pill" style={{ background: TYPE_COLORS[d.drama_type] }}>{d.drama_type}</span>
      </div>
      <div className="net-metrics">
        <Mini lab="角色" v={d.network.n_nodes} /><Mini lab="密度" v={d.network.density} />
        <Mini lab="中心势" v={d.network.centralization} /><Mini lab="模块度" v={d.network.modularity} />
        <Mini lab="做打" v={d.narrative.action_total} /><Mini lab="高潮位" v={(d.narrative.peak_pos * 100).toFixed(0) + '%'} />
      </div>
      <div className="hint" style={{ marginTop: 8 }}>叙事：{d.narrative.arc} · {d.narrative.climax_type}高潮 · 渐强 {d.narrative.rising_index}</div>
      <div className="hint" style={{ marginTop: 6 }}>主导主题</div>
      <div className="topic-words">
        {d.topics.map((t) => (
          <div key={t.id} className="topic-row">
            <span className="topic-chip">T{t.id}</span>
            <span className="topic-kw">{t.label} · {(t.w * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Mini({ lab, v }) {
  return <div className="mini"><div className="mini-v">{v}</div><div className="mini-l">{lab}</div></div>
}

export default function PlayCompare({ selected }) {
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const [err, setErr] = useState('')
  const loadA = (id) => api.synPlay(id).then(setA).catch(() => setErr('剧目 A 无四维档案（场次过少）'))
  const loadB = (id) => api.synPlay(id).then(setB).catch(() => setErr('剧目 B 无四维档案（场次过少）'))

  useEffect(() => { if (selected?.play_id) loadA(selected.play_id) }, [selected?.play_id])

  return (
    <div>
      <ModuleHead title="双剧对比 · 四维横向"
        desc="任选两部剧目，并排比较其角色行当、关系网络、主题表达与叙事结构——直观看出题材如何同时塑造人物关系拓扑、行当配置与叙事节奏。" />

      <div className="grid">
        <Card title="剧目 A（默认=当前选中剧目）">
          <Picker placeholder="搜索剧名设为 A…" onPick={loadA} />
          <Side d={a} color={VERMILION_LIT} />
        </Card>
        <Card title="剧目 B">
          <Picker placeholder="搜索剧名设为 B…" onPick={loadB} />
          <Side d={b} color={AZURE} />
        </Card>
      </div>

      {err && <div className="hint" style={{ color: VERMILION_LIT }}>{err}</div>}

      {a && b && (
        <div className="grid">
          <Card title="四维结构 · 对比雷达"
            hint="七个维度按两剧最大值归一，包络越大者该维更突出。">
            <ReactECharts theme="opera-dark" notMerge option={compareRadar(a, b)} className="echart" />
          </Card>
          <Card title="行当占比 · 对比"
            hint="生/旦/净/丑占比并排——行当配置差异。">
            <ReactECharts theme="opera-dark" notMerge option={roleBars(a, b)} className="echart" />
          </Card>
        </div>
      )}
    </div>
  )
}
