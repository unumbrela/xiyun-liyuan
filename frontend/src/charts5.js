import { TYPE_COLORS } from './charts2'
import { ROLE_COLORS } from './api'
import { PANEL, SILK, MUTED, TEAL, VERMILION_LIT, AMBER, ROSE, AZURE, DIV_RAMP } from './theme'

const DIM_COLOR = {
  关系网络: TEAL, 叙事结构: VERMILION_LIT, 角色行当: AMBER, 主题表达: ROSE,
}

// ① 跨维度相关矩阵热力（非显著格子灰化：经 BH-FDR 校正 p≥.05 视为不显著）
export function corrOption(corr) {
  const { labels, dims, matrix, sig_matrix } = corr
  const n = labels.length
  const sigOf = (i, j) => !sig_matrix || sig_matrix[i][j]
  const data = []
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const significant = sigOf(i, j)
    data.push({
      value: [j, i, matrix[i][j]],
      // 不显著（且非对角）的格子降透明，弱化视觉权重
      itemStyle: significant ? { borderColor: PANEL, borderWidth: 1 }
        : { borderColor: PANEL, borderWidth: 1, opacity: 0.18 },
    })
  }
  return {
    tooltip: { formatter: (p) => {
      const [j, i, r] = p.value
      return `${labels[i]} × ${labels[j]}<br/>r = ${r}` +
        (i === j ? '' : (sigOf(i, j) ? `<br/><span style="color:${TEAL}">显著 (FDR p&lt;.05)</span>`
          : `<br/><span style="color:${MUTED}">不显著 (ns)</span>`))
    } },
    grid: { left: 96, right: 14, top: 12, bottom: 96 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontFamily: 'serif', fontSize: 9, rotate: 55,
      color: (v) => DIM_COLOR[dims[labels.indexOf(v)]] } },
    yAxis: { type: 'category', data: labels, axisLabel: { fontFamily: 'serif', fontSize: 9,
      color: (v) => DIM_COLOR[dims[labels.indexOf(v)]] } },
    visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      inRange: { color: DIV_RAMP } },
    // 逐格揭示：每个方格按索引顺序延迟淡入，整体只播放一次后保持不消失。
    animation: true,
    animationDurationUpdate: 0,
    series: [{
      type: 'heatmap', data,
      animationDuration: 360,
      animationDelay: (idx) => idx * 28,
      animationEasing: 'cubicOut',
      label: { show: true, formatter: (p) => p.value[2] === 0 ? '' : (p.value[2] * 100).toFixed(0), fontSize: 8, color: SILK },
    }],
  }
}

// ② 协同链路 Sankey
export function sankeyOption(sankey) {
  const color = (n) => n.startsWith('主题') ? ROSE
    : n.startsWith('叙事') ? VERMILION_LIT : (TYPE_COLORS[n] || TEAL)
  return {
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey', emphasis: { focus: 'adjacency' },
      nodeAlign: 'left', nodeGap: 10,
      data: sankey.nodes.map((n) => ({ name: n.name, itemStyle: { color: color(n.name) } })),
      links: sankey.links,
      label: { fontFamily: 'serif', fontSize: 11, color: SILK },
      lineStyle: { color: 'gradient', opacity: 0.4, curveness: 0.5 },
    }],
  }
}

// ③ 综合原型签名雷达（按指标归一）
export function archetypeRadarOption(archetypes, cols) {
  const inds = cols.map((c) => ({
    name: c, max: Math.max(...archetypes.map((a) => a.signature[c])) * 1.1 || 1,
  }))
  const palette = [VERMILION_LIT, AMBER, TEAL, AZURE, ROSE, MUTED]
  return {
    tooltip: {},
    legend: { type: 'scroll', bottom: 0, textStyle: { fontFamily: 'serif', fontSize: 10 } },
    radar: { indicator: inds, radius: '60%', center: ['50%', '46%'],
      axisName: { fontFamily: 'serif', fontSize: 10, color: MUTED },
      splitLine: { lineStyle: { color: 'rgba(42,36,32,0.12)' } },
      axisLine: { lineStyle: { color: 'rgba(42,36,32,0.18)' } } },
    series: [{
      type: 'radar',
      data: archetypes.map((a, i) => ({
        name: `原型${a.id}(${a.size})`, value: cols.map((c) => a.signature[c]),
        lineStyle: { color: palette[i % 6], width: 2 }, itemStyle: { color: palette[i % 6] },
        areaStyle: { opacity: 0.04 },
      })),
    }],
  }
}

// ④ 联动档案：行当占比条
export function roleBarOption(roles) {
  const keys = ['生', '旦', '净', '丑']
  return {
    grid: { left: 36, right: 16, top: 8, bottom: 20 },
    tooltip: { trigger: 'axis', valueFormatter: (v) => (v * 100).toFixed(0) + '%' },
    xAxis: { type: 'category', data: keys, axisLabel: { fontFamily: 'serif', fontSize: 14 } },
    yAxis: { type: 'value', max: 1, axisLabel: { formatter: (v) => (v * 100).toFixed(0) + '%' } },
    series: [{ type: 'bar', data: keys.map((k) => ({ value: roles[k] || 0,
      itemStyle: { color: ROLE_COLORS[k], borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', formatter: (p) => (p.value * 100).toFixed(0) + '%', fontSize: 11 } }],
  }
}

// 轻量预测验证：网络+行当+主题 → 叙事弧型 的 macro-F1 vs 多数类基线。
export function predictionOption(pred) {
  const cats = ['多数类基线', '网络+行当+主题']
  const vals = [pred.baseline_macro_f1, pred.macro_f1]
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => 'macro-F1 ' + v },
    grid: { left: 110, right: 40, top: 10, bottom: 26 },
    xAxis: { type: 'value', name: 'macro-F1', max: Math.max(0.3, pred.macro_f1 * 1.3),
      axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: cats, axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    series: [{
      type: 'bar', data: [
        { value: vals[0], itemStyle: { color: MUTED, borderRadius: [0, 4, 4, 0] } },
        { value: vals[1], itemStyle: { color: TEAL, borderRadius: [0, 4, 4, 0] } }],
      label: { show: true, position: 'right', formatter: (p) => p.value, fontSize: 11 },
    }],
  }
}

// 联动档案：主题构成饼
export function miniTopicOption(topics) {
  return {
    tooltip: { formatter: (p) => `${p.name}<br/>${(p.value * 100).toFixed(0)}%` },
    series: [{ type: 'pie', radius: ['35%', '68%'],
      label: { fontFamily: 'serif', fontSize: 10, formatter: (p) => `T${p.name}` },
      data: topics.map((t) => ({ name: `${t.id} ${t.label}`, value: t.w })) }],
  }
}
