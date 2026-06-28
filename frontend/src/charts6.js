// 开篇导览图表：中国戏曲地图（源流叙事）+ 京剧发展时间线。
// 离线注册随包省级 geoJSON（ECharts v5 已移除内置地图）。
import * as echarts from 'echarts'
import chinaGeo from './data/chinaGeo.json'
import { REGIONS, ORIGIN_LINES, ORIGIN_KEYS } from './data/operaRegions'
import { SILK, SILK_DIM, VERMILION, TEAL, TOOLTIP, SERIF } from './theme'

// 地图自动布局会按「全部几何」的边界框缩放——而 geojson 含南海诸岛/九段线（南延至北纬 3.4°），
// 约 15° 的空海域把大陆压进画布上 70%、显得很小。这里仅为「布局」目的裁去深南海的细小岛屿/线要素
// （保留海南本岛，北纬 17° 以北），让自动布局以大陆为准、整张地图显著放大。
function trimForLayout(geo) {
  const polyMaxLat = (poly) => {
    let m = -1e9
    poly.forEach((ring) => ring.forEach((c) => { if (c[1] > m) m = c[1] }))
    return m
  }
  const features = geo.features
    .filter((f) => f.properties.name) // 去掉无名的南海/九段线要素
    .map((f) => {
      if (f.geometry?.type !== 'MultiPolygon') return f
      const kept = f.geometry.coordinates.filter((poly) => polyMaxLat(poly) > 17)
      return kept.length === f.geometry.coordinates.length
        ? f : { ...f, geometry: { ...f.geometry, coordinates: kept } }
    })
  return { ...geo, features }
}

echarts.registerMap('china', trimForLayout(chinaGeo))

// 「徽班进京 · 徽汉合流」分步讲解脚本：每步点亮一条源流、聚焦一个声腔。
export const NARRATION = [
  { title: '1790 · 四大徽班进京', focus: '徽剧', show: ['徽剧'],
    desc: '乾隆五十五年，三庆、四喜、和春、春台「四大徽班」自安徽进京贺寿，带来高亢的二黄声腔——京剧形成的序幕由此拉开。' },
  { title: '徽汉合流 · 皮黄成腔', focus: '汉剧', show: ['徽剧', '汉剧'],
    desc: '道光年间，湖北汉调艺人（如余三胜）进京搭徽班同台。汉调的西皮与徽班的二黄合流，「皮黄腔」就此奠定。' },
  { title: '博采昆秦 · 兼容并蓄', focus: '昆曲', show: ['徽剧', '汉剧', '昆曲', '秦腔'],
    desc: '其后又吸收昆曲的身段、曲牌与剧目，借鉴秦腔等花部诸腔的表演——四方声腔在京城汇于一炉。' },
  { title: '皮黄成形 · 京剧集大成', focus: '京剧', show: ['徽剧', '汉剧', '昆曲', '秦腔'],
    desc: '约道光年间，这门新剧在北京熔铸成形：生旦净丑齐备、唱念做打俱全，是为「京剧」——本系统所分析的 1473 部剧本，正源于此。' },
]

// 中国戏曲地图：宣纸描边底图 + 各地剧种散点 + 徽班进京/徽汉合流路线高亮。
// step=null 为全景；step=0..N 为分步讲解（点亮对应源流、聚焦声腔、淡化无关剧种）。
export function chinaOperaMapOption(step = null) {
  const narrating = step != null && NARRATION[step]
  const showSet = narrating ? new Set(NARRATION[step].show) : null
  const focus = narrating ? NARRATION[step].focus : null
  const points = REGIONS.map((r) => {
    const isOrigin = ORIGIN_KEYS.includes(r.name) || r.star
    // 讲解中：源流声腔与北京保持醒目，其余地方剧种淡化退场。
    const dim = narrating && !isOrigin
    const isFocus = r.name === focus
    const ch = r.short || r.name[0]  // 默认仅显示单字，避免全称重叠
    return {
      name: r.name,
      value: [...r.lnglat, (r.star ? 22 : 13) * (isFocus ? 1.4 : 1)],
      itemStyle: { color: r.color, opacity: dim ? 0.18 : 1,
        shadowBlur: isFocus ? 20 : 0, shadowColor: r.color },
      label: {
        show: !dim, position: 'right', distance: 5,
        formatter: r.star ? `★${ch}` : ch,
        color: r.star ? VERMILION : r.color, fontFamily: SERIF,
        fontSize: r.star ? 19 : 16, fontWeight: 700,
        // 纸色描边作"光晕"，让彩色单字在地图上清晰可读、不被底图吃掉
        textBorderColor: 'rgba(251,246,236,0.95)', textBorderWidth: 3.5,
      },
    }
  })
  const linesData = ORIGIN_LINES
    .filter((l) => !showSet || showSet.has(l.fromName))
    .map((l) => ({ coords: l.coords }))
  return {
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        if (p.seriesType === 'lines') return '徽班进京 · 徽汉合流'
        const r = REGIONS.find((x) => x.name === p.name)
        if (!r) return p.name
        return `<b style="color:${r.color}">${r.name}</b>（${r.province}）<br/>` +
          `<span style="color:${SILK_DIM};font-size:12px">代表：${r.plays.slice(0, 2).join('、')}</span>`
      },
    },
    geo: {
      map: 'china', roam: false, zoom: 1.06, top: 14, bottom: 14, left: 'center',
      itemStyle: { areaColor: '#EEE2C8', borderColor: 'rgba(42,36,32,0.32)', borderWidth: 0.9,
        shadowBlur: 18, shadowColor: 'rgba(42,36,32,0.10)', shadowOffsetY: 6 },
      emphasis: { itemStyle: { areaColor: '#E4CFA4' }, label: { show: false } },
    },
    series: [
      {
        type: 'lines', coordinateSystem: 'geo', zlevel: 1, data: linesData,
        effect: { show: true, period: narrating ? 3.5 : 5, trailLength: 0.5,
          symbol: 'arrow', symbolSize: narrating ? 9 : 6, color: VERMILION },
        lineStyle: { color: VERMILION, width: narrating ? 2.2 : 1.4,
          opacity: narrating ? 0.85 : 0.5, curveness: 0.25 },
      },
      {
        type: 'effectScatter', coordinateSystem: 'geo', zlevel: 2, data: points,
        symbolSize: (val) => val[2],
        showEffectOn: 'render', rippleEffect: { brushType: 'stroke', scale: 2.6 },
        // 悬停才显示剧种全称（带纸底卡片，置顶不被遮挡）
        emphasis: {
          scale: 1.5,
          label: {
            show: true, position: 'top', distance: 8,
            formatter: (p) => p.name, fontFamily: SERIF, fontSize: 14, fontWeight: 700,
            color: SILK, backgroundColor: 'rgba(251,246,236,0.96)',
            borderColor: 'rgba(192,57,43,0.45)', borderWidth: 1, borderRadius: 6,
            padding: [4, 8], shadowBlur: 10, shadowColor: 'rgba(42,36,32,0.18)',
          },
        },
        labelLayout: { moveOverlap: 'shiftY' },
      },
    ],
  }
}

