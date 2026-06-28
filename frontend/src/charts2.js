import { ROLE_COLORS } from './api'
import { MUTED, SILK, TEAL, MAIZE, VERMILION_LIT, AZURE, PANEL, ACCENT, TYPE_COLORS } from './theme'

// 剧目类型配色由 theme.js（单一真相源）定义；本地引用并重导出兼容 `from './charts2'`。
export { TYPE_COLORS }

const METRIC_LABEL = {
  n_nodes: '角色数', n_edges: '关系数', density: '密度',
  avg_degree: '平均度', max_degree: '最大度', avg_clustering: '聚类系数',
  centralization: '中心势', modularity: '模块度', n_communities: '社群数',
}

// 各剧目类型结构指标对比（分组柱，归一化）
export function typeBarOption(typestats) {
  const types = typestats.types.filter((t) => typestats.by_type[t])
  const metrics = ['n_nodes', 'n_edges', 'density', 'avg_clustering',
    'centralization', 'modularity']
  // 每个指标按其最大值归一化，便于同图比较
  const maxOf = {}
  metrics.forEach((m) => { maxOf[m] = Math.max(...types.map((t) => typestats.by_type[t].mean[m])) })
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: types, top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 40, right: 20, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: metrics.map((m) => METRIC_LABEL[m]),
      axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'value', name: '相对量(归一)', max: 1 },
    series: types.map((t) => ({
      name: t, type: 'bar',
      itemStyle: { color: TYPE_COLORS[t] },
      data: metrics.map((m) => +(typestats.by_type[t].mean[m] / (maxOf[m] || 1)).toFixed(3)),
    })),
  }
}

// 结构显著性：各类型 中心势/模块度 相对同规模 ER 随机图的 z-score（>2 即显著高于随机）
export function nullModelZOption(typestats) {
  const types = typestats.types.filter((t) => typestats.by_type[t]
    && typestats.by_type[t].mean.modularity_z != null)
  const series = [
    { key: 'centralization_z', name: '中心势 z', color: MAIZE },
    { key: 'modularity_z', name: '模块度 z', color: TEAL },
  ]
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => 'z = ' + v },
    legend: { data: series.map((s) => s.name), top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 40, right: 16, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: types, axisLabel: { fontFamily: 'serif', fontSize: 13 } },
    yAxis: { type: 'value', name: 'z-score' },
    series: series.map((s) => ({
      name: s.name, type: 'bar', itemStyle: { color: s.color },
      data: types.map((t) => +(typestats.by_type[t].mean[s.key]).toFixed(2)),
      ...(s.key === 'modularity_z' ? {
        markLine: { silent: true, symbol: 'none',
          lineStyle: { color: VERMILION_LIT, type: 'dashed' },
          data: [{ yAxis: 2, label: { formatter: '显著 z=2', color: VERMILION_LIT, fontSize: 10 } }] },
      } : {}),
    })),
  }
}

// 类型雷达：用真实均值（各指标独立量纲）
export function typeRadarOption(typestats) {
  const types = typestats.types.filter((t) => typestats.by_type[t])
  const metrics = ['n_nodes', 'n_edges', 'density', 'avg_clustering',
    'centralization', 'modularity']
  const inds = metrics.map((m) => ({
    name: METRIC_LABEL[m],
    max: Math.max(...types.map((t) => typestats.by_type[t].mean[m])) * 1.1,
  }))
  return {
    tooltip: {},
    legend: { data: types, bottom: 0, textStyle: { fontFamily: 'serif' } },
    radar: { indicator: inds, radius: '64%', center: ['50%', '46%'],
      axisName: { fontFamily: 'serif', fontSize: 11, color: MUTED },
      splitLine: { lineStyle: { color: 'rgba(42,36,32,0.12)' } },
      axisLine: { lineStyle: { color: 'rgba(42,36,32,0.18)' } } },
    series: [{
      type: 'radar',
      data: types.map((t) => ({
        name: t, value: metrics.map((m) => typestats.by_type[t].mean[m]),
        lineStyle: { color: TYPE_COLORS[t], width: 2 },
        itemStyle: { color: TYPE_COLORS[t] }, areaStyle: { opacity: 0.05 },
      })),
    }],
  }
}

