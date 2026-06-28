import { TYPE_COLORS } from './charts2'
import { VERMILION_LIT, AMBER, LEAF, AZURE, ROSE, TEAL } from './theme'

const ARC_COLORS = [VERMILION_LIT, AMBER, LEAF, AZURE, ROSE]

// ① 典型叙事弧线原型：均值曲线叠加；bandId 不为空时叠加该弧线的簇内 p25–p75 离散度带
export function arcCurvesOption(arcs, L, bandId = null) {
  const x = Array.from({ length: L }, (_, i) => (i / (L - 1) * 100).toFixed(0) + '%')
  const series = []
  arcs.forEach((a) => {
    const focused = bandId == null || a.id === bandId
    if (a.id === bandId && a.p25 && a.p75) {
      // 下沿（透明）+ 带高（p75−p25，填充半透明）堆叠出分位带
      series.push({ name: '§lo', type: 'line', stack: `b${a.id}`, symbol: 'none',
        lineStyle: { opacity: 0 }, data: a.p25, silent: true, z: 1 })
      series.push({ name: '§band', type: 'line', stack: `b${a.id}`, symbol: 'none',
        lineStyle: { opacity: 0 }, silent: true, z: 1,
        areaStyle: { color: ARC_COLORS[a.id % 5], opacity: 0.16 },
        data: a.p75.map((v, i) => +(v - a.p25[i]).toFixed(3)) })
    }
    series.push({
      name: `${a.label} (${a.size})`, type: 'line', smooth: true, symbol: 'none', z: 5,
      lineStyle: { width: a.id === bandId ? 3.5 : 2.5, color: ARC_COLORS[a.id % 5],
        opacity: focused ? 1 : 0.22 },
      data: a.mean_curve,
    })
  })
  return {
    tooltip: { trigger: 'axis',
      formatter: (ps) => ps[0].axisValue + '<br/>' + ps
        .filter((p) => p.seriesName && !p.seriesName.startsWith('§'))
        .map((p) => `${p.seriesName}: ${(+p.value).toFixed(2)}`).join('<br/>') },
    legend: { type: 'scroll', top: 0, textStyle: { fontFamily: 'serif', fontSize: 11 },
      data: arcs.map((a) => `${a.label} (${a.size})`) },
    grid: { left: 56, right: 18, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: x, name: '剧情进度', boundaryGap: false,
      axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'value', name: '戏剧强度', nameLocation: 'middle', nameGap: 34,
      nameRotate: 90, min: 0, max: 1 },
    series,
  }
}

// ② 高潮位置分布直方
export function peakHistOption(hist) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 44, right: 18, top: 16, bottom: 30 },
    xAxis: { type: 'category', data: hist.bins.map((b) => (b * 100).toFixed(0) + '%'),
      name: '高潮位置', axisLabel: { fontFamily: 'serif' } },
    yAxis: { type: 'value', name: '剧目数' },
    series: [{
      type: 'bar', data: hist.counts,
      itemStyle: { color: VERMILION_LIT, borderRadius: [4, 4, 0, 0] },
    }],
  }
}

// ③ 跨剧目类型节奏特征：分组（高潮位/做打/唱占比）
export function rhythmByTypeOption(byType) {
  const types = Object.keys(byType)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['高潮位置', '渐强指数', '平均做打(缩放)'], top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 44, right: 18, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: types, axisLabel: { fontFamily: 'serif', fontSize: 13 } },
    yAxis: { type: 'value' },
    series: [
      { name: '高潮位置', type: 'bar', itemStyle: { color: VERMILION_LIT },
        data: types.map((t) => byType[t].mean_peak_pos) },
      { name: '渐强指数', type: 'bar', itemStyle: { color: AMBER },
        data: types.map((t) => byType[t].mean_rising) },
      { name: '平均做打(缩放)', type: 'line', itemStyle: { color: TEAL },
        yAxisIndex: 0,
        data: types.map((t) => +(byType[t].mean_action / 10).toFixed(3)) },
    ],
  }
}

