import { TOPIC_COLORS } from './api'
import { PANEL, VERMILION_LIT, TEAL, MAIZE, MUTED, SILK, SEQ_RAMP } from './theme'

const tname = (labels, k) => `T${k} ${labels[k]}`

// ① 主题全局占比（横向条 + top 词在 tooltip）
export function topicShareOption(topics) {
  const sorted = [...topics].sort((a, b) => a.share - b.share)
  return {
    tooltip: {
      formatter: (p) => {
        const t = sorted[p.dataIndex]
        return `<b>T${t.id} ${t.label}</b><br/>占比 ${(t.share * 100).toFixed(1)}%<br/>` +
          t.top_words.slice(0, 10).map((w) => w.word).join(' ')
      },
    },
    grid: { left: 150, right: 40, top: 8, bottom: 16 },
    xAxis: { type: 'value', name: '全局占比', axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    yAxis: { type: 'category', data: sorted.map((t) => `T${t.id} ${t.label}`),
      axisLabel: { fontFamily: 'serif', fontSize: 11 } },
    series: [{
      type: 'bar', data: sorted.map((t, i) => ({ value: t.share,
        itemStyle: { color: TOPIC_COLORS[t.id % 12], borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', formatter: (p) => (p.value * 100).toFixed(1) + '%', fontSize: 11 },
    }],
  }
}

// ② 主题共现矩阵（组合模式）热力图
export function cooccurOption(cooc, labels) {
  const K = cooc.length
  const data = []
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) data.push([j, i, cooc[i][j]])
  const vals = data.map((d) => d[2]).filter((v) => v > 0)
  // 数值集中在窄带（软共现 lift），故 visualMap 取实际 min/max 拉开对比度
  const vmin = vals.length ? Math.min(...vals) : 0
  const vmax = vals.length ? Math.max(...vals) : 1
  return {
    tooltip: { formatter: (p) => p.value[2] > 0
      ? `${tname(labels, p.value[1])} × ${tname(labels, p.value[0])}<br/>共现 lift ${p.value[2]}（${p.value[2] >= 1 ? '高于' : '低于'}随机）`
      : `${tname(labels, p.value[1])}（对角线）` },
    grid: { left: 110, right: 16, top: 16, bottom: 96 },
    xAxis: { type: 'category', data: labels.map((l, k) => `T${k}`), axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'category', data: labels.map((l, k) => `T${k} ${l}`),
      axisLabel: { fontFamily: 'serif', fontSize: 10 } },
    visualMap: { min: vmin, max: vmax, calculable: true, precision: 2,
      orient: 'horizontal', left: 'center', bottom: 8,
      inRange: { color: SEQ_RAMP } },
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: PANEL, borderWidth: 1 } }],
  }
}

// ③ 剧目类型 × 主题 热力（跨类型主题比较）
export function typeTopicOption(byType, labels) {
  const types = Object.keys(byType)
  const K = labels.length
  const data = []
  types.forEach((t, ti) => byType[t].forEach((v, k) => data.push([k, ti, +(v).toFixed(3)])))
  const vals = data.map((d) => d[2])
  return {
    tooltip: { formatter: (p) => `${types[p.value[1]]} · ${tname(labels, p.value[0])}<br/>平均权重 ${p.value[2]}` },
    grid: { left: 70, right: 16, top: 16, bottom: 60 },
    xAxis: { type: 'category', data: labels.map((l, k) => `T${k}`), axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'category', data: types, axisLabel: { fontFamily: 'serif', fontSize: 13 } },
    visualMap: { min: 0, max: Math.max(...vals), calculable: true,
      orient: 'horizontal', left: 'center', bottom: 8,
      inRange: { color: SEQ_RAMP } },
    series: [{ type: 'heatmap', data,
      label: { show: true, formatter: (p) => (p.value[2] * 100).toFixed(0), fontSize: 9, color: SILK },
      itemStyle: { borderColor: PANEL, borderWidth: 1 } }],
  }
}

// ④ 原型主题组合：堆叠条（每个原型的平均主题构成）
export function archetypeOption(archetypes, labels) {
  const K = labels.length
  const cats = archetypes.map((a) => `C${a.id} (${a.size})`)
  const series = []
  for (let k = 0; k < K; k++) {
    series.push({
      name: `T${k} ${labels[k]}`, type: 'bar', stack: 'a',
      itemStyle: { color: TOPIC_COLORS[k % 12] },
      emphasis: { focus: 'series' },
      data: archetypes.map((a) => +(a.mean_topics[k]).toFixed(3)),
    })
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps) => ps[0].name + '<br/>' + ps.filter((p) => p.value > 0.04)
        .sort((a, b) => b.value - a.value).map((p) => `${p.seriesName}: ${(p.value * 100).toFixed(0)}%`).join('<br/>') },
    grid: { left: 70, right: 16, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 1, axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    yAxis: { type: 'category', data: cats, axisLabel: { fontFamily: 'serif' } },
    series,
  }
}

