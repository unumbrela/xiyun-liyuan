// 音效系统 · 模块级单例
// —— 既供 React 组件（控制面板）订阅，也供非 React 代码（useInteractions 的全局
//    pointerdown）直接调用，故采用单例而非纯 Hook。
//
// 设计要点：
//  · 短音效（click/nav/enter/notify）经 Web Audio 预解码为 buffer，低延迟、可重叠播放。
//  · 背景音乐用 HTMLAudioElement(loop)，配 rAF 渐变淡入淡出，不抢戏。
//  · 浏览器自动播放策略：AudioContext 与 BGM 必须等首次用户手势后才能出声，
//    故首次 pointerdown 调 unlock() 解锁并按需淡入 BGM。
//  · 总静音(muted) 覆盖一切；BGM / 音效可独立开关与调音量；全部持久化于 localStorage。
//  · 资源用 import.meta.env.BASE_URL 相对引用，兼容 dev 与 Electron file://。
//  · 资源缺失/解码失败仅告警，绝不抛错影响界面。

const ASSET = import.meta.env.BASE_URL // './'
const DIR = ASSET + 'sounds/'
const STORAGE_KEY = 'opera.sound'

// 短音效清单（name -> 文件名）
const SFX = {
  click: 'click.mp3',
  nav: 'nav.mp3',
  enter: 'enter.mp3',
  notify: 'notify.mp3',
}
const BGM_SRC = DIR + 'bgm-guqin.mp3'

const DEFAULTS = { muted: false, bgm: true, sfx: true, musicVol: 0.4, sfxVol: 0.7 }

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

let state = loadState()
const subscribers = new Set()

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}
function emit() {
  for (const cb of subscribers) { try { cb(state) } catch { /* ignore */ } }
}

// —— Web Audio（短音效）——
let ctx = null
let sfxGain = null
const buffers = new Map()      // name -> AudioBuffer
let preloaded = false
let lastClickAt = 0            // 点击音节流时间戳

function ensureCtx() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
    sfxGain = ctx.createGain()
    sfxGain.gain.value = state.sfxVol
    sfxGain.connect(ctx.destination)
  } catch { ctx = null }
  return ctx
}

async function decodeOne(name, file) {
  if (buffers.has(name) || !ctx) return
  try {
    const res = await fetch(DIR + file)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const arr = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(arr)
    buffers.set(name, buf)
  } catch (e) {
    console.warn('[sound] 加载音效失败:', file, e?.message || e)
  }
}

function preloadSfx() {
  if (preloaded || !ensureCtx()) return
  preloaded = true
  for (const [name, file] of Object.entries(SFX)) decodeOne(name, file)
}

// —— HTMLAudio（背景音乐）——
let bgmEl = null
let fadeRAF = 0

function ensureBgm() {
  if (bgmEl) return bgmEl
  try {
    bgmEl = new Audio()
    bgmEl.src = BGM_SRC
    bgmEl.loop = true
    bgmEl.preload = 'auto'
    bgmEl.volume = 0
    bgmEl.addEventListener('error', () =>
      console.warn('[sound] 背景音乐加载失败:', BGM_SRC))
  } catch { bgmEl = null }
  return bgmEl
}

// rAF 线性渐变到目标音量；到 0 时暂停以省资源
function fadeTo(target, ms = 1200) {
  const el = ensureBgm()
  if (!el) return
  cancelAnimationFrame(fadeRAF)
  const from = el.volume
  const t0 = performance.now()
  const step = (now) => {
    const k = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms)
    el.volume = Math.max(0, Math.min(1, from + (target - from) * k))
    if (k < 1) { fadeRAF = requestAnimationFrame(step) }
    else if (target <= 0.0001) { try { el.pause() } catch { /* ignore */ } }
  }
  fadeRAF = requestAnimationFrame(step)
}

// 依据当前状态决定 BGM 应播放/淡入还是淡出
function applyBgm(fade = true) {
  const el = ensureBgm()
  if (!el) return
  const want = !state.muted && state.bgm
  const target = want ? state.musicVol : 0
  if (want) {
    const p = el.play()
    if (p?.catch) p.catch(() => { /* 自动播放被拦截：等下次手势 */ })
  }
  if (fade) fadeTo(target)
  else { el.volume = target; if (!want) { try { el.pause() } catch { /* ignore */ } } }
}

// —— 对外 API ——
let inited = false
function init() {
  if (inited) return
  inited = true
  // 提前预解码短音效：decodeAudioData 在 AudioContext 挂起态下也可进行，
  // 故首次手势 unlock 时缓冲已就绪，入场磬能即时发声（出声本身仍须等手势）。
  preloadSfx()
}

// 首次用户手势：解锁 AudioContext、按需淡入 BGM、奏一记入场磬（仅生效一次）。
// 返回 true 表示本次正是首解锁（调用方可据此抑制该次点击音，避免与入场磬重叠）。
let unlocked = false
function unlock() {
  if (unlocked) return false
  unlocked = true
  const c = ensureCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => { /* ignore */ })
  preloadSfx()
  applyBgm(true)
  play('enter')                // 入场磬：踏入梨园的第一声
  return true
}

function play(name) {
  if (state.muted || !state.sfx) return
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ })
  if (name === 'click') {                       // 连点节流，避免「机关枪」
    const now = performance.now()
    if (now - lastClickAt < 60) return
    lastClickAt = now
  }
  const buf = buffers.get(name)
  if (!buf) { decodeOne(name, SFX[name]); return }  // 尚未就绪：触发加载，本次跳过
  try {
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(sfxGain)
    src.start(0)
  } catch { /* ignore */ }
}

function setMuted(v) {
  state = { ...state, muted: !!v }
  saveState(); applyBgm(true); emit()
}
function setBgm(v) {
  state = { ...state, bgm: !!v }
  saveState(); applyBgm(true); emit()
}
function setSfx(v) {
  state = { ...state, sfx: !!v }
  saveState(); emit()
}
function setMusicVol(v) {
  state = { ...state, musicVol: clamp01(v) }
  saveState()
  // 拖动调音用「即时赋值」而非淡变：fadeTo 含「到 0 即暂停」逻辑，仅适合开/关切换；
  // 若用于连续拖动，会在滑到底时把音频暂停且不再恢复，导致回拖也无声。这里直接设音量并保持播放。
  if (!state.muted && state.bgm) {
    const el = ensureBgm()
    if (el) {
      cancelAnimationFrame(fadeRAF)          // 取消可能在途的淡入淡出，避免与直接赋值互相覆盖
      el.volume = state.musicVol
      if (state.musicVol > 0 && el.paused) {  // 调音不应中断播放：被暂停过则恢复
        const p = el.play(); if (p?.catch) p.catch(() => { /* ignore */ })
      }
    }
  }
  emit()
}
function setSfxVol(v) {
  state = { ...state, sfxVol: clamp01(v) }
  saveState()
  if (sfxGain) sfxGain.gain.value = state.sfxVol
  emit()
}

function clamp01(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

function getState() { return state }
function subscribe(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

const sound = {
  init, unlock, play,
  setMuted, setBgm, setSfx, setMusicVol, setSfxVol,
  getState, subscribe,
}
export default sound
