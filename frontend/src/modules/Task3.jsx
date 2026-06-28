import React, { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import ErrorState from '../components/ErrorState'
import { api, TOPIC_COLORS } from '../api'
import { Card, ModuleHead } from './Task1'
import {
  topicShareOption, cooccurOption, typeTopicOption, archetypeOption, playTopicsOption,
  kSelectionOption, topicMapOption, periodTrendOption, topicStabilityOption,
} from '../charts3'

export default function Task3({ selected, onSelect, filter }) {
  const dramaType = filter?.dramaType || ''
  const [topics, setTopics] = useState(null)
  const [pat, setPat] = useState(null)
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState('')
  const [plays, setPlays] = useState({ plays: [], total: 0 })
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [view, setView] = useState('type') // type | period
  const [tsel, setTsel] = useState(0)      // 主题分布图选中的主题
  const [err, setErr] = useState(null)

  const loadAll = () => {
    setErr(null)
    Promise.all([
      api.topics().then(setTopics),
      api.topicPatterns().then(setPat),
    ]).catch((e) => setErr(e.message))
  }
  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    api.topicPlays({ q, topic, drama_type: dramaType, limit: 250 }).then((d) => {
      setPlays(d)
      if (!selected?.play_id) {
        if (d.plays.length) load(d.plays[0].play_id)
        else { setSel(null); setDetail(null) }
      }
    }).catch((e) => setErr(e.message))
  }, [q, topic, dramaType])

  useEffect(() => { if (selected?.play_id) load(selected.play_id) }, [selected?.play_id])

  const load = (id) => { setSel(id); api.topicPlay(id).then(setDetail) }
  const pick = (id, title) => onSelect({ play_id: id, title })

  // 全库图表记忆化：选剧/检索/切视图时只重算受影响的图，其余直接复用（卡顿源）
  const shareOpt = useMemo(() => (topics ? topicShareOption(topics.topics) : null), [topics])
  const topicMapOpt = useMemo(() => (topics ? topicMapOption(topics.topics) : null), [topics])
  const kSelOpt = useMemo(() => (topics?.k_selection?.length ? kSelectionOption(topics.k_selection, topics.K) : null), [topics])
  const stabilityOpt = useMemo(() => (topics?.stability ? topicStabilityOption(topics.stability) : null), [topics])
  const cooccurOpt = useMemo(() => (pat ? cooccurOption(pat.cooccurrence, pat.topic_labels) : null), [pat])
  const archetypeOpt = useMemo(() => (pat ? archetypeOption(pat.archetypes, pat.topic_labels) : null), [pat])
  const typeTopicOpt = useMemo(() => (pat ? typeTopicOption(view === 'type' ? pat.by_drama_type : pat.by_period, pat.topic_labels) : null), [pat, view])
  const periodTrendOpt = useMemo(() => (pat?.period_trends ? periodTrendOption(pat.period_trends, pat.period_order) : null), [pat])

  if (err) return <ErrorState message={err} onRetry={loadAll} />
  if (!topics || !pat) return <div className="loading">载入中…</div>
  const labels = pat.topic_labels

  return (
    <div>
      <ModuleHead title="任务三 · 主题提取与比较"
        desc={`对情节摘要做 LDA 主题建模（按"故事"计频剔除人名/道具等实体），数据驱动选出 ${topics.K} 个核心主题；分析各剧主题构成、主题共现组合模式，并跨剧目类型与时期比较主题表达的共性与差异。`} />

      <div className="grid">
        <Card title="核心主题 · 全局占比"
          hint={`${topics.K} 个主题及其在全库的平均占比（悬停看主题关键词）。征战/复仇/婚姻家庭/公案断狱等母题清晰可分。`}>
          <ReactECharts theme="opera-dark" option={shareOpt} className="echart tall" />
        </Card>
        <Card title="主题关键词"
          hint="每个主题的高权重词——数据驱动的主题语义。">
          <div className="topic-words scroll" style={{ maxHeight: 380 }}>
            {topics.topics.map((t) => (
              <div key={t.id} className="topic-row">
                <span className="topic-chip" style={{ background: TOPIC_COLORS[t.id % 12] }}>T{t.id}</span>
                <span className="topic-kw">{t.top_words.slice(0, 8).map((w) => w.word).join(' · ')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {topics.topics[0]?.x != null && (
        <div className="grid-3">
          <Card span={2} title="主题分布图 · 语义距离"
            hint="主题词分布的 JS 距离经 MDS 降到二维：邻近气泡=语义相近的母题，气泡大小∝全局占比，颜色∝主题一致性（越绿越连贯）。点击气泡查看右侧关键词与代表剧目。">
            <ReactECharts theme="opera-dark" option={topicMapOpt} className="echart"
              onEvents={{ click: (p) => p.data?.id != null && setTsel(p.data.id) }} />
          </Card>
          <Card title={`T${tsel} ${labels[tsel]}`}
            hint={`一致性 ${topics.topics[tsel]?.coherence} · 占比 ${(topics.topics[tsel]?.share * 100).toFixed(1)}%`}>
            <div className="topic-kw" style={{ marginBottom: 10 }}>
              {topics.topics[tsel]?.top_words.slice(0, 10).map((w) => w.word).join(' · ')}
            </div>
            <div className="hint">代表剧目（主题权重最高）</div>
            <div className="scroll" style={{ maxHeight: 220 }}>
              <table className="plays">
                <tbody>
                  {(topics.topics[tsel]?.representative || []).map((r) => (
                    <tr key={r.play_id} onClick={() => pick(r.play_id, r.title)}>
                      <td>{r.title}</td><td>{r.drama_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {topics.k_selection?.length > 0 && (
        <Card title="主题数 K · 数据驱动选择"
          hint={`对 K=5…15 逐一拟合 LDA：困惑度（越低越好）随 K 单调上升，u_mass 一致性在 K=${topics.K} 取得最优后回落——故按"一致性退化前最细的母题划分"取 K=${topics.K}，兼顾可解释性与连贯性（不再硬选粒度）。`}>
          <ReactECharts theme="opera-dark" option={kSelOpt} className="echart" />
        </Card>
      )}

      {topics.stability && (
        <Card title="主题稳健性 · NMF / 多 seed 对照"
          hint={`将 LDA 主题与完全不同的 NMF 方法、以及不同随机种子的 LDA 对齐（主题-词分布最优匹配余弦）：与 NMF 平均一致 ${topics.stability.nmf_mean_cosine}、多 seed LDA 平均一致 ${topics.stability.lda_seed_mean_cosine}。复仇、家庭杀戮、救援等核心母题在两种方法下高度复现（余弦 0.6–0.9），印证「10 母题」非单次随机产物；部分征战母题的细分边界存在方法依赖性（诚实声明）。`}>
          <ReactECharts theme="opera-dark" option={stabilityOpt} className="echart" />
        </Card>
      )}

      <div className="grid">
        <Card title="主题共现 · 组合模式"
          hint="主题两两在同一剧目共同出现的提升度 lift（观测共享权重÷随机独立期望，颜色越深=相对越常同台）。京剧剧目高度单主题化，整体 lift 低于随机基线，故呈现的是相对最强的母题组合（如杀戮×复仇、救援×洞房）。">
          <ReactECharts theme="opera-dark" option={cooccurOpt} className="echart tall" />
        </Card>
        <Card title="原型主题组合 · 剧目聚类"
          hint="按主题向量聚类得到的代表性主题组合原型（堆叠=平均主题构成，括号内为剧目数）。">
          <ReactECharts theme="opera-dark" option={archetypeOpt} className="echart tall" />
        </Card>
      </div>

      <Card title={`跨${view === 'type' ? '剧目类型' : '历史时期'} · 主题分布比较`}
        hint="不同剧目类型/时期的平均主题权重——主题表达的共性与差异。">
        <div className="filters" style={{ marginBottom: 8 }}>
          <button className={'seg' + (view === 'type' ? ' on' : '')} onClick={() => setView('type')}>按剧目类型</button>
          <button className={'seg' + (view === 'period' ? ' on' : '')} onClick={() => setView('period')}>按历史时期</button>
        </div>
        <ReactECharts theme="opera-dark" option={typeTopicOpt} className="echart" notMerge />
      </Card>

      {pat.period_trends && (
        <Card title="主题随时代变迁 · 母题兴衰"
          hint={`逐主题在『${pat.period_order.join('→')}』三个时期的平均占比变化（Kruskal–Wallis 组间检验 + BH-FDR 校正）。征战类母题（攻打/出战、进京/镇守）随时代下降，家庭伦理母题（妻子/投江/夫妻、母女/父子）上升——京剧题材呈现由『武戏征战』向『家庭伦理』的迁移。红=上升 · 青=下降 · 灰=平稳；加粗端标=显著且变化明显的母题。`}>
          <ReactECharts theme="opera-dark" option={periodTrendOpt} className="echart" notMerge />
        </Card>
      )}

      <div className="grid-3">
        <Card title="剧目检索">
          <div className="filters">
            <input placeholder="剧名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="filters">
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">全部主导主题</option>
              {labels.map((l, k) => <option key={k} value={k}>T{k} {l}</option>)}
            </select>
          </div>
          <div className="hint">共 {plays.total} 部 · 按主导主题强度排序</div>
          {plays.plays.length === 0
            ? <div className="empty-hint">没有符合条件的剧目</div>
            : <div className="scroll">
            <table className="plays">
              <thead><tr><th>剧目</th><th>主导主题</th><th>强度</th></tr></thead>
              <tbody>
                {plays.plays.map((p) => (
                  <tr key={p.play_id} className={sel === p.play_id ? 'active' : ''} onClick={() => pick(p.play_id, p.title)}>
                    <td>{p.title}</td>
                    <td><span className="topic-chip" style={{ background: TOPIC_COLORS[p.dominant % 12] }}>T{p.dominant}</span> {labels[p.dominant]}</td>
                    <td>{p.strength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {detail ? <TopicDetail d={detail} labels={labels} onPick={pick} /> : <div className="loading">选择左侧剧目查看主题构成</div>}
        </div>
      </div>
    </div>
  )
}

function TopicDetail({ d, labels, onPick }) {
  return (
    <div>
      <div className="detail-head">
        <span className="title">《{d.title}》</span>
        <span className="meta">{d.drama_type} · {d.period}</span>
      </div>
      <div className="plot-box" style={{ maxHeight: 80 }}>{d.plot}</div>
      <div className="grid" style={{ marginTop: 10 }}>
        <div>
          <div className="hint">主题构成</div>
          <ReactECharts theme="opera-dark" option={playTopicsOption(d.topics, labels)} style={{ height: 270 }} />
        </div>
        <div>
          <div className="hint">主题最相近的剧目（主题向量余弦）</div>
          <div className="scroll" style={{ maxHeight: 270 }}>
            <table className="plays">
              <thead><tr><th>剧目</th><th>主导主题</th><th>相似度</th></tr></thead>
              <tbody>
                {d.similar.map((s) => (
                  <tr key={s.play_id} onClick={() => onPick(s.play_id)}>
                    <td>{s.title}</td>
                    <td><span className="topic-chip" style={{ background: TOPIC_COLORS[s.dominant % 12] }}>T{s.dominant}</span> {labels[s.dominant]}</td>
                    <td>{s.sim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