// ⑤ 主题数 K 选择曲线：困惑度（↓越好）+ u_mass 一致性（↑越连贯）双轴，标注采用的 K
export function kSelectionOption(kSel, chosenK) {
  const ks = kSel.map((d) => d.k)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['困惑度', '一致性'], top: 4, textStyle: { fontSize: 11 } },
    grid: { left: 52, right: 56, top: 48, bottom: 28 },
    xAxis: { type: 'category', data: ks, name: 'K', nameLocation: 'middle', nameGap: 22 },
    yAxis: [
      { type: 'value', name: '困惑度', scale: true, axisLabel: { fontSize: 10 } },
      { type: 'value', name: '一致性', axisLabel: { fontSize: 10 } },
    ],
    series: [
      { name: '困惑度', type: 'line', smooth: true, symbolSize: 6,
        data: kSel.map((d) => d.perplexity),
        lineStyle: { color: VERMILION_LIT }, itemStyle: { color: VERMILION_LIT },
        markLine: chosenK ? { silent: true, symbol: 'none',
          lineStyle: { color: MAIZE, type: 'dashed' },
          label: { position: 'insideEndTop', distance: 6 },
          data: [{ xAxis: String(chosenK), label: { formatter: `采用 K=${chosenK}`, color: MAIZE, fontSize: 10 } }] } : undefined },
      { name: '一致性', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6,
        data: kSel.map((d) => d.coherence),
        lineStyle: { color: TEAL }, itemStyle: { color: TEAL } },
    ],
  }
}