// ④ 单剧叙事曲线：综合/唱腔/武打 三线 + 高潮标注 + 阶段分带
export function narrativeCurveOption(nar) {
  const scenes = nar.scenes
  const x = scenes.map((s, i) => s.name || `第${i + 1}场`)
  // 阶段分带（清新淡染，低透明度铺底仍可读曲线）：灰淡/琥珀淡/珊瑚淡/蓝淡。
  const stageColor = {
    开端: 'rgba(143,155,168,0.10)', 发展: 'rgba(240,194,75,0.14)',
    高潮: 'rgba(239,122,75,0.13)', 结局: 'rgba(44,127,184,0.10)',
  }
  // 阶段背景分带
  const bands = []
  let start = 0
  for (let i = 1; i <= scenes.length; i++) {
    if (i === scenes.length || scenes[i].stage_label !== scenes[start].stage_label) {
      bands.push([{ xAxis: start, itemStyle: { color: stageColor[scenes[start].stage_label] || 'transparent' } },
        { xAxis: i - 1 }])
      start = i
    }
  }
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const i = ps[0].dataIndex
        return `${x[i]} · ${scenes[i].stage_label}<br/>` +
          ps.map((p) => `${p.seriesName}: ${(p.value).toFixed(2)}`).join('<br/>') +
          `<br/>唱${scenes[i].sing}/念${scenes[i].nian}/白${scenes[i].bai} · 做打${scenes[i].action ?? 0}`
      },
    },
    legend: { data: ['综合强度', '唱腔(文)', '武打(武)'], top: 0, textStyle: { fontFamily: 'serif' } },
    grid: { left: 44, right: 18, top: 36, bottom: 60 },
    xAxis: { type: 'category', data: x, boundaryGap: false,
      axisLabel: { fontFamily: 'serif', fontSize: 10, rotate: scenes.length > 12 ? 30 : 0 } },
    yAxis: { type: 'value', name: '强度', min: 0, max: 1 },
    series: [
      { name: '综合强度', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 3, color: VERMILION_LIT }, itemStyle: { color: VERMILION_LIT },
        areaStyle: { color: 'rgba(214,83,63,0.12)' },
        data: scenes.map((s) => s.intensity),
        markPoint: { symbol: 'pin', symbolSize: 44, data: [{
          name: '高潮', xAxis: nar.peak_idx, yAxis: scenes[nar.peak_idx].intensity,
          itemStyle: { color: VERMILION_LIT }, label: { formatter: '高潮', color: '#fff5ec', fontSize: 10 } }] },
        markArea: { silent: true, data: bands },
      },
      { name: '唱腔(文)', type: 'line', smooth: true, symbol: 'none',
        lineStyle: { width: 1.5, color: ROSE, type: 'dashed' },
        data: scenes.map((s) => s.lyric) },
      { name: '武打(武)', type: 'line', smooth: true, symbol: 'none',
        lineStyle: { width: 1.5, color: TEAL, type: 'dashed' },
        data: scenes.map((s) => s.martial) },
    ],
  }
}

// 弧线数 K 选择（silhouette 轮廓系数曲线，标注采用的 K）
export function silhouetteOption(kSel, chosenK) {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => '轮廓系数 ' + v },
    grid: { left: 48, right: 18, top: 14, bottom: 28 },
    xAxis: { type: 'category', data: kSel.map((d) => d.k), name: 'K',
      nameLocation: 'middle', nameGap: 20 },
    yAxis: { type: 'value', name: 'silhouette', axisLabel: { fontSize: 10 } },
    series: [{
      type: 'line', smooth: true, symbolSize: 7,
      data: kSel.map((d) => d.silhouette),
      lineStyle: { color: LEAF }, itemStyle: { color: LEAF },
      markLine: chosenK ? { silent: true, symbol: 'none',
        lineStyle: { color: AMBER, type: 'dashed' },
        data: [{ xAxis: String(chosenK), label: { formatter: `采用 K=${chosenK}`, color: AMBER, fontSize: 10 } }] } : undefined,
    }],
  }
}

// 强度权重敏感性（各权重组合的弧线划分与采用值的一致性 ARI）
export function weightSensitivityOption(ws) {
  const lab = (w) => `文${w[0]}/武${w[1]}/冲${w[2]}`
  return {
    tooltip: { formatter: (p) => `${p.name}<br/>ARI ${p.value}` },
    grid: { left: 96, right: 36, top: 8, bottom: 24 },
    xAxis: { type: 'value', max: 1, name: 'ARI (vs 采用权重)',
      axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: ws.map((w) => lab(w.weights)),
      axisLabel: { fontFamily: 'serif', fontSize: 10 } },
    series: [{
      type: 'bar',
      data: ws.map((w, i) => ({ value: w.ari,
        itemStyle: { color: i === 0 ? AMBER : AZURE, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', formatter: (p) => p.value, fontSize: 10 },
    }],
  }
}
