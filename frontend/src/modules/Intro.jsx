import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactECharts from 'echarts-for-react'
import { Card } from './Task1'
import { ROLE_COLORS } from '../api'
import { DRAMA_COLORS } from '../theme'
import { chinaOperaMapOption, TIMELINE, NARRATION } from '../charts6'
import { REGIONS } from '../data/operaRegions'

const ASSET = import.meta.env.BASE_URL // './' —— 兼容 dev 与 Electron file://

// —— 行当体系（引 pipeline/role_dict.py 的细分支，静态策展）——
const ROLES = [
  { key: '生', color: ROLE_COLORS.生, img: 'sheng.jpg', title: '生 · 男性角色',
    desc: '男性角色的统称，一般不勾画脸谱，按年龄和身份分为文武老少几类。',
    subs: ['老生', '小生', '武生', '红生', '娃娃生'],
    famous: '诸葛亮 · 杨延辉 · 周瑜' },
  { key: '旦', color: ROLE_COLORS.旦, img: 'dan.jpg', title: '旦 · 女性角色',
    desc: '女性角色的统称，注重唱功与身段，包括端庄的青衣、活泼的花旦、能武打的刀马旦等。',
    subs: ['青衣（正旦）', '花旦', '武旦', '老旦', '彩旦', '花衫'],
    famous: '杨贵妃 · 白素贞 · 穆桂英' },
  { key: '净', color: ROLE_COLORS.净, img: 'jing.jpg', title: '净 · 花脸',
    desc: '性格鲜明、相貌或脾气突出的男性角色，勾画脸谱、嗓音洪亮，俗称「花脸」。',
    subs: ['铜锤（正净）', '架子花', '武净'],
    famous: '包拯 · 曹操 · 张飞' },
  { key: '丑', color: ROLE_COLORS.丑, img: 'chou.jpg', title: '丑 · 喜剧角色',
    desc: '京剧中的喜剧角色，俗称「小花脸」：文丑在鼻梁上抹一块白粉、口齿伶俐；武丑身手敏捷、机灵诙谐（图为猴戏中的武丑）。',
    subs: ['文丑', '武丑', '方巾丑', '彩旦丑'],
    famous: '蒋干 · 时迁 · 美猴王' },
  { key: '杂', color: ROLE_COLORS.杂, img: 'za.jpg', title: '杂 · 群演配角',
    desc: '龙套、校尉、武士等群演和辅助角色，主要用来烘托场面、增加声势。',
    subs: ['龙套', '校尉', '武士', '马童'],
    famous: '院子 · 旗牌 · 上下手' },
]

// —— 脸谱色彩象征 ——
const FACES = [
  { c: '#C0392B', name: '红', mean: '忠勇耿介', who: '关羽' },
  { c: '#2A2420', name: '黑', mean: '刚直勇猛', who: '包拯 · 张飞' },
  { c: '#F2EAD8', name: '白', mean: '奸诈多谋', who: '曹操', dark: true },
  { c: '#15A38A', name: '绿', mean: '草莽侠义', who: '单雄信' },
  { c: '#3E86B8', name: '蓝', mean: '刚强桀骜', who: '窦尔敦' },
  { c: '#C99A2B', name: '金银', mean: '神佛精怪', who: '二郎神 · 孙悟空' },
]

// —— 唱念做打 · 四功（点明与任务四的对应）——
const SKILLS = [
  { k: '唱', sub: '歌唱', desc: '以皮黄声腔抒情叙事，旦行尤重唱工。', tie: '任务四「戏剧强度」中的「文」分量。' },
  { k: '念', sub: '念白', desc: '韵白与京白，交代情节、推动冲突。', tie: '对白切换 → 任务四的「冲突」分量。' },
  { k: '做', sub: '身段', desc: '手眼身法步的程式化表演，刻画人物。', tie: '做工戏的表现力之源。' },
  { k: '打', sub: '武打', desc: '翻扑跌打与开打，武戏的高潮所在。', tie: '任务四「戏剧强度」中的「武」分量。' },
]

// —— 剧目类型 · 题材（点明与任务二/三/五的对应）——
const GENRES = [
  { k: '历史戏', color: DRAMA_COLORS.历史, desc: '讲述朝代兴衰与征战谋略，人物多、敌我阵营分明。', ex: '《空城计》', tie: '任务二中网络模块度最高。' },
  { k: '家庭戏', color: DRAMA_COLORS.家庭, desc: '讲述家庭伦理与情感，人物少、互动紧密。', ex: '《四郎探母》', tie: '任务二中网络密度最高。' },
  { k: '公案戏', color: DRAMA_COLORS.公案, desc: '讲述清官断案、为人申冤，人物围绕判官形成星型结构。', ex: '《铡美案》', tie: '任务二中网络规模最大。' },
  { k: '神怪戏', color: DRAMA_COLORS.神怪, desc: '讲述神仙鬼怪、降妖除魔，情节充满想象。', ex: '《白蛇传》', tie: '任务三中神怪类主题明显。' },
]