// 全库散点：角色数 x 中心势，按类型着色。highlight 非空时淡化其余类型（跨图筛选反馈）。
export function netScatterOption(points, highlight = '') {
  const types = [...new Set(points.map((p) => p.drama_type))]
  return {
    tooltip: {
      formatter: (p) => `《${p.data.title}》<br/>${p.data.drama_type}` +
        `<br/>角色 ${p.data.n_nodes} · 关系 ${p.data.n_edges}` +
        `<br/>中心势 ${p.data.centralization} · 模块度 ${p.data.modularity}`,
    },
    legend: { data: types, top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 50, right: 24, top: 34, bottom: 44 },
    xAxis: { name: '角色数(网络规模)', type: 'value', nameLocation: 'middle', nameGap: 26 },
    yAxis: { name: '中心势', type: 'value' },
    series: types.map((t) => ({
      name: t, type: 'scatter', symbolSize: 8,
      itemStyle: { color: TYPE_COLORS[t], opacity: highlight && highlight !== t ? 0.12 : 0.62 },
      data: points.filter((p) => p.drama_type === t).map((p) => ({ ...p, value: [p.n_nodes, p.centralization] })),
    })),
  }
}

// 网络结构的时期演化：各指标按自身跨时期最大值归一后的折线（显著者加粗+图例标 *）。
export function netPeriodEvoOption(evo) {
  const { period_order, metrics, by_period, significance } = evo
  const COLORS = [TEAL, AZURE, MAIZE, VERMILION_LIT]
  const nm = (m) => significance[m].significant ? m + ' *' : m
  return {
    tooltip: { trigger: 'axis',
      formatter: (ps) => ps[0].axisValue + '<br/>' +
        ps.map((p) => `${p.seriesName}: ${p.data.raw}`).join('<br/>') },
    legend: { top: 0, data: metrics.map(nm), textStyle: { fontFamily: 'serif', fontSize: 11 } },
    grid: { left: 52, right: 18, top: 34, bottom: 26 },
    xAxis: { type: 'category', boundaryGap: false, data: period_order,
      axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    yAxis: { type: 'value', name: '相对量(按指标归一)', max: 1 },
    series: metrics.map((m, i) => {
      const raw = period_order.map((p) => by_period[p][m])
      const mx = Math.max(...raw, 1e-9)
      return { name: nm(m), type: 'line', smooth: true, symbolSize: 7,
        data: raw.map((v) => ({ value: +(v / mx).toFixed(3), raw: v })),
        lineStyle: { color: COLORS[i % 4], width: significance[m].significant ? 3 : 1.6 },
        itemStyle: { color: COLORS[i % 4] } }
    }),
  }
}

// 类型间两两差异显著性矩阵（Mann–Whitney U + BH-FDR）。读作"行类型 vs 列类型"：
// ▲=行显著更高 / ▼=行显著更低 / ·=差异不显著。供 T2(结构指标)、T4(节奏指标)共用。
export function pairwiseSigOption(sigBlock, metric) {
  const types = sigBlock.types
  const pairs = sigBlock.pairs[metric] || []
  const med = {}
  pairs.forEach((p) => { med[p.a] = p.median_a; med[p.b] = p.median_b })
  const find = (a, b) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
  const data = []
  for (let i = 0; i < types.length; i++) for (let j = 0; j < types.length; j++) {
    if (i === j) { data.push({ value: [j, i, null] }); continue }
    const p = find(types[i], types[j])
    const v = (p && p.significant) ? (med[types[i]] > med[types[j]] ? 1 : -1) : 0
    data.push({ value: [j, i, v], p, ti: types[i], tj: types[j] })
  }
  return {
    tooltip: {
      formatter: (pt) => {
        const d = pt.data
        if (!d || d.value[2] === null || !d.p) return ''
        const hi = med[d.ti] > med[d.tj]
        return `${d.ti} vs ${d.tj}<br/>中位数 ${med[d.ti]} vs ${med[d.tj]}<br/>p_adj=${d.p.p_adj}` +
          (d.p.significant
            ? `<br/><span style="color:${hi ? VERMILION_LIT : AZURE}">${d.ti} 显著更${hi ? '高' : '低'}</span>`
            : `<br/><span style="color:${MUTED}">差异不显著</span>`)
      },
    },
    grid: { left: 70, right: 16, top: 16, bottom: 40 },
    xAxis: { type: 'category', data: types, axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    yAxis: { type: 'category', data: types, inverse: true, axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    visualMap: {
      type: 'piecewise', show: false, dimension: 2,
      pieces: [{ value: 1, color: VERMILION_LIT }, { value: -1, color: AZURE },
        { value: 0, color: 'rgba(138,126,110,0.16)' }],
    },
    series: [{
      type: 'heatmap', data,
      label: { show: true, fontSize: 15, color: SILK,
        formatter: (p) => p.data.value[2] === null ? ''
          : (p.data.value[2] === 1 ? '▲' : p.data.value[2] === -1 ? '▼' : '·') },
      itemStyle: { borderColor: PANEL, borderWidth: 2 },
    }],
  }
}

// 结构角色：每个行当的「度中心性(连接广度) × 介数中心性(桥接位)」散点，
// 气泡大小∝样本角色数。一眼看出谁是剧情组织者(右上)、谁占桥接主座。
export function roleStructureOption(rs) {
  const roles = Object.keys(rs)
  const maxN = Math.max(...roles.map((r) => rs[r].n_nodes_total), 1)
  // 散点 scale 会紧贴极值，使顶/边缘的大气泡被裁；按数据范围留内边距
  const pad = (vals) => {
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const m = ((hi - lo) || Math.abs(hi) || 1) * 0.28
    // 取整到 3 位小数，避免浮点尾差让轴端显示成 0.00157199999…
    return [+(lo - m).toFixed(3), +(hi + m).toFixed(3)]
  }
  const [xMin, xMax] = pad(roles.map((r) => rs[r].mean_degree_centrality))
  const [yMin, yMax] = pad(roles.map((r) => rs[r].mean_betweenness))
  return {
    tooltip: {
      formatter: (p) => {
        const s = rs[p.data.role]
        return `<b>${p.data.role}行</b><br/>度中心性 ${s.mean_degree_centrality}` +
          `<br/>介数中心性 ${s.mean_betweenness}` +
          `<br/>占桥接主座 ${(s.bridge_share * 100).toFixed(0)}% 剧目` +
          `<br/>样本 ${s.n_nodes_total} 个角色`
      },
    },
    grid: { left: 66, right: 26, top: 22, bottom: 44 },
    xAxis: { name: '度中心性 · 连接广度', type: 'value', nameLocation: 'middle',
      nameGap: 26, min: xMin, max: xMax, axisLabel: { formatter: (v) => v.toFixed(2) },
      nameTextStyle: { fontFamily: 'serif' } },
    yAxis: { name: '介数中心性 · 桥接位', type: 'value', nameLocation: 'middle',
      nameGap: 44, nameRotate: 90, min: yMin, max: yMax,
      axisLabel: { formatter: (v) => v.toFixed(3) },
      nameTextStyle: { fontFamily: 'serif' } },
    series: [{
      type: 'scatter',
      symbolSize: (v) => 22 + Math.sqrt(v[2] / maxN) * 46,
      data: roles.map((r) => ({
        value: [rs[r].mean_degree_centrality, rs[r].mean_betweenness, rs[r].n_nodes_total],
        role: r,
        itemStyle: { color: ROLE_COLORS[r] || MUTED, opacity: 0.85,
          borderColor: 'rgba(42,36,32,0.5)', borderWidth: 1 },
      })),
      label: { show: true, formatter: (p) => p.data.role, position: 'inside',
        fontFamily: 'serif', fontSize: 14, color: SILK, fontWeight: 'bold' },
    }],
  }
}

// 社群是否=行当阵营：各剧目类型的 role assortativity（同配系数）。
// 全为负=行当互补异配（生旦净丑交错搭戏），社群并非同行当抱团。
export function assortativityOption(assort) {
  const keys = Object.keys(assort)
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => '同配系数 ' + v },
    grid: { left: 48, right: 16, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: keys,
      axisLabel: { fontFamily: 'serif', fontSize: 12 } },
    yAxis: { type: 'value', name: 'role assortativity' },
    series: [{
      type: 'bar',
      data: keys.map((k) => ({ value: assort[k],
        itemStyle: { color: TYPE_COLORS[k] || MUTED,
          borderRadius: assort[k] >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })),
      label: { show: true, position: 'top', formatter: (p) => p.value, fontSize: 10 },
      markLine: { silent: true, symbol: 'none',
        lineStyle: { color: MUTED, type: 'dashed' }, data: [{ yAxis: 0 }] },
    }],
  }
}

// 单剧角色关系网络（力导向图）
// colorBy='role' 按行当着色；colorBy='community' 按检测到的社群着色（让"模块度/分阵营"可见）。
// 确定性力导向布局（Fruchterman–Reingold）：固定迭代、无随机种子 → 每次结果一致。
// 在构建 option 时一次性把坐标算好，配合 layout:'none' 静态渲染，避免 ECharts 实时
// 力导向永不收敛导致的持续抖动。返回每个节点的 {x,y}（已归一化居中、缩放到画布尺度）。
function staticForceLayout(nodes, edges) {
  const N = nodes.length
  if (!N) return []
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const k = 0.9 * Math.sqrt((640 * 640) / N)       // 理想边长尺度
  // 确定性初始化：按下标布在圆/螺旋上（不依赖 Math.random，保证可复现）
  const pos = nodes.map((n, i) => {
    const a = (i / N) * 2 * Math.PI * 1.618
    const r = 60 + i * 6
    return { x: Math.cos(a) * r, y: Math.sin(a) * r }
  })
  const links = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)])
    .filter(([a, b]) => a != null && b != null)
  let temp = 220
  for (let it = 0; it < 320; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y
        const d = Math.hypot(dx, dy) || 0.01
        const f = (k * k) / d                          // 斥力
        const ux = dx / d, uy = dy / d
        disp[i].x += ux * f; disp[i].y += uy * f
        disp[j].x -= ux * f; disp[j].y -= uy * f
      }
    }
    for (const [a, b] of links) {                      // 边吸引力
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y
      const d = Math.hypot(dx, dy) || 0.01
      const f = (d * d) / k
      const ux = dx / d, uy = dy / d
      disp[a].x -= ux * f; disp[a].y -= uy * f
      disp[b].x += ux * f; disp[b].y += uy * f
    }
    for (let i = 0; i < N; i++) {                       // 向心引力（避免孤立点飞散）
      disp[i].x -= pos[i].x * 0.04
      disp[i].y -= pos[i].y * 0.04
    }
    for (let i = 0; i < N; i++) {                       // 按温度限幅 + 冷却
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01
      const lim = Math.min(d, temp)
      pos[i].x += (disp[i].x / d) * lim
      pos[i].y += (disp[i].y / d) * lim
    }
    temp *= 0.975
  }
  // 归一化：居中并缩放到 ~340px 见方，交给 echarts 静态渲染
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const ext = Math.max(Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys), 1)
  const scale = 340 / ext
  return pos.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }))
}

