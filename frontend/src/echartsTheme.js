// 注册全局 ECharts 宣纸主题 opera-paper：透明背景、徽墨文字、淡墨坐标轴/分割线、
// 纸底 tooltip、行当+主题色板、统一入场动画。
// 同时以 opera-dark 别名注册（向后兼容旧 theme 引用），所有 <ReactECharts> 任选其一。
import * as echarts from 'echarts'
import {
  SILK, MUTED, AXIS, GRID, SERIF, MONO, TOOLTIP,
  ROLE_COLORS, TOPIC_COLORS, SEQ_RAMP,
} from './theme'

const palette = [
  ROLE_COLORS.生, ROLE_COLORS.旦, ROLE_COLORS.净, ROLE_COLORS.丑,
  ...TOPIC_COLORS,
]

const axisCommon = {
  axisLine: { lineStyle: { color: 'rgba(42,36,32,0.20)' } },
  axisTick: { lineStyle: { color: AXIS } },
  axisLabel: { color: MUTED, fontFamily: MONO, fontSize: 11 },
  splitLine: { lineStyle: { color: GRID } },
  nameTextStyle: { color: MUTED, fontFamily: SERIF },
}

const THEME = {
  color: palette,
  backgroundColor: 'transparent',
  textStyle: { color: SILK, fontFamily: SERIF },
  // 统一入场动画：柔和上扬、序列错落
  animation: true,
  animationDuration: 760,
  animationEasing: 'cubicOut',
  animationDelay: (idx) => idx * 26,
  title: {
    textStyle: { color: SILK, fontFamily: SERIF },
    subtextStyle: { color: MUTED },
  },
  legend: { textStyle: { color: MUTED, fontFamily: SERIF } },
  tooltip: TOOLTIP,
  categoryAxis: axisCommon,
  valueAxis: axisCommon,
  logAxis: axisCommon,
  timeAxis: axisCommon,
  line: { symbolSize: 6, smooth: true },
  graph: { color: palette, lineStyle: { color: 'rgba(42,36,32,0.16)' } },
  sankey: { lineStyle: { color: 'source', opacity: 0.4 } },
  visualMap: {
    textStyle: { color: MUTED },
    inRange: { color: SEQ_RAMP },
  },
}

echarts.registerTheme('opera-paper', THEME)
echarts.registerTheme('opera-dark', THEME)   // 别名：避免逐处改 theme 名
