import { ROLE_COLORS } from './api'
import { MUTED, SILK, SILK_DIM, PANEL, TEAL, AZURE, AMBER, CLAY, SEQ_RAMP } from './theme'

const ROLES = ['生', '旦', '净', '丑', '杂']

// 混淆矩阵（行=真实行当，列=预测行当；按行归一为召回视角）。对角线越深=召回越高，
// 非对角深格=系统性误判。配套 confusionPairs() 给出最易混淆的有序对。
export function confusionOption(cm, labels) {
  const rowSum = cm.map((r) => r.reduce((a, b) => a + b, 0) || 1)
  const data = []
  for (let i = 0; i < labels.length; i++) for (let j = 0; j < labels.length; j++) {
    data.push({ value: [j, i, +(cm[i][j] / rowSum[i]).toFixed(3)], count: cm[i][j] })
  }
  return {
    tooltip: {
      formatter: (p) => `真实 <b>${labels[p.value[1]]}</b> → 预测 <b>${labels[p.value[0]]}</b>` +
        `<br/>${p.data.count} 例 · 占该行当 ${(p.value[2] * 100).toFixed(1)}%`,
    },
    grid: { left: 56, right: 16, top: 28, bottom: 44 },
    xAxis: { type: 'category', data: labels, name: '预测', nameLocation: 'middle', nameGap: 26,
      axisLabel: { fontFamily: 'serif', fontSize: 14 }, splitArea: { show: true } },
    yAxis: { type: 'category', data: labels, name: '真实', inverse: true,
      axisLabel: { fontFamily: 'serif', fontSize: 14 }, splitArea: { show: true } },
    visualMap: { min: 0, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      inRange: { color: SEQ_RAMP } },
    series: [{
      type: 'heatmap', data,
      label: { show: true, fontSize: 11, color: SILK,
        formatter: (p) => p.value[2] < 0.02 ? '' : (p.value[2] * 100).toFixed(0) },
      itemStyle: { borderColor: PANEL, borderWidth: 1 },
    }],
  }
}

// 最易混淆的有序对（真→预测，按计数降序，排除对角线）。
export function confusionPairs(cm, labels, topN = 3) {
  const out = []
  for (let i = 0; i < labels.length; i++) for (let j = 0; j < labels.length; j++) {
    if (i !== j && cm[i][j] > 0) {
      const rs = cm[i].reduce((a, b) => a + b, 0) || 1
      out.push({ from: labels[i], to: labels[j], count: cm[i][j], ratio: cm[i][j] / rs })
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, topN)
}

// ① 行当分布：堆叠条（标注 vs 推断）
export function distOption(byRole) {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const d = params?.[0]?.data?.raw
        if (!d) return ''
        return `${d.role}<br/>已标注：${d.labeled}<br/>模型推断：${d.inferred}` +
          `<br/>低置信待核：${d.low_confidence || 0}<br/>合计：${d.total}`
      },
    },
    legend: { data: ['已标注', '模型推断'], top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 50, right: 20, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: byRole.map((d) => d.role),
      axisLabel: { fontSize: 16, fontFamily: 'serif' } },
    yAxis: { type: 'value', name: '角色数' },
    series: [
      { name: '已标注', type: 'bar', stack: 't',
        data: byRole.map((d) => ({ value: d.labeled, raw: d, itemStyle: { color: d.color } })) },
      { name: '模型推断', type: 'bar', stack: 't',
        data: byRole.map((d) => ({ value: d.inferred, raw: d,
          itemStyle: { color: d.color, opacity: 0.4, decal: { symbol: 'line', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 } } })) },
    ],
  }
}

// 模型审计：推断角色置信度分层
export function confidenceBandOption(metrics) {
  const bands = ['高', '中', '低']
  const colors = { 高: TEAL, 中: AMBER, 低: CLAY }
  const inf = metrics?.confidence_bands?.inferred || {}
  const total = inf.total || 0
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const d = p.data
        return `${d.name}置信：${d.value} 个<br/>占推断角色 ${d.ratio}%`
      },
    },
    grid: { left: 46, right: 18, top: 18, bottom: 28 },
    xAxis: { type: 'value', name: '推断角色数' },
    yAxis: { type: 'category', data: ['置信度'] },
    series: bands.map((b) => {
      const item = inf[b] || { count: 0, ratio: 0 }
      return {
        name: b, type: 'bar', stack: 'conf',
        barWidth: 34,
        data: [{ name: b, value: item.count, ratio: (item.ratio * 100).toFixed(1) }],
        itemStyle: { color: colors[b] },
        label: {
          show: true,
          formatter: () => total ? `${b} ${item.count}` : '',
          color: '#fff8ef',
          fontFamily: 'serif',
          fontWeight: 700,
        },
      }
    }),
  }
}

// 旭日：大类 -> 细分支
export function sunburstOption(data) {
  return {
    tooltip: { formatter: (p) => `${p.name}: ${p.value || ''}` },
    series: [{
      type: 'sunburst', data, radius: ['12%', '92%'],
      label: { fontFamily: 'serif', minAngle: 8 },
      levels: [{}, { r0: '12%', r: '48%', label: { fontSize: 15 } },
        { r0: '48%', r: '92%', label: { fontSize: 11 } }],
    }],
  }
}

