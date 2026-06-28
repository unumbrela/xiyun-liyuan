import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Intro from './modules/Intro'
import Overview from './modules/Overview'
import Conclusion from './modules/Conclusion'
import Task1 from './modules/Task1'
import Task2 from './modules/Task2'
import Task3 from './modules/Task3'
import Task4 from './modules/Task4'
import Task5 from './modules/Task5'
import PlayCompare from './components/PlayCompare'
import TitleBar from './components/TitleBar'
import Splash from './components/Splash'
import PlaySearch from './components/PlaySearch'
import Assistant from './components/Assistant'
import ErrorBoundary from './components/ErrorBoundary'
import GuidedTour from './components/GuidedTour'
import AmbientCanvas from './components/AmbientCanvas'
import CrossLinks from './components/CrossLinks'
import SoundControl from './components/SoundControl'
import sound from './sound'
import useInteractions from './hooks/useInteractions'
import useReveal from './hooks/useReveal'
import { TYPE_COLORS } from './theme'

const NAV = [
  { id: 'intro', icon: '梨', name: '开篇导览', sub: '京剧介绍' },
  { id: 'overview', icon: '◇', name: '总览', sub: '数据概况' },
  { id: 'task1', icon: '生', name: '行当分类', sub: '任务一' },
  { id: 'task2', icon: '关', name: '角色关系网络', sub: '任务二' },
  { id: 'task3', icon: '题', name: '主题提取', sub: '任务三' },
  { id: 'task4', icon: '叙', name: '叙事结构', sub: '任务四' },
  { id: 'task5', icon: '合', name: '综合关联', sub: '任务五' },
  { id: 'compare', icon: '比', name: '双剧对比', sub: '四维横向' },
  { id: 'conclusion', icon: '韵', name: '结语总结', sub: '总结与展望' },
]

const VALID = new Set(NAV.map((n) => n.id))
const BASE = (typeof window !== 'undefined' && window.OPERA_API_BASE) || ''

