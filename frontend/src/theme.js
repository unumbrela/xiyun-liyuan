// 宣纸水墨·素雅 — 单一配色真相源（colors）。
// 全站颜色 token 均在此定义并按语义分区；CSS 侧对应 :root 变量见 styles.css。
// 语义分层（互不混用）：
//   ① 品牌/UI 强调（朱砂·古铜，仅界面 chrome/印章/按钮，不作数据系列色）
//   ② 行当色 ROLE_COLORS（脸谱五色）
//   ③ 剧目类型色 TYPE_COLORS（独立色板，色相与行当分离）
//   ④ 多类别轮换 TOPIC_COLORS（主题维度）
//   ⑤ 两条色带 SEQ_RAMP（顺序/热力）/ DIV_RAMP（发散/相关性）

// ===== ① 基础色 / 品牌（亮场） =====
export const STAGE = '#F4EDE0'     // 纸底
export const PANEL = '#FBF6EC'     // 卡片
export const GOLD = '#A9762E'      // 古铜次强调
export const GOLD_LIT = '#8A5A1E'  // 深铜
export const VERMILION = '#C0392B' // 朱砂（签名强调·UI/印章·暖底身份色，保留）
export const VERMILION_LIT = '#EF7A4B' // 数据语境暖强调＝清新珊瑚橙（点睛色，替代旧朱红）
export const SILK = '#2A2420'      // 徽墨主文字
export const SILK_DIM = '#5C5248'  // 次级文字
export const MUTED = '#8A7E6E'     // 弱文字

// 图表语义色
export const INK = SILK            // 图表正文/标签
export const AXIS = '#A89B88'      // 坐标轴线与刻度
export const GRID = 'rgba(42,36,32,0.08)'   // 分割线（淡墨）
export const FAINT = 'rgba(42,36,32,0.45)'

// 通用强调色（清新科研·冷调为主；明亮但不刺眼，类 Tableau/Observable）
export const TEAL = '#1FB6A6'   // 青绿
export const ROSE = '#E0598B'   // 玫红
export const AZURE = '#2C7FB8'  // 蓝（默认数据色）
export const AMBER = '#F0C24B'  // 琥珀
export const LEAF = '#5CB85C'   // 草绿
export const MAIZE = '#E8A93C'  // 暖橙
export const PLUM = '#7A5CC0'   // 紫
export const CLAY = '#EF7A4B'   // 珊瑚橙（暖点睛）
// 多系列轮换调色板（蓝/青起手，珊瑚橙点睛——清新且高区分）
export const ACCENT = [AZURE, TEAL, CLAY, PLUM, LEAF, AMBER, ROSE, '#4F9DE8']

// ===== ② 五大行当色（清新科研·内部高区分）。生·蓝、旦·玫、净·青绿、丑·琥珀、杂·灰 =====
export const ROLE_COLORS = { 生: '#4F9DE8', 旦: '#E0598B', 净: '#1FB6A6', 丑: '#F0C24B', 杂: '#8F9BA8' }

// ===== ③ 剧目类型色 =====
// 全站共享同一套核心色板：剧目类型与行当**按位置一一复用同一组颜色**
// （历史≙生·蓝 / 家庭≙旦·玫 / 公案≙净·青绿 / 神怪≙丑·琥珀 / 其他≙杂·灰），
// 这样总览左右两个环形图共用同一组 5 色、全站只用这几种颜色，避免色种过多。
// 类型与行当从不在同一张带图例的图中同时出现，故复用同色不致混淆。
// 同时提供「历史」与「历史戏」两种键，兼容短/长两种调用。
const T_HIST = ROLE_COLORS.生, T_HOME = ROLE_COLORS.旦, T_CASE = ROLE_COLORS.净,
  T_MYTH = ROLE_COLORS.丑, T_OTHER = ROLE_COLORS.杂
export const TYPE_COLORS = {
  历史: T_HIST, 历史戏: T_HIST,
  家庭: T_HOME, 家庭戏: T_HOME,
  公案: T_CASE, 公案戏: T_CASE,
  神怪: T_MYTH, 神怪戏: T_MYTH,
  其他: T_OTHER,
}
// 别名：旧引用 DRAMA_COLORS.历史 等仍可用。
export const DRAMA_COLORS = TYPE_COLORS

// ===== ④ 主题轮换色（≥K 个轮换）— 米白校准，仅用于 LDA 主题维度 =====
export const TOPIC_COLORS = [
  '#2C7FB8', '#1FB6A6', '#EF7A4B', '#7A5CC0', '#5CB85C', '#F0C24B',
  '#E0598B', '#4F9DE8', '#E8A93C', '#59B0A0', '#5D6FB5', '#B07AD1',
]

// ===== ⑤ 两条统一色带（清新科研：单色蓝顺序带 + 蓝↔珊瑚发散带）=====
// 顺序/热力：浅冷白 → 青蓝 → 蓝（混淆矩阵、表演热力、共现等）
export const SEQ_RAMP = ['#EDF3F7', '#7FC1D9', '#2C7FB8']
// 发散/相关性：蓝 ← 中性 → 珊瑚（任务五相关矩阵：蓝负、珊瑚正）
export const DIV_RAMP = [AZURE, '#F1F1EC', CLAY]

// 等宽数字字体（仪表盘质感）
export const MONO = "'Iosevka', 'JetBrains Mono', 'Consolas', 'DejaVu Sans Mono', monospace"
export const SERIF = "'Noto Serif SC', 'Songti SC', serif"

// 宣纸 tooltip 通用样式
export const TOOLTIP = {
  backgroundColor: 'rgba(251,246,236,0.97)',
  borderColor: 'rgba(192,57,43,0.45)',
  borderWidth: 1,
  textStyle: { color: SILK, fontFamily: SERIF },
  extraCssText: 'border-radius:8px;box-shadow:0 8px 28px rgba(42,36,32,0.18);',
}
