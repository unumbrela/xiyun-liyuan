import React, { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { api, ROLE_COLORS } from '../api'
import { TYPE_COLORS, AZURE, TEAL, MUTED } from '../theme'
import { Card } from './Task1'
import { Counter } from '../hooks/useCountUp'
import TypeLegend from '../components/TypeLegend'

const TASKS = [
  { id: 'task1', name: '任务一 · 角色行当分类', state: '已完成',
    desc: '推断未标注角色行当，归纳特征↔行当模式与时期演化。' },
  { id: 'task2', name: '任务二 · 角色关系网络', state: '已完成',
    desc: '构建角色互动网络，对比历史/家庭/公案等剧目类型的网络结构。' },
  { id: 'task3', name: '任务三 · 主题提取', state: '已完成',
    desc: 'LDA 提取 10 个动作母题，分析主题构成、共现组合与跨类型/时期比较。' },
  { id: 'task4', name: '任务四 · 叙事结构', state: '已完成',
    desc: '唱念做打合成戏剧强度曲线，识别关键阶段，聚类典型叙事弧线。' },
  { id: 'task5', name: '任务五 · 综合关联', state: '已完成',
    desc: '关系×主题×叙事跨维度相关、协同链路与综合原型联动分析。' },
]

export default function Overview({ goto, onFilter }) {
  const [quality, setQuality] = useState(null)
  const [dist, setDist] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [ov, setOv] = useState(null)

  useEffect(() => {
    api.quality().then(setQuality)
    api.distribution().then(setDist)
    api.metrics().then(setMetrics)
    api.overview().then(setOv).catch(() => setOv({ by_type: [], by_period: [] }))
  }, [])

  if (!quality || !dist) return <div className="loading">载入中…</div>
  const inferred = dist.by_role.reduce((s, d) => s + d.inferred, 0)
  const f1 = metrics ? (metrics.macro_f1 * 100).toFixed(1) : '—'
  const colls = Object.entries(quality.by_collection).sort((a, b) => b[1] - a[1])

  // ① 行当构成（标注+推断合计），脸谱色
  const roleDonut = {
    tooltip: { trigger: 'item', formatter: (p) => `${p.name}行<br/>${p.value} 个角色 · ${p.percent}%` },
    series: [{
      type: 'pie', radius: ['40%', '64%'], center: ['50%', '50%'],
      data: dist.by_role.map((d) => ({ name: d.role, value: d.total, itemStyle: { color: ROLE_COLORS[d.role] } })),
      label: { fontFamily: 'serif', formatter: '{b} {d}%' },
    }],
  }

  // ② 剧目类型分布，独立类型色板（点击下钻为全局筛选）
  const typeDonut = ov && {
    tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/>${p.value} 部 · ${p.percent}%` },
    series: [{
      type: 'pie', radius: ['40%', '64%'], center: ['50%', '50%'],
      data: (ov.by_type || []).map((d) => ({ name: d.name, value: d.value, itemStyle: { color: TYPE_COLORS[d.name] || MUTED } })),
      label: { fontFamily: 'serif', formatter: '{b} {d}%' },
    }],
  }

  // ③ 时期分布，古铜调
  const periodBar = ov && {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => v + ' 部' },
    grid: { left: 52, right: 24, top: 44, bottom: 24 },
    xAxis: { type: 'category', data: (ov.by_period || []).map((d) => d.name), axisLabel: { fontFamily: 'serif', fontSize: 13 } },
    yAxis: { type: 'value', name: '剧目数', nameGap: 16 },
    series: [{
      type: 'bar', barWidth: '46%', data: (ov.by_period || []).map((d) => d.value),
      itemStyle: { color: TEAL, borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', fontFamily: 'var(--mono)' },
    }],
  }

  const collBar = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 130, right: 24, top: 10, bottom: 20 },
    xAxis: { type: 'value', name: '剧目数' },
    yAxis: { type: 'category', inverse: true, data: colls.slice(0, 14).map((c) => c[0]).reverse(),
      axisLabel: { fontFamily: 'serif', fontSize: 11 } },
    series: [{
      type: 'bar', data: colls.slice(0, 14).map((c) => c[1]).reverse(),
      itemStyle: { color: AZURE, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', fontSize: 11 },
    }],
  }

  // 类型饼/图例点击 → 设为全局剧目类型筛选（双向联动）
  const onTypePick = (name) => onFilter && name && onFilter({ dramaType: name })

  return (
    <div>
      <div className="module-head">
        <div>
          <h1>戏韵·梨园谱系 — 京剧剧本可视分析系统</h1>
          <p>面向 ChinaVis 2026 赛题 1-I 京剧数据集的可视分析软件，基于同一份数据完成五项分析任务。</p>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi num={quality.parsed} lab="剧目（全部解析）" i={0} />
        <Kpi num={quality.roles} lab="标注角色实例" i={1} />
        <Kpi num={quality.lines} lab="对白条目" i={2} />
        <Kpi num={inferred} lab="推断行当角色" i={3} />
        <Kpi num={Object.keys(quality.by_collection).length} lab="来源集合（全部使用）" i={4} />
      </div>

      <div className="grid-3">
        <Card title="行当构成 · 全库角色" hint="生旦净丑杂五大行当的角色实例占比（含模型推断）。">
          <ReactECharts theme="opera-dark" option={roleDonut} className="echart" />
        </Card>
        <Card title="剧目类型分布" hint="历史/家庭/公案/神怪/其他五类的剧目数量。点击扇区即按该类型联动筛选全站。">
          {typeDonut
            ? <ReactECharts theme="opera-dark" option={typeDonut} className="echart"
                onEvents={{ click: (e) => onTypePick(e.name) }} />
            : <div className="loading">载入中…</div>}
          <TypeLegend onPick={onTypePick} />
        </Card>
        <Card title="时期分布 · 剧目数" hint="按来源集合映射的清末民国 / 建国初期 / 当代三时期剧目数。">
          {periodBar ? <ReactECharts theme="opera-dark" option={periodBar} className="echart" />
            : <div className="loading">载入中…</div>}
        </Card>
      </div>

      <div className="grid">
        <Card title="数据来源 · 各集合剧目数（前14）"
          hint="数据集含 38 个来源集合，从《戏考》《京剧汇编》到各名家剧本选，全部纳入分析。">
          <ReactECharts theme="opera-dark" option={collBar} className="echart tall" />
        </Card>
        <Card title="任务进度" hint="点击卡片进入对应模块。">
          <div className="task-list">
            {TASKS.map((t) => (
              <div key={t.id} className={'task-card ' + (t.state === '已完成' ? 'done' : 'todo')}
                onClick={() => t.state === '已完成' && goto(t.id)}>
                <div className="task-top">
                  <span className="task-name">{t.name}</span>
                  <span className={'task-state ' + (t.state === '已完成' ? 'ok' : 'wait')}>{t.state}</span>
                </div>
                <div className="task-desc">{t.desc}</div>
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            任务一行当分类交叉验证 macro-F1 = {f1}%。后续任务复用同一份 scenes/对白/共现语料底座。
          </div>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ num, lab, i = 0 }) {
  return (
    <div className="kpi" style={{ '--i': i }}>
      <div className="num">{typeof num === 'number' ? <Counter value={num} /> : num}</div>
      <div className="lab">{lab}</div>
    </div>
  )
}