// 轮询后端 /api/health，就绪后拉开幕布；之后转为慢心跳持续纠正可达状态，
// 后端恢复即自动清除横幅、掉线即自动提示（自愈，不会卡在陈旧的"未连接"）。
function useBackendReady() {
  const [phase, setPhase] = useState('booting') // booting -> open -> done
  const [health, setHealth] = useState(null)    // { ok, degraded, missing } | null
  const [reachable, setReachable] = useState(true)
  useEffect(() => {
    let alive = true
    let revealed = false
    let timer = null
    const reveal = () => {                      // 仅负责拉开幕布（一次性）
      if (revealed || !alive) return
      revealed = true
      setPhase('open')
      setTimeout(() => alive && setPhase('done'), 950)
    }
    const poll = async () => {
      let ok = false
      try {
        const r = await fetch(BASE + '/api/health')
        if (r.ok) {
          ok = true
          // 仅当内容变化时才更新，避免每次慢心跳都产生新对象触发全树重渲染（卡顿源）
          try {
            const next = await r.json()
            setHealth((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
          } catch { /* ignore */ }
        }
      } catch { /* 后端尚未就绪/不可达 */ }
      if (!alive) return
      setReachable(ok)                         // 双向更新：恢复→清横幅，掉线→提示
      if (ok) reveal()
      timer = setTimeout(poll, revealed ? 5000 : 500)  // 揭幕前快轮询、之后慢心跳
    }
    poll()
    const fallback = setTimeout(reveal, 15000)  // 兜底：后端长时间无响应也进入界面
    return () => { alive = false; clearTimeout(fallback); clearTimeout(timer) }
  }, [])
  return { phase, health, reachable }
}

const TYPE_LIST = ['历史戏', '家庭戏', '公案戏', '神怪戏', '其他']

export default function App() {
  const [active, setActive] = useState(() => {
    const h = window.location.hash.slice(1)
    return VALID.has(h) ? h : 'intro'
  })
  const go = useCallback((id) => { sound.play('nav'); setActive(id); window.location.hash = id }, [])
  const { phase, health, reachable } = useBackendReady()
  useInteractions()
  useReveal(active)

  // 音效系统初始化：预解码音效缓冲。真正出声须等首次用户手势（见 useInteractions 的 unlock），
  // 届时奏入场磬、淡入背景音乐——这是浏览器自动播放策略下唯一可靠的入场时机。
  useEffect(() => { sound.init() }, [])

  // 桌面应用：订阅主进程推送的后端异常事件，进入降级横幅。
  const [desktopFault, setDesktopFault] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined' && window.opera?.onBackendStatus) {
      window.opera.onBackendStatus((_c, m) => setDesktopFault(m || '后端异常'))
    }
  }, [])

  // 全局选中剧目：跨模块联动的单一真相源（localStorage 持久）。
  const [selectedPlay, setSelectedPlay] = useState(() => {
    try { return JSON.parse(localStorage.getItem('opera.play') || 'null') }
    catch { return null }
  })
  const onSelect = useCallback((p) => {
    setSelectedPlay(p)
    try { localStorage.setItem('opera.play', JSON.stringify(p)) } catch { /* ignore */ }
  }, [])
  const clearPlay = useCallback(() => { setSelectedPlay(null); localStorage.removeItem('opera.play') }, [])

  // 全局跨图筛选：剧目类型过滤，五任务全库视图统一响应（点击图表/选择即广播）。
  const [filter, setFilter] = useState({ dramaType: '' })
  const onFilter = useCallback((f) => setFilter((prev) => ({ ...prev, ...f })), [])
  const clearFilter = useCallback(() => setFilter({ dramaType: '' }), [])
  // 稳定引用：仅在真正联动数据变化时重建，避免无关 App 状态（心跳/横幅/导览）触发模块重渲染
  const link = useMemo(
    () => ({ selected: selectedPlay, onSelect, filter, onFilter }),
    [selectedPlay, onSelect, filter, onFilter],
  )

  const banner = desktopFault
    || (!reachable ? '后端未连接：数据暂不可用，请确认后端已启动后刷新。'
      : (health?.degraded ? `部分数据产物缺失（${(health.missing || []).join('、')}），相关模块可能不可用。` : ''))

  // 横幅由无到有（后端掉线/降级）时，轻提示一声
  const prevBanner = useRef('')
  useEffect(() => {
    if (banner && !prevBanner.current) sound.play('notify')
    prevBanner.current = banner
  }, [banner])

  // 引导式导览：首次进入自动弹出，之后可由侧栏「导览」按钮重开。
  const [tourOpen, setTourOpen] = useState(false)
  useEffect(() => {
    // 开篇导览为默认首屏；功能引导仅在用户步入分析（离开 intro）后首访才弹出，避免盖住开篇页。
    if (phase === 'done' && active !== 'intro' && !localStorage.getItem('opera.tour.seen')) setTourOpen(true)
  }, [phase, active])
  const closeTour = () => {
    setTourOpen(false)
    try { localStorage.setItem('opera.tour.seen', '1') } catch { /* ignore */ }
  }

  return (
    <>
      <div className="ambient" aria-hidden="true"><span className="ink-blob" /></div>
      <AmbientCanvas />
      <div className="ink-ripple-layer" aria-hidden="true" />
      <TitleBar />
      {phase !== 'done' && (
        <Splash status={phase === 'booting' ? 'booting' : 'ready'}
          open={phase !== 'booting'} done={false} />
      )}
      <div className="app-body">
        {banner && <div className="app-banner">{banner}</div>}
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-cn">戏韵</div>
              <div className="brand-sub">梨园谱系</div>
            </div>
            <PlaySearch onSelect={onSelect} />
            {selectedPlay && (
              <div className="play-chip" title="跨模块联动中的当前剧目">
                <span className="pc-dot" />
                <span className="pc-title">《{selectedPlay.title}》</span>
                <button className="pc-link" onClick={() => go('task5')} title="查看四维联动档案">四维</button>
                <button className="pc-x" onClick={clearPlay} title="清除选中">×</button>
              </div>
            )}
            <div className="filter-bar" title="跨模块剧目类型筛选：五任务全库视图统一响应">
              <select className="filter-select" value={filter.dramaType}
                onChange={(e) => onFilter({ dramaType: e.target.value })}>
                <option value="">全部剧目类型（不筛选）</option>
                {TYPE_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {filter.dramaType && (
                <button className="pc-x" onClick={clearFilter} title="清除类型筛选">×</button>
              )}
            </div>
            <nav>
              {NAV.map((n) => (
                <button key={n.id}
                  className={'nav-item' + (active === n.id ? ' active' : '') + (n.soon ? ' soon' : '')}
                  onClick={() => !n.soon && go(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  <span className="nav-txt">
                    <span className="nav-name">{n.name}</span>
                    <span className="nav-sub">{n.sub}{n.soon ? ' · 待建' : ''}</span>
                  </span>
                </button>
              ))}
            </nav>
            <div className="sidebar-foot">
              <div className="foot-actions">
                <button className="tour-reopen" onClick={() => setTourOpen(true)}>功能导览</button>
                <SoundControl />
              </div>
              ChinaVis 2026<br />赛题 1-I · 京剧数据集<br />1473 剧 · 36 万对白
            </div>
          </aside>

          <main className="content">
            {filter.dramaType && ['task1', 'task2', 'task3', 'task4', 'task5', 'compare'].includes(active) && (
              <div className="active-filter-bar">
                <span>跨图筛选中</span>
                <span className="afb-type" style={{ '--c': TYPE_COLORS[filter.dramaType] }}>{filter.dramaType}</span>
                <button className="afb-x" onClick={clearFilter} title="清除类型筛选">清除 ×</button>
              </div>
            )}
            {selectedPlay?.play_id && ['task1', 'task2', 'task3', 'task4', 'task5'].includes(active) && (
              <CrossLinks current={active} goto={go} play={selectedPlay} />
            )}
            <div className="module-anim" key={active}>
              <ErrorBoundary resetKey={active}>
                {active === 'intro' && <Intro goto={go} ready={phase === 'done'} />}
                {active === 'overview' && <Overview goto={go} onFilter={onFilter} />}
                {active === 'task1' && <Task1 {...link} />}
                {active === 'task2' && <Task2 {...link} />}
                {active === 'task3' && <Task3 {...link} />}
                {active === 'task4' && <Task4 {...link} />}
                {active === 'task5' && <Task5 {...link} />}
                {active === 'compare' && <PlayCompare selected={selectedPlay} />}
                {active === 'conclusion' && <Conclusion goto={go} />}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
      <Assistant selected={selectedPlay} active={active} />
      {tourOpen && phase === 'done' && <GuidedTour onClose={closeTour} />}
    </>
  )
}