// 五维联动总结雷达：取任务五「综合原型」中两类镜像极——
// 大戏一路（做打最盛）vs 文戏一路（旦行最重），跨「网络/叙事/行当」六轴对照，
// 各轴按全部原型 min-max 归一，直观印证两类稳定结构。
const RADAR_DIMS = [
  { key: '网络规模', name: '网络规模', dim: '关系网络' },
  { key: '模块度', name: '模块度', dim: '关系网络' },
  { key: '做打量', name: '武 · 做打', dim: '叙事结构' },
  { key: '唱腔', name: '文 · 唱腔', dim: '叙事结构' },
  { key: '净占比', name: '净行占比', dim: '角色行当' },
  { key: '旦占比', name: '旦行占比', dim: '角色行当' },
]
export function synthesisRadarOption(archetypes) {
  if (!archetypes || !archetypes.length) return {}
  const ranges = RADAR_DIMS.map((d) => {
    const vals = archetypes.map((a) => a.signature[d.key] ?? 0)
    return [Math.min(...vals), Math.max(...vals)]
  })
  const norm = (a) => RADAR_DIMS.map((d, i) => {
    const [lo, hi] = ranges[i]
    return hi > lo ? (a.signature[d.key] - lo) / (hi - lo) : 0.5
  })
  // 数据驱动选两极：做打量最大 = 大戏一路；旦占比最大 = 文戏一路。
  const big = archetypes.reduce((m, a) => (a.signature.做打量 > m.signature.做打量 ? a : m))
  const lyric = archetypes.reduce((m, a) => (a.signature.旦占比 > m.signature.旦占比 ? a : m))
  const mk = (a, color, label) => ({
    name: label, value: norm(a),
    areaStyle: { color, opacity: 0.22 },
    lineStyle: { color, width: 2 }, itemStyle: { color },
    _raw: a,
  })
  return {
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        const a = p.data._raw
        return `<b style="color:${p.color}">${p.name}</b>（${a.size} 部）<br/>` +
          RADAR_DIMS.map((d) => `${d.name}：${(a.signature[d.key]).toFixed(2)}`).join('<br/>') +
          `<br/><span style="color:${SILK_DIM};font-size:12px">主题：${a.top_theme}<br/>弧线：${a.top_arc}</span>`
      },
    },
    legend: { bottom: 0, textStyle: { color: SILK, fontFamily: SERIF },
      data: ['武戏类（征战·武打·净行）', '文戏类（婚姻·抒情·旦行）'] },
    radar: {
      center: ['50%', '52%'], radius: '64%',
      indicator: RADAR_DIMS.map((d) => ({ name: d.name, max: 1 })),
      axisName: { color: SILK, fontFamily: SERIF, fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(42,36,32,0.14)' } },
      splitArea: { areaStyle: { color: ['rgba(251,246,236,0.4)', 'rgba(241,231,213,0.4)'] } },
      axisLine: { lineStyle: { color: 'rgba(42,36,32,0.14)' } },
    },
    series: [{
      type: 'radar', data: [
        mk(big, VERMILION, '武戏类（征战·武打·净行）'),
        mk(lyric, TEAL, '文戏类（婚姻·抒情·旦行）'),
      ],
    }],
  }
}

// 京剧发展时间线（CSS 时间线为主，此处提供数据）。
export const TIMELINE = [
  { year: '1790', title: '四大徽班进京', desc: '乾隆五十五年，三庆、四喜、和春、春台进京贺寿，京剧形成的序幕。' },
  { year: '约 1840s', title: '徽汉合流 · 皮黄成形', desc: '汉调艺人进京搭徽班，西皮二黄合流，京剧在北京熔铸成形。' },
  { year: '1860s–70s', title: '同光十三绝', desc: '同治、光绪年间十三位名伶并世，老生程长庚等奠定行当典范。' },
  { year: '1920s–40s', title: '鼎盛 · 流派纷呈', desc: '四大名旦（梅尚程荀）、四大须生等流派争辉，京剧艺术臻于极盛。' },
  { year: '2010', title: '列入人类非遗', desc: '京剧入选联合国教科文组织人类非物质文化遗产代表作名录。' },
]
