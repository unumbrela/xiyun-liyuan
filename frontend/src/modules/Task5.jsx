import React, { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import ErrorState from '../components/ErrorState'
import { api } from '../api'
import { Card, ModuleHead } from './Task1'
import { TYPE_COLORS, TEAL, ROSE, AMBER, VERMILION_LIT, AZURE, GOLD, MUTED } from '../theme'
import {
  corrOption, sankeyOption, archetypeRadarOption, roleBarOption, miniTopicOption,
  predictionOption,
} from '../charts5'

export default function Task5({ selected, onSelect, filter }) {
  const dramaType = filter?.dramaType || ''
  const [corr, setCorr] = useState(null)
  const [sankey, setSankey] = useState(null)
  const [arche, setArche] = useState(null)
  const [archetype, setArchetype] = useState('')
  const [q, setQ] = useState('')
  const [plays, setPlays] = useState({ plays: [], total: 0 })
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState(null)

  const loadAll = () => {
    setErr(null)
    Promise.all([
      api.synCorr().then(setCorr),
      api.synSankey().then(setSankey),
      api.synArchetypes().then(setArche),
    ]).catch((e) => setErr(e.message))
  }
  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    api.synPlays({ q, archetype, drama_type: dramaType, limit: 250 }).then((d) => {
      setPlays(d)
      if (!selected?.play_id) {
        if (d.plays.length) load(d.plays[0].play_id)
        else { setSel(null); setDetail(null) }
      }
    }).catch((e) => setErr(e.message))
  }, [q, archetype, dramaType])

  useEffect(() => { if (selected?.play_id) load(selected.play_id) }, [selected?.play_id])

  const load = (id) => { setSel(id); api.synPlay(id).then(setDetail) }
  const pick = (id, title) => onSelect({ play_id: id, title })

  // 仅依赖 corr 计算：保持 option 引用稳定，避免父级因 plays/detail 异步加载
  // 重渲染时反复 setOption，导致热力图逐格揭示动画半途重启。
  const corrOpt = useMemo(() => (corr ? corrOption(corr) : null), [corr])
  const predOpt = useMemo(() => (corr?.prediction ? predictionOption(corr.prediction) : null), [corr])
  const sankeyOpt = useMemo(() => (sankey ? sankeyOption(sankey) : null), [sankey])
  const archeRadarOpt = useMemo(() => (arche ? archetypeRadarOption(arche.archetypes, arche.signature_cols) : null), [arche])

  if (err) return <ErrorState message={err} onRetry={loadAll} />
  if (!corr || !sankey || !arche) return <div className="loading">载入中…</div>

  return (
    <div>
      <ModuleHead title="任务五 · 综合关联分析"
        desc="打通角色关系网络（任务二）、主题表达（任务三）与叙事结构（任务四），分析三者的关联机制、协同模式与稳定结构特征；构建跨维度联动档案。" />

      <div className="grid">
        <Card title="跨维度关联热力图"
          hint="关系/叙事/行当/主题四维特征的相关系数（蓝负红正）。揭示如『网络规模↔做打量』『模块度↔净占比』等协同关系。">
          <ReactECharts theme="opera-dark" option={corrOpt} className="echart tall" />
        </Card>
        <Card title="关键关联发现"
          hint="不同维度之间相关性最强的若干配对——三维协同的量化证据。显著性经 Benjamini-Hochberg FDR 多重比较校正。">
          {corr.n_tests != null && (
            <div className="hint" style={{ marginBottom: 6 }}>
              共 {corr.n_tests} 项跨维检验，FDR 校正后 <b style={{ color: TEAL }}>{corr.n_significant}</b> 项显著（p&lt;.05）
              {corr.n_robust != null && <>；控制剧目体量（{(corr.controls || []).join('/')}）后 <b style={{ color: GOLD }}>{corr.n_robust}</b> 项偏相关仍稳健（其余为体量驱动）</>}
            </div>
          )}
          <div className="findings scroll" style={{ maxHeight: 354 }}>
            {corr.findings.map((f, i) => (
              <div key={i} className="finding">
                <span className="fr" style={{ color: f.r > 0 ? VERMILION_LIT : AZURE }}>
                  {f.r > 0 ? '+' : ''}{f.r}
                </span>
                <span className="fdim">{f.a_dim}</span> <b>{f.a}</b>
                <span className="farrow">{f.r > 0 ? '↗ 正相关' : '↘ 负相关'}</span>
                <span className="fdim">{f.b_dim}</span> <b>{f.b}</b>
                {f.significant != null && (
                  <span className="fsig" title={f.p_adj != null ? `FDR 校正 p=${f.p_adj}` : ''}
                    style={{ color: f.significant ? TEAL : MUTED, marginLeft: 6, fontSize: 11 }}>
                    {f.significant ? `p<.05${f.r2 != null ? ` · R²=${f.r2}` : ''}` : 'ns'}
                  </span>
                )}
                {f.r_partial != null && (
                  <span className="fsig" title={`控制${(f.controls || []).join('/') || '体量'}后的偏相关`}
                    style={{ color: f.robust ? GOLD : MUTED, marginLeft: 6, fontSize: 11 }}>
                    控体量 r={f.r_partial > 0 ? '+' : ''}{f.r_partial}{f.robust ? '' : ' · 体量驱动'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {corr.prediction && (
        <Card title="轻量预测验证 · 由 网络+行当+主题 预测叙事弧型"
          hint={`把"协同"从相关升级为"可由 A 预测 B"：仅用非叙事维度（网络结构+行当占比+主题分布）交叉验证预测叙事弧型，macro-F1=${corr.prediction.macro_f1}，约为多数类基线（${corr.prediction.baseline_macro_f1}）的 ${(corr.prediction.macro_f1 / corr.prediction.baseline_macro_f1).toFixed(1)} 倍——四维确有可预测的耦合；但绝对精度不高，说明叙事结构仍保有大量自身变异，与"部分协同为体量假象"的偏相关结论一致。`}>
          <div className="grid">
            <ReactECharts theme="opera-dark" option={predOpt} style={{ height: 160 }} />
            <div className="type-stats" style={{ marginTop: 4 }}>
              <div className="hint" style={{ width: '100%' }}>各弧型预测 F1（n={corr.prediction.n}）：</div>
              {corr.prediction.by_class.map((c, i) => (
                <div key={i} className="type-stat"><b>{c.arc}</b><span style={{ marginLeft: 8 }}>F1 {c.f1}</span></div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card title="协同链路 · 剧目类型 → 核心主题 → 叙事模式"
        hint="三维典型组合的流向（连线越粗剧目越多）。如『历史戏→征战主题→结尾渐强高潮』构成稳定协同链路。">
        <ReactECharts theme="opera-dark" option={sankeyOpt} className="echart tall" />
      </Card>

      <Card title="综合原型 · 稳定结构特征"
        hint="在关系×叙事×主题×行当联合空间聚类得到的综合原型——每个原型代表一类协同稳定的剧目结构。">
        <div className="grid" style={{ marginBottom: 4 }}>
          <ReactECharts theme="opera-dark" option={archeRadarOpt} className="echart" />
          <div className="arche-cards scroll" style={{ maxHeight: 360 }}>
            {arche.archetypes.map((a) => (
              <div key={a.id} className="arche-card">
                <div className="arche-top">
                  <b>原型 {a.id}</b><span className="arche-size">{a.size} 部</span>
                </div>
                <div className="arche-tags">
                  {Object.keys(a.drama_type).slice(0, 2).map((t) => (
                    <span key={t} className="type-pill" style={{ background: TYPE_COLORS[t] }}>{t}</span>
                  ))}
                  <span className="arche-meta">主题：{a.top_theme} ｜ 叙事：{a.top_arc}</span>
                </div>
                <div className="arche-rep">例：{a.representative.slice(0, 4).map((r) => r.title).join('、')}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid-3">
        <Card title="剧目检索">
          <div className="filters">
            <input placeholder="剧名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="filters">
            <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              <option value="">全部综合原型</option>
              {arche.archetypes.map((a) => <option key={a.id} value={a.id}>原型{a.id} ({a.size})</option>)}
            </select>
          </div>
          <div className="hint">共 {plays.total} 部 · 点击看四维联动档案</div>
          {plays.plays.length === 0
            ? <div className="empty-hint">没有符合条件的剧目</div>
            : <div className="scroll">
            <table className="plays">
              <thead><tr><th>剧目</th><th>类型</th><th>原型</th></tr></thead>
              <tbody>
                {plays.plays.map((p) => (
                  <tr key={p.play_id} className={sel === p.play_id ? 'active' : ''} onClick={() => pick(p.play_id, p.title)}>
                    <td>{p.title}</td>
                    <td><span className="type-pill" style={{ background: TYPE_COLORS[p.drama_type] }}>{p.drama_type}</span></td>
                    <td>原型{p.archetype}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {detail ? <LinkedProfile d={detail} /> : <div className="loading">选择左侧剧目查看四维联动档案</div>}
        </div>
      </div>
    </div>
  )
}

function LinkedProfile({ d }) {
  return (
    <div>
      <div className="detail-head">
        <span className="title">《{d.title}》</span>
        <span className="type-pill" style={{ background: TYPE_COLORS[d.drama_type] }}>{d.drama_type}</span>
        <span className="meta">综合原型 {d.archetype}</span>
      </div>
      <div className="quad">
        <div className="quad-cell">
          <div className="quad-h" style={{ color: TEAL }}>① 角色关系</div>
          <div className="net-metrics" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <Mini lab="角色" v={d.network.n_nodes} />
            <Mini lab="密度" v={d.network.density} />
            <Mini lab="中心势" v={d.network.centralization} />
            <Mini lab="模块度" v={d.network.modularity} />
          </div>
        </div>
        <div className="quad-cell">
          <div className="quad-h" style={{ color: AMBER }}>④ 角色行当构成</div>
          <ReactECharts theme="opera-dark" option={roleBarOption(d.roles)} style={{ height: 150 }} />
        </div>
        <div className="quad-cell">
          <div className="quad-h" style={{ color: ROSE }}>② 主题表达</div>
          <ReactECharts theme="opera-dark" option={miniTopicOption(d.topics)} style={{ height: 150 }} />
        </div>
        <div className="quad-cell">
          <div className="quad-h" style={{ color: VERMILION_LIT }}>③ 叙事结构</div>
          <div className="net-metrics" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <Mini lab="叙事模式" v={d.narrative.arc} />
            <Mini lab="高潮位" v={(d.narrative.peak_pos * 100).toFixed(0) + '%'} />
            <Mini lab="高潮类型" v={d.narrative.climax_type} />
            <Mini lab="做打量" v={d.narrative.action_total} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ lab, v }) {
  return <div className="mini"><div className="mini-v" style={{ fontSize: 13 }}>{v}</div><div className="mini-l">{lab}</div></div>
}