// 开篇引导动画：启动幕布拉开（后端就绪）后，首次进入「开篇导览」播放一段可跳过的题头动画。
// 尊重 prefers-reduced-motion（不弹）；播放后写 localStorage，仅首访自动弹，避免与启动幕布重叠。
function IntroOpening({ ready }) {
  const reduce = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [show, setShow] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const dismiss = () => {
    setLeaving(true)
    try { localStorage.setItem('opera.intro.played', '1') } catch { /* ignore */ }
    setTimeout(() => setShow(false), 720)
  }
  // 待启动幕布收起（ready）后再起幕，仅首访。
  useEffect(() => {
    if (!ready || reduce) return
    let first = false
    try { first = !localStorage.getItem('opera.intro.played') } catch { first = false }
    if (!first) return
    setShow(true)
  }, [ready, reduce])
  useEffect(() => {
    if (!show) return
    const t = setTimeout(dismiss, 5200) // 自动收场（可随时跳过）
    return () => clearTimeout(t)
  }, [show])
  if (!show) return null
  // 用 Portal 挂到 body，避开 .module-anim 的 transform 包含块，确保 fixed 覆盖全屏。
  return createPortal(
    <div className={'intro-opening' + (leaving ? ' leaving' : '')} onClick={dismiss}>
      <div className="io-core">
        <div className="io-seal">梨园</div>
        <div className="io-title">戏韵 · 梨园谱系</div>
        <div className="io-line" />
        <div className="io-sub">京剧介绍与数据分析</div>
      </div>
      <button className="io-skip" onClick={(e) => { e.stopPropagation(); dismiss() }}>跳过 ⏭</button>
    </div>,
    document.body,
  )
}

function RoleImg({ src, color, label }) {
  const [bad, setBad] = useState(false)
  // 源变化时重置错误态，避免「一次加载失败 → 永久回退色块」（如图片后补放入后不刷新不显示）。
  useEffect(() => { setBad(false) }, [src])
  if (bad) {
    return (
      <div className="role-img role-img--fallback" style={{ background: color }}>
        <span>{label}</span>
      </div>
    )
  }
  return (
    <img className="role-img" src={ASSET + 'intro/roles/' + src} alt={label}
      style={{ borderColor: color }} onError={() => setBad(true)} loading="lazy" />
  )
}

