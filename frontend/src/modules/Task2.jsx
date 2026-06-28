import React, { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import ErrorState from '../components/ErrorState'
import { api } from '../api'
import { Card, ModuleHead } from './Task1'
import {
  typeBarOption, typeRadarOption, netScatterOption, networkGraphOption,
  nullModelZOption, roleStructureOption, assortativityOption, pairwiseSigOption,
  netPeriodEvoOption, TYPE_COLORS,
} from '../charts2'

export default function Task2({ selected, onSelect, filter, onFilter }) {
  const [typestats, setTypestats] = useState(null)
  const [scatter, setScatter] = useState(null)
  const dramaType = filter?.dramaType || ''           // 全局跨图筛选（剧目类型）
  const setDramaType = (v) => onFilter?.({ dramaType: v })
  const [q, setQ] = useState('')
  const [plays, setPlays] = useState({ plays: [], total: 0 })
  const [sel, setSel] = useState(null)
  const [net, setNet] = useState(null)
  const [sigMetric, setSigMetric] = useState('模块度')
  const [err, setErr] = useState(null)

  const loadAll = () => {
    setErr(null)
    Promise.all([
      api.typestats().then(setTypestats),
      api.netScatter().then(setScatter),
    ]).catch((e) => setErr(e.message))
  }
  useEffect(() => { loadAll() }, [])

  const load = (id) => { setSel(id); api.network(id).then(setNet) }
  const choose = (id, title) => onSelect({ play_id: id, title })

  useEffect(() => {
    api.netPlays({ drama_type: dramaType, q, sort: 'n_nodes', limit: 250 }).then((d) => {
      setPlays(d)
      if (!selected?.play_id) {
        if (d.plays.length) load(d.plays[0].play_id)
        else { setSel(null); setNet(null) }
      }
    }).catch((e) => setErr(e.message))
  }, [dramaType, q])

  useEffect(() => { if (selected?.play_id) load(selected.play_id) }, [selected?.play_id])

  // 全库图表记忆化：选剧/检索时不再重算这些与单剧无关的大图（卡顿源）
  const typeBarOpt = useMemo(() => (typestats ? typeBarOption(typestats) : null), [typestats])
  const typeRadarOpt = useMemo(() => (typestats ? typeRadarOption(typestats) : null), [typestats])
  const nullZOpt = useMemo(() => (typestats ? nullModelZOption(typestats) : null), [typestats])
  const roleStructOpt = useMemo(() => (typestats?.role_structure ? roleStructureOption(typestats.role_structure) : null), [typestats])
  const assortOpt = useMemo(() => (typestats?.assortativity_by_type ? assortativityOption(typestats.assortativity_by_type) : null), [typestats])
  const sigOpt = useMemo(() => (typestats?.type_significance ? pairwiseSigOption(typestats.type_significance, sigMetric) : null), [typestats, sigMetric])
  const periodEvoOpt = useMemo(() => (typestats?.period_evolution ? netPeriodEvoOption(typestats.period_evolution) : null), [typestats])
  const scatterOpt = useMemo(() => (scatter ? netScatterOption(scatter.points, dramaType) : null), [scatter, dramaType])

  if (err) return <ErrorState message={err} onRetry={loadAll} />
  if (!typestats || !scatter) return <div className="loading">载入中…</div>
  const types = typestats.types.filter((t) => typestats.by_type[t])

  return (
    <div>
      <ModuleHead title="任务二 · 角色关系网络"
        desc="以同场共现 + 对话邻接构建角色互动网络，对比历史戏 / 家庭戏 / 公案戏等不同剧目类型的网络结构特征（规模、密度、中心势、模块度）。" />

      <div className="grid">
        <Card title="剧目类型 · 结构指标对比"
          hint="各类型网络平均指标（按各指标最大值归一）。公案戏规模最大、历史戏模块度最高（敌我阵营）、家庭戏最紧密。点击柱可设为全局类型筛选，五任务全库视图联动。">
          <ReactECharts theme="opera-dark" option={typeBarOpt} className="echart"
            onEvents={{ click: (p) => p.seriesName && setDramaType(
              dramaType === p.seriesName ? '' : p.seriesName) }} />
        </Card>
        <Card title="剧目类型 · 结构雷达"
          hint="真实均值的多维画像，直观比较各类型网络形态差异。">
          <ReactECharts theme="opera-dark" option={typeRadarOpt} className="echart" />
        </Card>
      </div>

      {typestats.by_type[types[0]]?.mean.modularity_z != null && (
        <Card title="结构显著性 · 对随机零模型的 z-score"
          hint="将每部剧的中心势/模块度与 20 个同规模 ER 随机图比较得到 z-score（z>2 即显著高于随机）。各类型模块度/中心势均显著高于随机——网络的阵营划分与核心结构并非偶然，其中历史戏模块度 z 最高（阵营对立最强）。">
          <ReactECharts theme="opera-dark" option={nullZOpt} className="echart" />
        </Card>
      )}

      {typestats.role_structure && (
        <Card title="结构角色 · 哪个行当占据中心 / 桥接位"
          hint="左图：每个行当在全库网络中的平均「度中心性（连接广度）×介数中心性（桥接位）」，气泡大小∝样本角色数——生行连接最广且最常居桥接主座（约半数剧目），是剧情组织者；净行次之；杂行最外围。右图：各剧目类型的行当同配系数（role assortativity）——均为负值，说明京剧人物网络按行当『互补异配』（生旦净丑交错搭戏），社群并非同行当抱团，与『敌我阵营』而非『行当阵营』对应。">
          <div className="grid">
            <ReactECharts theme="opera-dark" option={roleStructOpt} className="echart" />
            <ReactECharts theme="opera-dark" option={assortOpt} className="echart" />
          </div>
        </Card>
      )}

      {typestats.type_significance && (
        <Card title="类型差异显著性 · 两两检验"
          hint="将各剧目类型在所选指标上做两两 Mann–Whitney U 检验（BH-FDR 校正）。读作「行类型 vs 列类型」：▲=行显著更高、▼=显著更低、·=差异不显著。这把『历史戏模块度最高』『公案戏规模最大』等说法升级为带 p 的统计判断——例如历史戏模块度显著高于家庭戏，但与公案戏差异未达显著。">
          <div className="filters" style={{ marginBottom: 6 }}>
            {typestats.type_significance.metrics.map((mname) => (
              <button key={mname} className={'seg' + (sigMetric === mname ? ' on' : '')}
                onClick={() => setSigMetric(mname)}>{mname}</button>
            ))}
          </div>
          <ReactECharts theme="opera-dark" notMerge
            option={sigOpt} className="echart" />
        </Card>
      )}

      {typestats.period_evolution && (
        <Card title="网络结构 · 时期演化"
          hint="各网络指标随历史时期（清末民国→建国初期→当代）的均值变化，按各指标自身最大值归一以同图比较；图例带 * 者经 Kruskal–Wallis 检验显著（BH-FDR）。网络规模随时代显著增大（均 10.8→15.4→18.3 角色），人物体系趋于庞大复杂；模块度/中心势在建国初期达峰。">
          <ReactECharts theme="opera-dark" notMerge
            option={periodEvoOpt} className="echart" />
        </Card>
      )}

      <Card title="全库网络分布 · 规模 × 中心势"
        hint="每点一部剧，横轴网络规模、纵轴中心势，按剧目类型着色。右上=大而强核心（多见公案/历史戏）。">
        <ReactECharts theme="opera-dark" option={scatterOpt} className="echart"
          onEvents={{ click: (p) => p?.data?.play_id && choose(p.data.play_id, p.data.title) }} />
        <div className="type-stats">
          {types.map((t) => {
            const s = typestats.by_type[t]
            return (
              <div key={t} className="type-stat">
                <span className="type-dot" style={{ background: TYPE_COLORS[t] }} />
                <b>{t}</b> {s.count}部 · 角色{s.mean.n_nodes} · 密度{s.mean.density} ·
                中心势{s.mean.centralization} · 模块度{s.mean.modularity}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid-3">
        <Card title="剧目检索">
          <div className="filters">
            <input placeholder="剧名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="filters">
            <select value={dramaType} onChange={(e) => setDramaType(e.target.value)}>
              <option value="">全部类型</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="hint">共 {plays.total} 部 · 按角色数排序 · 点击查看网络</div>
          {plays.plays.length === 0
            ? <div className="empty-hint">没有符合条件的剧目</div>
            : <div className="scroll">
            <table className="plays">
              <thead><tr><th>剧目</th><th>类型</th><th>角色</th><th>关系</th></tr></thead>
              <tbody>
                {plays.plays.map((p) => (
                  <tr key={p.play_id} className={sel === p.play_id ? 'active' : ''}
                    onClick={() => choose(p.play_id, p.title)}>
                    <td>{p.title}</td>
                    <td><span className="type-pill" style={{ background: TYPE_COLORS[p.drama_type] }}>{p.drama_type}</span></td>
                    <td>{p.n_nodes}</td><td>{p.n_edges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </Card>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {net ? <NetDetail net={net} /> : <div className="loading">选择左侧剧目查看角色关系网络</div>}
        </div>
      </div>
    </div>
  )
}

function NetDetail({ net }) {
  const m = net.metrics
  const [colorBy, setColorBy] = useState('role')
  return (
    <div>
      <div className="detail-head">
        <span className="title">《{net.title}》</span>
        <span className="type-pill" style={{ background: TYPE_COLORS[net.drama_type] }}>{net.drama_type}</span>
        <span className="meta">{net.collection}</span>
      </div>
      <div className="net-metrics">
        <Mini lab="角色" v={m.n_nodes} /><Mini lab="关系" v={m.n_edges} />
        <Mini lab="密度" v={m.density} /><Mini lab="聚类系数" v={m.avg_clustering} />
        <Mini lab="中心势" v={m.centralization} /><Mini lab="模块度" v={m.modularity} />
        <Mini lab="社群数" v={m.n_communities} /><Mini lab="核心角色" v={m.main_char} />
      </div>
      <div className="filters" style={{ marginTop: 6 }}>
        {[['role', '按行当着色'], ['community', '按社群着色']].map(([k, lab]) => (
          <button key={k} className={'seg' + (colorBy === k ? ' on' : '')}
            onClick={() => setColorBy(k)}>{lab}</button>
        ))}
      </div>
      <ReactECharts theme="opera-dark" notMerge
        option={networkGraphOption(net, net.role_colors, colorBy)} style={{ height: 440 }} />
      <div className="legend">
        <span>节点大小∝中心性</span><span>连线粗细∝互动强度</span>
        <span>颜色={colorBy === 'community' ? `社群（共 ${m.n_communities} 个，模块度 ${m.modularity}）` : '行当'}</span>
        <span>可拖拽 / 滚轮缩放</span>
      </div>
    </div>
  )
}

function Mini({ lab, v }) {
  return <div className="mini"><div className="mini-v">{v}</div><div className="mini-l">{lab}</div></div>
}
