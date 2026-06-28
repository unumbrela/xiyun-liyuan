// 生产（桌面应用）下由 preload 注入后端绝对地址；开发态为空串，走 Vite 代理。
const BASE = (typeof window !== 'undefined' && window.OPERA_API_BASE) || ''

// 统一 GET：带超时（AbortController），失败时抛出可读 Error 供上层捕获展示，
// 避免请求悬挂导致界面永远停在「载入中」。
const TIMEOUT_MS = 20000
const get = async (url) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(BASE + url, { signal: ctrl.signal })
    if (!r.ok) {
      let detail = ''
      try { detail = (await r.json())?.detail || '' } catch { /* 非 JSON 错误体 */ }
      throw new Error(`请求失败 ${r.status}${detail ? '：' + detail : ''}（${url}）`)
    }
    return await r.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`请求超时（${url}）`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  quality: () => get('/api/quality'),
  overview: () => get('/api/overview'),
  metrics: () => get('/api/task1/metrics'),
  patterns: () => get('/api/task1/patterns'),
  temporal: () => get('/api/task1/temporal'),
  distribution: () => get('/api/task1/distribution'),
  subroles: () => get('/api/task1/subroles'),
  meta: () => get('/api/meta'),
  plays: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString()
    return get('/api/plays?' + q)
  },
  play: (id) => get('/api/play/' + id),
  inferred: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString()
    return get('/api/task1/inferred?' + q)
  },
  // 任务二
  typestats: () => get('/api/task2/typestats'),
  netScatter: () => get('/api/task2/scatter'),
  netPlays: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString()
    return get('/api/task2/plays?' + q)
  },
  network: (id) => get('/api/task2/network/' + id),
  // 任务三
  topics: () => get('/api/task3/topics'),
  topicPatterns: () => get('/api/task3/patterns'),
  topicPlays: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString()
    return get('/api/task3/plays?' + q)
  },
  topicPlay: (id) => get('/api/task3/play/' + id),
  // 任务四
  narPatterns: () => get('/api/task4/patterns'),
  narPlays: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString()
    return get('/api/task4/plays?' + q)
  },
  narPlay: (id) => get('/api/task4/play/' + id),
  // 任务五
  synCorr: () => get('/api/task5/corr'),
  synSankey: () => get('/api/task5/sankey'),
  synArchetypes: () => get('/api/task5/archetypes'),
  synPlays: (p = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)).toString()
    return get('/api/task5/plays?' + q)
  },
  synPlay: (id) => get('/api/task5/play/' + id),
  // AI：可选模型清单 + 推荐项 + 服务端是否已内置 Key。
  aiModels: () => get('/api/ai/models'),
}

// AI 助手：调用后端 /api/chat 智能体流式接口（SSE）。
// body: { messages, play_id, module, api_key, model }
// onToken(text)：答案文本块；onEvent(evt)：工具轨迹事件 { t:'tool'|'tool_result', ... }。
// signal: AbortController.signal（可中断）。
export async function chatStream(body, onToken, onEvent, signal) {
  const resp = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok || !resp.body) throw new Error('chat 请求失败：' + resp.status)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // 按 SSE 事件分隔（空行）切分，逐条解析 data: 行。
    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const evt = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const line = evt.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const data = line.slice(5).replace(/^ /, '')
      if (data === '[DONE]') return
      // 工具轨迹事件是完整 JSON（带 t 字段，未转义）；答案文本是转义过的纯文本。
      const ctrl = tryParseEvent(data)
      if (ctrl) { onEvent?.(ctrl); continue }
      onToken(data.replace(/\\n/g, '\n').replace(/\\\\/g, '\\'))
    }
  }
}

function tryParseEvent(data) {
  if (data[0] !== '{') return null
  try {
    const o = JSON.parse(data)
    return (o && (o.t === 'tool' || o.t === 'tool_result')) ? o : null
  } catch { return null }
}

// 配色 token 统一由 theme.js（单一真相源）定义；此处重导出，兼容现有 `from './api'` 引用。
export { ROLE_COLORS, TOPIC_COLORS } from './theme'