// LOD：节点超过 maxNodes 时只渲染中心性 Top-K（及其内部边），保持大网络可读；
// 标签仅给中心性最高的若干节点，避免文字堆叠。
export function networkGraphOption(payload, roleColors = ROLE_COLORS,
  colorBy = 'role', maxNodes = 45) {
  const sorted = [...payload.nodes].sort((a, b) => b.centrality - a.centrality)
  const truncated = sorted.length > maxNodes
  const nodes = truncated ? sorted.slice(0, maxNodes) : sorted
  const keep = new Set(nodes.map((n) => n.id))
  const edges = payload.edges.filter((e) => keep.has(e.source) && keep.has(e.target))
  const labelTop = new Set(nodes.slice(0, Math.min(22, nodes.length)).map((n) => n.id))
  const maxC = Math.max(...nodes.map((n) => n.centrality), 0.01)
  const maxW = Math.max(...edges.map((e) => e.weight), 1)
  const byComm = colorBy === 'community'
  // 类目：行当名 或 社群号（按社群人数降序，标为「社群①…」）
  const commRank = byComm
    ? [...new Set(nodes.map((n) => n.community))].sort((a, b) => a - b)
    : []
  const cats = byComm
    ? commRank.map((c) => `社群${c + 1}`)
    : [...new Set(nodes.map((n) => n.role))]
  const colorOf = (n) => byComm
    ? ACCENT[commRank.indexOf(n.community) % ACCENT.length]
    : (roleColors[n.role] || MUTED)
  const catOf = (n) => byComm ? commRank.indexOf(n.community) : cats.indexOf(n.role)
  // 预先算好静态坐标，配合 layout:'none' 渲染——图永久静止，不再自行抖动
  const coords = staticForceLayout(nodes, edges)
  return {
    title: truncated ? {
      text: `中心性 Top ${maxNodes} / 共 ${payload.nodes.length} 节点`,
      right: 8, top: 4, textStyle: { color: MUTED, fontSize: 11, fontWeight: 'normal' },
    } : undefined,
    tooltip: {
      formatter: (p) => p.dataType === 'edge'
        ? `${p.data.source} — ${p.data.target}<br/>互动强度 ${p.data.weight}`
        : `${p.data.name}<br/>行当：${p.data.role}` +
          `<br/>社群：社群${(p.data.community ?? 0) + 1}` +
          `<br/>台词 ${p.data.n_lines} · 中心性 ${p.data.centrality}`,
    },
    legend: [{ data: cats, top: 0, textStyle: { fontFamily: 'serif' } }],
    series: [{
      // layout:'none' + 预计算坐标 → 完全静态渲染，节点不会自行移动（仍可手动拖拽/缩放）
      type: 'graph', layout: 'none', roam: true, draggable: true,
      categories: cats.map((c) => ({ name: c })),
      label: { show: true, fontFamily: 'serif', fontSize: 11, color: SILK },
      lineStyle: { color: 'source', opacity: 0.45, curveness: 0.05 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 4 } },
      data: nodes.map((n, i) => ({
        id: n.id, name: n.name, role: n.role, n_lines: n.n_lines,
        community: n.community, centrality: n.centrality, category: catOf(n),
        x: coords[i].x, y: coords[i].y,
        symbolSize: 14 + (n.centrality / maxC) * 38,
        label: { show: labelTop.has(n.id) },
        itemStyle: { color: colorOf(n) },
      })),
      links: edges.map((e) => ({
        source: e.source, target: e.target, weight: e.weight,
        lineStyle: { width: 1 + (e.weight / maxW) * 5 },
      })),
    }],
  }
}