// 细分行当两层旭日：内圈大类(脸谱色)，外圈细分支(含推断)。
// 入参 = task1_subroles.json 的 sunburst: [{name,modeled,children:[{name,value}]}]
export function subroleSunburstOption(sunburst) {
  const data = (sunburst || []).map((g) => {
    const base = ROLE_COLORS[g.name] || '#999'
    const total = (g.children || []).reduce((s, c) => s + c.value, 0)
    return {
      name: g.name, value: total,
      itemStyle: { color: base },
      label: { color: '#fff8ef', fontWeight: 700 },
      children: (g.children || []).map((c, i) => ({
        name: c.name, value: c.value,
        itemStyle: { color: base, opacity: 0.78 - (i % 4) * 0.13 },
      })),
    }
  })
  return {
    tooltip: {
      formatter: (p) => {
        const g = sunburst.find((x) => x.name === (p.treePathInfo?.[1]?.name || p.name))
        const tag = g && !g.modeled ? '（仅展示已标注·未建模）' : ''
        return `${p.name}: ${p.value || ''}${p.treePathInfo?.length > 2 ? ' 角色' : tag}`
      },
    },
    series: [{
      type: 'sunburst', data, radius: ['14%', '92%'],
      label: { fontFamily: 'serif', minAngle: 6 },
      levels: [{}, { r0: '14%', r: '46%', label: { fontSize: 16 } },
        { r0: '46%', r: '92%', label: { fontSize: 11, rotate: 'tangential' } }],
    }],
  }
}

// ② 特征-行当对应：雷达（表演型占比 + 结构）
export function profileRadarOption(profile, cols) {
  const indMap = {
    ratio_chang: '唱占比', ratio_nian: '念占比', ratio_bai: '白占比',
    n_lines: '台词量', degree: '共现度', kw_female: '女性名',
    kw_servant: '仆役名', is_group: '群演',
  }
  const inds = cols.map((c) => {
    const max = Math.max(...ROLES.filter((r) => profile[r]).map((r) => profile[r][c]))
    return { name: indMap[c] || c, max: max || 1 }
  })
  return {
    tooltip: {},
    legend: { data: ROLES.filter((r) => profile[r]), bottom: 0, textStyle: { fontFamily: 'serif' } },
    radar: { indicator: inds, radius: '62%', center: ['50%', '46%'],
      axisName: { fontFamily: 'serif', fontSize: 12, color: MUTED },
      splitLine: { lineStyle: { color: 'rgba(42,36,32,0.12)' } },
      splitArea: { areaStyle: { color: ['rgba(42,36,32,0.03)', 'transparent'] } },
      axisLine: { lineStyle: { color: 'rgba(42,36,32,0.18)' } } },
    series: [{
      type: 'radar',
      data: ROLES.filter((r) => profile[r]).map((r) => ({
        name: r, value: cols.map((c) => profile[r][c]),
        lineStyle: { color: ROLE_COLORS[r], width: 2 },
        itemStyle: { color: ROLE_COLORS[r] }, areaStyle: { opacity: 0.06 },
      })),
    }],
  }
}

// 表演类型占比热力图：行当 x {唱,念,白}
export function actHeatOption(profile) {
  const acts = ['唱占比', '念占比', '白占比']
  const keys = ['ratio_chang', 'ratio_nian', 'ratio_bai']
  const roles = ROLES.filter((r) => profile[r])
  const data = []
  roles.forEach((r, ri) => keys.forEach((k, ki) =>
    data.push([ki, ri, +(profile[r][k]).toFixed(3)])))
  const vals = data.map((d) => d[2])
  return {
    tooltip: { position: 'top', formatter: (p) => `${roles[p.value[1]]} · ${acts[p.value[0]]}: ${p.value[2]}` },
    grid: { left: 60, right: 16, top: 28, bottom: 28 },
    xAxis: { type: 'category', data: acts, axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'category', data: roles, axisLabel: { fontFamily: 'serif', fontSize: 15 } },
    visualMap: { min: Math.min(...vals), max: Math.max(...vals), calculable: true,
      orient: 'horizontal', left: 'center', bottom: -4,
      inRange: { color: SEQ_RAMP }, show: false },
    series: [{ type: 'heatmap', data,
      label: { show: true, formatter: (p) => p.value[2], fontFamily: 'serif', color: SILK },
      itemStyle: { borderColor: PANEL, borderWidth: 2 } }],
  }
}