export default function Intro({ goto, ready = true }) {
  const [sel, setSel] = useState('京剧')
  // 徽班进京分步讲解：null=全景，0..N=讲解步骤
  const [step, setStep] = useState(null)
  const region = REGIONS.find((r) => r.name === sel) || REGIONS[0]
  // 地图随讲解步骤变化（全景时仅算一次）。
  const mapOption = useMemo(() => chinaOperaMapOption(step), [step])

  const onMapEvents = {
    click: (p) => {
      if (step != null) return // 讲解中不响应点选
      if (p?.name && REGIONS.some((r) => r.name === p.name)) setSel(p.name)
    },
  }

  // 讲解推进时，右侧面板自动聚焦到当前声腔。
  const startTour = () => { setStep(0); setSel(NARRATION[0].focus) }
  const go = (i) => {
    if (i < 0 || i >= NARRATION.length) { setStep(null); return }
    setStep(i); setSel(NARRATION[i].focus)
  }
  const endTour = () => setStep(null)

  return (
    <div className="intro">
      <IntroOpening ready={ready} />

      {/* 开篇引语 */}
      <section className="intro-hero">
        <div className="hero-seal">梨园</div>
        <h1 className="hero-title">戏韵 · 梨园谱系</h1>
        <p className="hero-lead">
          京剧是中国影响最大的戏曲剧种之一。二百多年前，四大徽班进京，融合汉调、昆曲、秦腔等多种声腔，
          逐渐形成以西皮、二黄为主，行当（生旦净丑）和表演（唱念做打）齐全的综合艺术，
          2010 年列入联合国人类非物质文化遗产。
        </p>
        <p className="hero-sub">
          本导览先介绍京剧的起源、行当与扮相，再进入对 1473 部京剧剧本的数据分析。
        </p>
      </section>

      {/* 发展时间线 */}
      <section className="intro-timeline-wrap">
        <h2 className="intro-h2">京剧发展时间线</h2>
        <div className="intro-timeline">
          {TIMELINE.map((e, i) => (
            <div className="tl-node" key={i} style={{ '--i': i }}>
              <div className="tl-dot" />
              <div className="tl-year">{e.year}</div>
              <div className="tl-title">{e.title}</div>
              <div className="tl-desc">{e.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 中国戏曲地图 · 源流叙事 */}
      <section>
        <h2 className="intro-h2">中国戏曲地图 · 京剧源流</h2>
        <p className="intro-note">
          京剧由多种地方声腔在北京融合而成。红线表示「徽班进京、徽汉合流」的路线，★ 标记北京（京剧形成地）。
          点击地图上的剧种可查看其来源，或点击「徽班进京」分步讲解，了解京剧如何由各地声腔融合形成。
        </p>
        <div className="map-layout">
          <Card title="各地戏曲剧种分布 · 京剧源流"
            action={step == null
              ? <button className="map-tour-btn" onClick={startTour}>▶ 徽班进京 · 分步讲解</button>
              : <button className="map-tour-btn ghost" onClick={endTour}>■ 结束讲解 · 看全景</button>}>
            <ReactECharts theme="opera-dark" option={mapOption}
              onEvents={onMapEvents} className="echart map" notMerge={step == null} />
          </Card>
          {step == null ? (
            <div className="map-panel" style={{ '--mp-accent': region.color }}>
              <span className="mp-tag">剧种简介</span>
              <div className="mp-head" style={{ color: region.color }}>
                {region.star ? '★ ' : ''}{region.name}
                <span className="mp-prov">{region.province}</span>
              </div>
              <p className="mp-intro">{region.intro}</p>
              <div className="mp-row"><span className="mp-k">代表剧目</span>
                <span className="mp-v">{region.plays.join('、')}</span></div>
              <div className="mp-row"><span className="mp-k">与京剧</span>
                <span className="mp-v">{region.rel}</span></div>
              <div className="mp-hint">▸ 点击地图上的圆点，查看其他剧种与京剧的渊源</div>
            </div>
          ) : (
            <div className="map-panel narrating">
              <div className="np-step">第 {step + 1} / {NARRATION.length} 步</div>
              <div className="np-title">{NARRATION[step].title}</div>
              <p className="np-desc">{NARRATION[step].desc}</p>
              <div className="np-dots">
                {NARRATION.map((_, i) => (
                  <span key={i} className={'np-dot' + (i === step ? ' on' : '')} onClick={() => go(i)} />
                ))}
              </div>
              <div className="np-actions">
                {step > 0 && <button className="np-btn ghost" onClick={() => go(step - 1)}>上一步</button>}
                {step < NARRATION.length - 1
                  ? <button className="np-btn" onClick={() => go(step + 1)}>下一步 →</button>
                  : <button className="np-btn" onClick={endTour}>看全景 ✓</button>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 行当 · 生旦净丑 */}
      <section>
        <h2 className="intro-h2">京剧行当 · 生旦净丑（与杂）</h2>
        <p className="intro-note">
          京剧把众多人物归入几个「行当」，每个行当有各自的扮相、唱法和身段。任务一就是对这套行当体系做分类。
        </p>
        <div className="role-grid">
          {ROLES.map((r) => (
            <div className="role-card" key={r.key} style={{ '--rc': r.color }}>
              <RoleImg src={r.img} color={r.color} label={r.key} />
              <div className="role-body">
                <div className="role-title"><b style={{ color: r.color }}>{r.key}</b>{r.title.slice(1)}</div>
                <p className="role-desc">{r.desc}</p>
                <div className="role-subs">
                  {r.subs.map((s) => <span className="role-tag" key={s}>{s}</span>)}
                </div>
                <div className="role-famous">代表 · {r.famous}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 脸谱色彩象征 */}
      <section>
        <h2 className="intro-h2">脸谱色彩 · 颜色与性格</h2>
        <p className="intro-note">净、丑会勾画脸谱，不同颜色代表不同性格，方便观众一眼分辨人物的忠奸善恶。</p>
        <div className="face-grid">
          {FACES.map((f) => (
            <div className="face-swatch" key={f.name}>
              <div className="fs-chip" style={{ background: f.c, color: f.dark ? '#2A2420' : '#FBF6EC' }}>{f.name}</div>
              <div className="fs-mean">{f.mean}</div>
              <div className="fs-who">{f.who}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 唱念做打 */}
      <section>
        <h2 className="intro-h2">四功 · 唱念做打</h2>
        <p className="intro-note">京剧表演的四项基本功，也正是任务四「戏剧强度曲线」的拆解依据。</p>
        <div className="skill-grid">
          {SKILLS.map((s) => (
            <div className="skill-card" key={s.k}>
              <div className="sk-k">{s.k}</div>
              <div className="sk-sub">{s.sub}</div>
              <p className="sk-desc">{s.desc}</p>
              <div className="sk-tie">{s.tie}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 剧目类型 */}
      <section>
        <h2 className="intro-h2">剧目类型 · 题材分类</h2>
        <p className="intro-note">不同题材的剧目，在人物关系、主题和叙事上各有特点，这也是任务二、三、五进行对比的维度。</p>
        <div className="genre-grid">
          {GENRES.map((g) => (
            <div className="genre-card" key={g.k} style={{ '--gc': g.color }}>
              <div className="gc-name" style={{ color: g.color }}>{g.k}</div>
              <p className="gc-desc">{g.desc}</p>
              <div className="gc-ex">如 {g.ex}</div>
              <div className="gc-tie">{g.tie}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="intro-cta">
        <div className="cta-text">导览结束，下面进入数据分析。</div>
        <button className="cta-enter" onClick={() => goto('overview')}>进入数据分析 →</button>
      </section>
    </div>
  )
}
