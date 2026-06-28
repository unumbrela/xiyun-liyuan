import React, { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import ErrorState from '../components/ErrorState'
import { api, ROLE_COLORS } from '../api'
import {
  distOption, subroleSunburstOption, profileRadarOption, actHeatOption,
  temporalOption, playRolesOption, confidenceBandOption,
  baselineBarOption, calibrationOption, confusionOption, confusionPairs,
} from '../charts'
import { Counter } from '../hooks/useCountUp'

export default function Task1({ selected, onSelect }) {
  const [metrics, setMetrics] = useState(null)
  const [patterns, setPatterns] = useState(null)
  const [temporal, setTemporal] = useState(null)
  const [dist, setDist] = useState(null)
  const [subroles, setSubroles] = useState(null)
  const [meta, setMeta] = useState(null)
  const [lowAudit, setLowAudit] = useState({ items: [], total: 0 })

  const [collection, setCollection] = useState('')
  const [period, setPeriod] = useState('')
  const [q, setQ] = useState('')
  const [plays, setPlays] = useState({ plays: [], total: 0 })
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState(null)

  const loadAll = () => {
    setErr(null)
    Promise.all([
      api.metrics().then(setMetrics),
      api.patterns().then(setPatterns),
      api.temporal().then(setTemporal),
      api.distribution().then(setDist),
      api.subroles().then(setSubroles),
      api.meta().then(setMeta),
      api.inferred({ band: '低', limit: 80 }).then(setLowAudit),
    ]).catch((e) => setErr(e.message))
  }
  useEffect(() => { loadAll() }, [])

  const load = (id) => { setSel(id); api.play(id).then(setDetail) }
  const choose = (id, title) => onSelect({ play_id: id, title })

  useEffect(() => {
    api.plays({ collection, period, q, limit: 300 }).then((d) => {
      setPlays(d)
      if (!selected?.play_id) {
        if (d.plays.length) load(d.plays[0].play_id)
        else { setSel(null); setDetail(null) }
      }
    }).catch((e) => setErr(e.message))
  }, [collection, period, q])

  // 全局选中剧目变化 -> 加载本模块钻取（跨模块联动）
  useEffect(() => { if (selected?.play_id) load(selected.play_id) }, [selected?.play_id])

  // 全库图表只依赖各自数据源，记忆化后避免「选剧/检索」时无谓重算与全图 setOption（卡顿源）
  const baseOpt = useMemo(() => (metrics?.baselines ? baselineBarOption(metrics.baselines) : null), [metrics])
  const calibOpt = useMemo(() => (metrics?.calibration ? calibrationOption(metrics.calibration) : null), [metrics])
  const confOpt = useMemo(() => (metrics?.confusion_matrix ? confusionOption(metrics.confusion_matrix, metrics.labels) : null), [metrics])
  const confPairs = useMemo(() => (metrics?.confusion_matrix ? confusionPairs(metrics.confusion_matrix, metrics.labels, 5) : []), [metrics])
  const bandOpt = useMemo(() => (metrics ? confidenceBandOption(metrics) : null), [metrics])
  const distOpt = useMemo(() => (dist ? distOption(dist.by_role) : null), [dist])
  const sunOpt = useMemo(() => (subroles ? subroleSunburstOption(subroles.sunburst) : null), [subroles])
  const radarOpt = useMemo(() => (patterns ? profileRadarOption(patterns.feature_profile,
    ['ratio_chang', 'ratio_nian', 'ratio_bai', 'n_lines', 'degree', 'kw_female']) : null), [patterns])
  const heatOpt = useMemo(() => (patterns ? actHeatOption(patterns.feature_profile) : null), [patterns])
  const tempOpt = useMemo(() => (temporal ? temporalOption(temporal) : null), [temporal])

  if (err) return <ErrorState message={err} onRetry={loadAll} />
  if (!dist || !patterns || !temporal) return <div className="loading">载入中…</div>
  const f1 = metrics ? (metrics.macro_f1 * 100).toFixed(1) : '—'
  const groupF1 = metrics?.group_play_cv ? (metrics.group_play_cv.macro_f1 * 100).toFixed(1) : '—'
  const cleanWords = patterns.clean_top_words || patterns.top_words

  return (
    <div>
      <ModuleHead title="任务一 · 角色行当分类" f1={f1} groupF1={groupF1}
        desc="依据角色性别/年龄身份线索、唱念做打与台词特征推断未标注角色行当；官方主类聚焦生/旦/净/丑，杂作为群演辅助类，并显式标注低置信待核样本。" />

      {metrics && <AuditStrip metrics={metrics} />}

      {metrics?.baselines && (
        <div className="grid">
          <Card title="模型选型 · 基线对照"
            hint="同一特征下与多数类、随机森林（非线性）对比 5 折 macro-F1——逻辑回归在可解释与精度间取得最佳权衡，远高于多数类基线、优于随机森林。">
            <ReactECharts theme="opera-dark" option={baseOpt} className="echart" />
          </Card>
          <Card title="置信度可靠性 · 校准曲线"
            hint={`推断置信度与实际准确率的吻合度（金线贴近灰色理想线即校准良好）。多类 Brier=${metrics.calibration?.brier}；高置信样本准确率显著更高，支撑「按置信度分层采信」。`}>
            {metrics.calibration
              ? <ReactECharts theme="opera-dark" option={calibOpt} className="echart" />
              : <div className="loading">载入中…</div>}
          </Card>
        </div>
      )}

      {metrics?.confusion_matrix && (
        <div className="grid">
          <Card title="误判结构 · 混淆矩阵（召回视角）"
            hint="行=真实行当、列=预测行当，按行归一（对角=召回率）。最大误判集中在生↔净——二者同以念白为主、舞台气质相近，是 macro-F1 的主要上限来源，而非模型缺陷；杂行样本稀少、召回最低。">
            <ReactECharts theme="opera-dark" option={confOpt} className="echart" />
          </Card>
          <Card title="最易混淆行当对 · 误判分析"
            hint="按误判数排序的「真实→预测」有序对——量化哪些行当边界最模糊，指导人工复核优先级。">
            <div className="type-stats" style={{ marginTop: 4 }}>
              {confPairs.map((p, i) => (
                <div key={i} className="type-stat">
                  <span className={`role-tag role-${p.from}`}>{p.from}</span>
                  <span style={{ margin: '0 6px', color: 'var(--muted)' }}>→</span>
                  <span className={`role-tag role-${p.to}`}>{p.to}</span>
                  <b style={{ marginLeft: 8 }}>{p.count} 例</b>
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>（占{p.from}行 {(p.ratio * 100).toFixed(0)}%）</span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              生/净念白型互判最频繁；旦行偶被判作丑/生（花旦俏皮口语近丑）。误判结构与表演型重叠一致，印证模型学到的是真实的行当表演特征。
            </p>
          </Card>
        </div>
      )}

      <div className="grid">
        <Card title="行当分布 · 标注 vs 推断"
          hint="主要角色已标注行当；其余出场角色由分类器推断（斜纹为推断量）。">
          <ReactECharts theme="opera-dark" option={distOpt} className="echart" />
        </Card>
        <Card title="模型审计 · 置信度分层"
          hint="推断角色按置信度分为高/中/低；低置信角色在单剧表中标为待核，不作为强证据。各行当推断可信度差异显著——下方按行当列出低置信占比，生/净推断最不确定，须重点复核。">
          {metrics
            ? <ReactECharts theme="opera-dark" option={bandOpt} className="echart" />
            : <div className="loading">载入中…</div>}
          {metrics.confidence_bands?.by_pred_role && (
            <div className="type-stats">
              {Object.entries(metrics.confidence_bands.by_pred_role)
                .sort((a, b) => b[1].low_ratio - a[1].low_ratio)
                .map(([role, s]) => (
                  <div key={role} className="type-stat">
                    <span className="type-dot" style={{ background: ROLE_COLORS[role] || 'var(--muted)' }} />
                    <b>{role}</b> 低置信 {(s.low_ratio * 100).toFixed(0)}% · 均置信 {s.mean_confidence}
                  </div>
                ))}
            </div>
          )}
          <LowConfidenceList items={lowAudit.items} total={lowAudit.total} onSelect={choose} />
        </Card>
      </div>

      <div className="grid">
        <Card title="行当谱系 · 大类→细分行当（含推断）" span={2}
          hint="内圈五大行当，外圈细分行当。生/旦标注充足→分层分类器推断未标注角色细分；净/丑标注稀疏→仅展示已标注。">
          {subroles
            ? <ReactECharts theme="opera-dark" option={sunOpt} className="echart" />
            : <div className="loading">载入中…</div>}
          {subroles && <SubroleCaption sr={subroles} />}
        </Card>
      </div>

      <div className="grid">
        <Card title="特征↔行当 对应模式 · 雷达"
          hint="各行当在表演型（唱/念/白）与结构特征上的典型画像——分类依据所在。">
          <ReactECharts theme="opera-dark" option={radarOpt} className="echart" />
        </Card>
        <Card title="表演型占比热力 · 唱念白"
          hint="旦行唱占比最高、丑行近乎全白——量化唱念做打与行当的对应。">
          <ReactECharts theme="opera-dark" option={heatOpt} className="echart" />
          <TopWords tw={cleanWords} />
        </Card>
      </div>

      <Card title="时期演化 · 行当结构变迁"
        hint="按剧本来源集合映射历史时期（清末民国 / 建国初期 / 当代），观察行当占比演化。">
        <ReactECharts theme="opera-dark" option={tempOpt} className="echart" />
        {temporal.significance && <TemporalSig sig={temporal.significance} />}
      </Card>

      <div className="grid-3">
        <Card title="剧目检索">
          <div className="filters">
            <input placeholder="剧名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="filters">
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">全部时期</option>
              {meta?.periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={collection} onChange={(e) => setCollection(e.target.value)}>
              <option value="">全部集合</option>
              {meta?.collections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="hint">共 {plays.total} 部 · 点击联动右侧</div>
          {plays.plays.length === 0
            ? <div className="empty-hint">没有符合条件的剧目</div>
            : <div className="scroll">
            <table className="plays">
              <thead><tr><th>剧目</th><th>时期</th><th>角色</th><th>推断</th><th>待核</th></tr></thead>
              <tbody>
                {plays.plays.map((p) => (
                  <tr key={p.play_id} className={sel === p.play_id ? 'active' : ''}
                    onClick={() => choose(p.play_id, p.title)}>
                    <td>{p.title}</td><td>{p.period}</td><td>{p.n_roles}</td><td>{p.n_inferred}</td><td>{p.n_low_confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {detail ? <PlayDetail d={detail} /> : <div className="loading">选择左侧剧目查看</div>}
        </div>
      </div>
    </div>
  )
}

export function Card({ title, hint, children, span, action }) {
  return (
    <div className="card" style={span ? { gridColumn: `span ${span}` } : undefined}>
      {action
        ? <div className="card-head-row"><h2>{title}</h2>{action}</div>
        : <h2>{title}</h2>}
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  )
}

export function ModuleHead({ title, desc, f1, groupF1 }) {
  return (
    <div className="module-head">
      <div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {f1 && <div className="metric-stack">
        <div className="metric-chip">实例级 macro-F1<b><Counter value={parseFloat(f1)} decimals={1} suffix="%" /></b></div>
        <div className="metric-chip subtle">按剧目分组<b><Counter value={parseFloat(groupF1)} decimals={1} suffix="%" /></b></div>
      </div>}
    </div>
  )
}

function AuditStrip({ metrics }) {
  const inf = metrics.confidence_bands?.inferred || {}
  const low = inf['低'] || { count: 0, ratio: 0 }
  return (
    <div className="audit-strip">
      <AuditItem label="角色标注" value={metrics.n_role_annotations?.toLocaleString()} note="主要角色块解析" />
      <AuditItem label="训练实例" value={metrics.n_train_instances?.toLocaleString()} note="有对白/出场" />
      <AuditItem label="推断实例" value={metrics.n_inferred_instances?.toLocaleString()} note="未标注出场角色" />
      <AuditItem label="低置信待核" value={low.count?.toLocaleString()} note={`${((low.ratio || 0) * 100).toFixed(1)}% of inferred`} warn />
    </div>
  )
}

function AuditItem({ label, value, note, warn }) {
  return (
    <div className={`audit-item${warn ? ' warn' : ''}`}>
      <div className="audit-v">{value || '—'}</div>
      <div className="audit-l">{label}</div>
      <div className="audit-n">{note}</div>
    </div>
  )
}

function SubroleCaption({ sr }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, marginTop: 4 }}>
      {['生', '旦', '净', '丑'].map((b) => {
        const c = sr.by_class[b]
        return (
          <span key={b} style={{ marginRight: 12 }}>
            <span className={`role-tag role-${b}`}>{b}</span>{' '}
            {c.modeled
              ? <>细分 CV-F1 <b style={{ color: 'var(--gold)' }}>{c.cv_macro_f1}</b></>
              : <span title={c.note}>标注稀疏·未建模</span>}
          </span>
        )
      })}
    </div>
  )
}

function TemporalSig({ sig }) {
  const p = sig.pvalue < 0.001 ? sig.pvalue.toExponential(1) : sig.pvalue.toFixed(3)
  return (
    <div className="sig-note">
      <span className={'sig-badge ' + (sig.significant ? 'on' : '')}>
        {sig.significant ? '统计显著' : '不显著'}
      </span>
      时期 × 行当 χ²={sig.chi2}（dof={sig.dof}）· p={p} ·
      Cramér's V=<b>{sig.cramers_v}</b>（{sig.effect}效应，n={sig.n.toLocaleString()}）
      <span className="sig-read">
        — 占比变化{sig.significant ? '统计上确实存在' : '未达显著'}，但效应量{sig.effect}，说明行当结构跨时期总体稳定、仅有细微迁移。
      </span>
    </div>
  )
}

function TopWords({ tw }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.9, marginTop: 6 }}>
      {['生', '旦', '净', '丑'].map((r) => (
        <div key={r}>
          <span className={`role-tag role-${r}`}>{r}</span>{' '}
          {(tw[r] || []).slice(0, 8).join('、')}
        </div>
      ))}
    </div>
  )
}

function LowConfidenceList({ items, total, onSelect }) {
  return (
    <div className="audit-list">
      <div className="audit-list-head">低置信待核样本 {total ? `· 共 ${total} 个` : ''}</div>
      {(items || []).slice(0, 5).map((r, i) => (
        <button className="audit-sample" key={`${r.play_id}-${r.name}-${i}`}
          onClick={() => onSelect(r.play_id, r.title)}>
          <span>《{r.title}》· {r.name}</span>
          <b>{r.pred} {r.confidence}</b>
        </button>
      ))}
    </div>
  )
}

function PlayDetail({ d }) {
  return (
    <div>
      <div className="detail-head">
        <span className="title">《{d.title}》</span>
        <span className="meta">{d.collection} · {d.period} · {d.n_scenes} 场 · {d.roles.length} 角色</span>
      </div>
      <div className="meta" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{d.source}</div>
      <div className="plot-box">{d.plot || '（无情节摘要）'}</div>
      <div className="grid" style={{ marginTop: 10 }}>
        <div>
          <ReactECharts theme="opera-dark" option={playRolesOption(d.roles)} style={{ height: 300 }} />
          <div className="legend">
            <span><i style={{ background: '#888' }} />实心=标注</span>
            <span><i style={{ background: 'var(--muted)', opacity: 0.5, border: '1px dashed var(--gold)' }} />虚框=推断</span>
            <span>点大小∝台词量</span>
          </div>
        </div>
        <div className="scroll" style={{ maxHeight: 340 }}>
          <table className="plays">
            <thead><tr><th>角色</th><th>行当</th><th>置信</th><th>细分行当</th><th>台词</th><th>唱/念/白</th></tr></thead>
            <tbody>
              {d.roles.map((r, i) => (
                <tr key={i} className={r.needs_review ? 'needs-review' : ''}>
                  <td>{r.name}</td>
                  <td>
                    <span className={`role-tag role-${r.final_role}`}>{r.final_role}</span>
                    {r.is_inferred && <span className="inferred-badge">推 {r.confidence}</span>}
                    {r.needs_review && <span className="review-badge">待核</span>}
                  </td>
                  <td>{r.is_inferred ? (r.confidence_band || '—') : '标注'}</td>
                  <td>
                    {r.sub_final
                      ? <>{r.sub_final}{r.sub_is_inferred &&
                          <span className="inferred-badge">推 {r.sub_confidence}</span>}</>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>{r.n_lines}</td>
                  <td>{r.ratio_chang}/{r.ratio_nian}/{r.ratio_bai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