// ③ 时期演化：堆叠面积（占比）
export function temporalOption(temporal) {
  const periods = temporal.period_order
  const series = ROLES.map((r) => ({
    name: r, type: 'line', stack: 'p', areaStyle: { opacity: 0.75 },
    emphasis: { focus: 'series' }, symbol: 'circle', symbolSize: 7,
    lineStyle: { width: 1 }, itemStyle: { color: ROLE_COLORS[r] },
    data: periods.map((p) => +((temporal.by_period[p].role_dist[r] || 0) * 100).toFixed(2)),
  }))
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params?.[0]?.axisValue
        const period = String(p).split('\n')[0]
        const n = temporal.by_period[period]?.n_roles || 0
        return `${period}（标注实例 n=${n}）<br/>` +
          params.map((x) => `${x.marker}${x.seriesName}: ${x.value}%`).join('<br/>')
      },
    },
    legend: { data: ROLES, top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 48, right: 20, top: 34, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false,
      data: periods.map((p) => `${p}\nn=${temporal.by_period[p]?.n_roles || 0}`),
      axisLabel: { fontFamily: 'serif', fontSize: 14 } },
    yAxis: { type: 'value', name: '占比%', max: 100 },
    series,
  }
}

// ④ 单剧角色：台词量 vs 表演风格散点（按行当着色，区分真实/推断）
export function playRolesOption(roles) {
  return {
    tooltip: {
      formatter: (p) => {
        const d = p.data
        return `${d.name}<br/>行当：${d.final_role}${d.is_inferred ? '（推断 ' + d.confidence + '）' : '（标注）'}` +
          `<br/>台词：${d.n_lines} 条<br/>唱/念/白：${d.ratio_chang}/${d.ratio_nian}/${d.ratio_bai}`
      },
    },
    grid: { left: 50, right: 24, top: 24, bottom: 44 },
    xAxis: { name: '唱占比', min: 0, max: 1, nameLocation: 'middle', nameGap: 26 },
    yAxis: { name: '台词条数', type: 'value' },
    series: [{
      type: 'scatter',
      symbolSize: (d) => 8 + Math.sqrt(d.n_lines) * 1.4,
      data: roles.map((r) => ({
        ...r, value: [r.ratio_chang, r.n_lines],
        itemStyle: {
          color: ROLE_COLORS[r.final_role] || '#999',
          opacity: r.is_inferred ? 0.55 : 0.95,
          borderColor: r.is_inferred ? AMBER : 'rgba(42,36,32,0.40)',
          borderType: r.is_inferred ? 'dashed' : 'solid', borderWidth: 1.5,
        },
      })),
      label: { show: true, formatter: (p) => p.data.name, position: 'right',
        fontSize: 10, fontFamily: 'serif', color: SILK_DIM },
    }],
  }
}

// 模型选型基线对照（macro-F1 横条：多数类 / 随机森林 / 逻辑回归）
export function baselineBarOption(baselines) {
  const colorOf = (n) => n.includes('逻辑回归') ? CLAY : (n.includes('随机森林') ? AZURE : MUTED)
  return {
    grid: { left: 92, right: 44, top: 8, bottom: 22 },
    tooltip: { formatter: (p) => `${p.name}<br/>macro-F1 ${(p.value * 100).toFixed(1)}%` },
    xAxis: { type: 'value', max: 1, name: 'macro-F1', axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    yAxis: { type: 'category', data: baselines.map((b) => b.name),
      axisLabel: { fontFamily: 'serif', fontSize: 11 } },
    series: [{
      type: 'bar',
      data: baselines.map((b) => ({ value: +b.macro_f1.toFixed(3),
        itemStyle: { color: colorOf(b.name), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', formatter: (p) => (p.value * 100).toFixed(1) + '%', fontSize: 11 },
    }],
  }
}

// 置信度可靠性曲线（对角线=完美校准；柱=样本量）
export function calibrationOption(cal) {
  const curve = cal.curve || []
  return {
    tooltip: { trigger: 'axis',
      formatter: (ps) => {
        const c = curve[ps[0].dataIndex]
        return `置信 ${c.mean_confidence}<br/>实际准确率 ${c.accuracy}<br/>样本 ${c.count}`
      } },
    grid: { left: 44, right: 44, top: 28, bottom: 30 },
    legend: { data: ['实际准确率', '理想校准', '样本量'], top: 0, textStyle: { fontSize: 10 } },
    xAxis: { type: 'category', data: curve.map((c) => c.mean_confidence),
      name: '预测置信度', nameLocation: 'middle', nameGap: 22, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', min: 0, max: 1, name: '准确率', axisLabel: { fontSize: 10 } },
      { type: 'value', name: '样本', axisLabel: { fontSize: 10 } },
    ],
    series: [
      { name: '样本量', type: 'bar', yAxisIndex: 1,
        data: curve.map((c) => c.count),
        itemStyle: { color: 'rgba(44,127,184,0.22)' }, barWidth: '55%' },
      { name: '实际准确率', type: 'line', smooth: false, symbolSize: 7,
        data: curve.map((c) => c.accuracy),
        lineStyle: { color: AZURE, width: 2 }, itemStyle: { color: AZURE } },
      { name: '理想校准', type: 'line', symbol: 'none',
        data: curve.map((c) => c.mean_confidence),
        lineStyle: { color: MUTED, type: 'dashed', width: 1 } },
    ],
  }
}