// ⑥ 主题分布图：JS 距离 + MDS 二维坐标，气泡大小∝全局占比、色∝主题一致性
// 邻近气泡=语义相近的母题；点击气泡联动右侧关键词与代表剧目。
export function topicMapOption(topics) {
  const cohs = topics.map((t) => t.coherence)
  // 按数据范围留出内边距：散点轴 scale 会紧贴极值，使边缘的大气泡被裁切
  const pad = (vals) => {
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const m = ((hi - lo) || 1) * 0.26
    return [lo - m, hi + m]
  }
  const [xMin, xMax] = pad(topics.map((t) => t.x))
  const [yMin, yMax] = pad(topics.map((t) => t.y))
  return {
    tooltip: {
      formatter: (p) => {
        const t = topics[p.dataIndex]
        return `<b>T${t.id} ${t.label}</b><br/>占比 ${(t.share * 100).toFixed(1)}%` +
          `<br/>一致性 ${t.coherence}<br/>${t.top_words.slice(0, 8).map((w) => w.word).join(' ')}`
      },
    },
    grid: { left: 24, right: 24, top: 16, bottom: 56 },
    xAxis: { type: 'value', min: xMin, max: xMax, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: { type: 'value', min: yMin, max: yMax, splitLine: { show: false }, axisLabel: { show: false } },
    visualMap: {
      min: Math.min(...cohs), max: Math.max(...cohs), dimension: 2, calculable: true,
      orient: 'horizontal', left: 'center', bottom: 6, itemHeight: 80,
      text: ['更连贯', '更杂'], textStyle: { fontSize: 10 },
      inRange: { color: [VERMILION_LIT, MAIZE, TEAL] },
    },
    series: [{
      type: 'scatter', symbolSize: (v) => 18 + Math.sqrt(v[3]) * 130,
      data: topics.map((t) => ({ value: [t.x, t.y, t.coherence, t.share], id: t.id })),
      label: { show: true, formatter: (p) => `T${topics[p.dataIndex].id}`,
        fontFamily: 'serif', fontSize: 12, color: SILK, fontWeight: 'bold' },
      itemStyle: { opacity: 0.9, borderColor: 'rgba(14,11,12,0.6)', borderWidth: 1 },
      emphasis: { scale: 1.15, focus: 'self' },
    }],
  }
}

// ⑦ 主题随时期演化：逐主题三时期占比折线（红=上升 / 青=下降 / 灰=平稳）。
// 显著且变化明显(|Δ|≥3%)的母题加粗+端标，其余淡化——直观呈现母题兴衰。
export function periodTrendOption(trends, periodOrder) {
  const COL = { 上升: VERMILION_LIT, 下降: TEAL, 平稳: MUTED }
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const t = trends[p.seriesIndex]
        return `<b>T${t.id} ${t.label}</b><br/>` +
          periodOrder.map((pp, i) => `${pp}: ${(t.shares[i] * 100).toFixed(1)}%`).join('<br/>') +
          `<br/>Δ=${(t.delta * 100).toFixed(1)}% · ${t.direction}` +
          (t.significant ? ' · 显著' : ' · ns')
      },
    },
    grid: { left: 48, right: 128, top: 14, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false, data: periodOrder,
      axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    yAxis: { type: 'value', name: '平均主题占比',
      axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    series: trends.map((t) => {
      const notable = t.significant && Math.abs(t.delta) >= 0.03
      const col = COL[t.direction]
      return {
        name: `T${t.id}`, type: 'line', symbol: 'circle',
        symbolSize: notable ? 7 : 4, data: t.shares,
        lineStyle: { width: notable ? 3 : 1.4, color: col, opacity: notable ? 1 : 0.26 },
        itemStyle: { color: col, opacity: notable ? 1 : 0.3 },
        endLabel: { show: notable, formatter: t.label, fontFamily: 'serif',
          fontSize: 10, color: col },
        emphasis: { focus: 'series' },
      }
    }),
  }
}

// ⑧ 主题稳健性：逐母题与 NMF / 多 seed LDA 的最优匹配余弦（越高=越可复现）。
export function topicStabilityOption(stability) {
  const pt = stability.per_topic
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v) => (+v).toFixed(2) },
    legend: { top: 0, data: ['NMF 复现', '多 seed LDA 复现'], textStyle: { fontSize: 11 } },
    grid: { left: 132, right: 24, top: 30, bottom: 18 },
    xAxis: { type: 'value', max: 1, name: '匹配余弦', axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: pt.map((t) => `T${t.id} ${t.label}`),
      axisLabel: { fontFamily: 'serif', fontSize: 10 } },
    series: [
      { name: 'NMF 复现', type: 'bar', data: pt.map((t) => t.nmf_cosine),
        itemStyle: { color: TEAL, borderRadius: [0, 3, 3, 0] } },
      { name: '多 seed LDA 复现', type: 'bar', data: pt.map((t) => t.lda_seed_cosine),
        itemStyle: { color: MAIZE, borderRadius: [0, 3, 3, 0] } },
    ],
  }
}

// 单剧主题构成（饼）
export function playTopicsOption(vec, labels) {
  const data = vec.map((v, k) => ({ value: +(v).toFixed(3), name: `T${k} ${labels[k]}`,
    itemStyle: { color: TOPIC_COLORS[k % 12] } }))
    .filter((d) => d.value > 0.03).sort((a, b) => b.value - a.value)
  return {
    tooltip: { formatter: (p) => `${p.name}<br/>${(p.value * 100).toFixed(1)}%` },
    series: [{
      type: 'pie', radius: ['38%', '70%'], center: ['50%', '50%'],
      label: { fontFamily: 'serif', fontSize: 11, formatter: (p) => `${p.name.split(' ')[0]} ${(p.value * 100).toFixed(0)}%` },
      data,
    }],
  }
}
