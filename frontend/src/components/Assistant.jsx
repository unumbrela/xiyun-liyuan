import React, { useEffect, useRef, useState } from 'react'
import { chatStream, api } from '../api'
import Markdown from './Markdown'

// 各模块的快捷追问（随当前模块切换），降低用户冷启动成本。
const QUICK = {
  overview: ['这个数据集的核心发现有哪些？', '哪些剧目的关系网络规模最大？'],
  task1: ['不同行当在唱念做打上有何区别？', '行当分类模型的可信度如何？'],
  task2: ['哪些公案戏的中心势最高？', '各剧目类型的网络结构差异是什么？'],
  task3: ['12 个主题母题怎么划分？', '“父子”主题下有哪些代表剧目？'],
  task4: ['典型的叙事弧线有哪几种？', '哪些剧目是结尾陡升式？'],
  task5: ['四维之间有哪些显著的协同关系？', '综合原型反映了什么规律？'],
}
const MODULE_NAME = {
  overview: '总览', task1: '行当分类', task2: '角色关系网络',
  task3: '主题提取', task4: '叙事结构', task5: '综合关联',
}

// 工具 → 展示元数据（图标 + 中文名 + 关键参数提取）。
const TOOL_META = {
  search_plays: { icon: '🔍', label: '检索剧目',
    arg: (a) => [a.name, a.drama_type, a.role && a.role + '角', a.period,
      a.sort && '按' + a.sort].filter(Boolean).join(' · ') },
  get_play: { icon: '📄', label: '取剧目画像', arg: (a) => a.play_id || '' },
  compare_plays: { icon: '⚖️', label: '对比剧目', arg: (a) => (a.play_ids || []).join(' vs ') },
  corpus_stat: { icon: '📊', label: '全库结论', arg: (a) => a.task || '' },
  topic_plays: { icon: '🏷️', label: '主题代表剧', arg: (a) => 'T' + a.topic_id },
  arc_plays: { icon: '📈', label: '弧线代表剧', arg: (a) => '弧线' + a.arc_id },
  corr_findings: { icon: '🔗', label: '四维相关', arg: () => '' },
}

const GREETING = {
  role: 'assistant',
  content: '你好，我是「梨园谱系」AI 分析智能体。我会实时检索系统算出的指标来回答你——'
    + '行当、关系网络、主题、叙事到四维综合，问我具体剧目、跨库规律或两剧对比都行。',
}

// AI 配置（Key + 模型）持久化在 localStorage，随每次请求下发，免重启后端。
const LS_KEY = 'opera.ai.key'
const LS_MODEL = 'opera.ai.model'
const lsGet = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }

export default function Assistant({ selected, active }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef(null)
  const listRef = useRef(null)

  // AI 设置
  const [showCfg, setShowCfg] = useState(false)
  const [apiKey, setApiKey] = useState(() => lsGet(LS_KEY))
  const [model, setModel] = useState(() => lsGet(LS_MODEL))
  const [showKey, setShowKey] = useState(false)
  const [catalog, setCatalog] = useState({ models: [], recommended: '', server_has_key: false, provider: '' })

  useEffect(() => {
    api.aiModels().then((d) => {
      setCatalog(d)
      setModel((m) => m || lsGet(LS_MODEL) || d.recommended || '')
    }).catch(() => { /* 后端未就绪，忽略；发送时会有兜底提示 */ })
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, open])

  const persist = (key, mdl) => {
    try {
      localStorage.setItem(LS_KEY, key)
      localStorage.setItem(LS_MODEL, mdl)
    } catch { /* ignore */ }
  }

  const saveCfg = () => {
    const k = apiKey.trim()
    setApiKey(k)
    persist(k, model)
    setShowCfg(false)
  }

  const hasKey = !!apiKey.trim() || catalog.server_has_key
  const curModel = catalog.models.find((m) => m.id === model)
  const modelLabel = curModel?.name || model || catalog.recommended || '默认模型'

  // 按 provider 分组模型，供下拉 optgroup 渲染。
  const groups = catalog.models.reduce((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m)
    return acc
  }, {})

  // 更新最后一条 assistant 消息（追加文本 / 记录工具轨迹）。
  const patchLast = (fn) => setMsgs((prev) => {
    const next = prev.slice()
    next[next.length - 1] = fn(next[next.length - 1])
    return next
  })

  const onEvent = (ev) => patchLast((last) => {
    const trace = (last.trace || []).slice()
    if (ev.t === 'tool') {
      trace.push({ name: ev.name, args: ev.args || {}, summary: '检索中…', done: false })
    } else if (ev.t === 'tool_result') {
      // 回填最近一条未完成、同名的轨迹。
      for (let i = trace.length - 1; i >= 0; i--) {
        if (!trace[i].done && trace[i].name === ev.name) {
          trace[i] = { ...trace[i], summary: ev.summary, done: true }; break
        }
      }
    }
    return { ...last, trace }
  })

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    if (!hasKey) { setShowCfg(true); return }
    setInput('')
    const history = [...msgs, { role: 'user', content }]
    setMsgs([...history, { role: 'assistant', content: '', trace: [] }])
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await chatStream(
        {
          // 只发送 role/content，剥离前端的 trace 等附加字段。
          messages: history.filter((m) => m !== GREETING).map((m) => ({ role: m.role, content: m.content })),
          play_id: selected?.play_id || null,
          module: active,
          api_key: apiKey.trim() || null,
          model: model || null,
        },
        (tok) => patchLast((last) => ({ ...last, content: last.content + tok })),
        onEvent,
        ctrl.signal,
      )
    } catch (e) {
      if (e.name !== 'AbortError') {
        patchLast((last) => ({
          ...last,
          content: (last.content || '') + '\n\n⚠️ 连接后端失败，请确认后端已启动。',
        }))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const stop = () => { abortRef.current?.abort() }
  const clear = () => { if (!busy) setMsgs([GREETING]) }
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const quick = QUICK[active] || QUICK.overview

  return (
    <>
      <button className={'ai-fab' + (open ? ' hidden' : '')}
        onClick={() => setOpen(true)} title="AI 分析助手">
        <span className="ai-fab-cn">问</span>
      </button>

      <div className={'ai-panel' + (open ? ' open' : '')}>
        <div className="ai-head">
          <div className="ai-head-l">
            <span className="ai-dot" />
            <div>
              <div className="ai-title">梨园谱系 · AI 智能体</div>
              <div className="ai-sub">
                {MODULE_NAME[active] || '总览'}
                {selected ? ` · 《${selected.title}》` : ''}
                {' · '}<span className="ai-model-tag" title={model}>{modelLabel}</span>
                {!hasKey && <span className="ai-nokey"> · 未配置 Key</span>}
              </div>
            </div>
          </div>
          <div className="ai-head-r">
            <button className={'ai-icon-btn' + (showCfg ? ' on' : '') + (!hasKey ? ' warn' : '')}
              onClick={() => setShowCfg((v) => !v)} title="模型与 API Key 设置">设置</button>
            <button className="ai-icon-btn" onClick={clear} title="清空对话">清空</button>
            <button className="ai-icon-btn" onClick={() => setOpen(false)} title="收起">×</button>
          </div>
        </div>

        {showCfg && (
          <div className="ai-cfg">
            <div className="ai-cfg-row">
              <label>API Key</label>
              <div className="ai-cfg-key">
                <input type={showKey ? 'text' : 'password'} value={apiKey}
                  placeholder={catalog.server_has_key ? '（服务端已内置，可留空）' : 'sk-…'}
                  onChange={(e) => setApiKey(e.target.value)} spellCheck={false} autoComplete="off" />
                <button className="ai-cfg-eye" onClick={() => setShowKey((v) => !v)}
                  title={showKey ? '隐藏' : '显示'}>{showKey ? '隐' : '显'}</button>
              </div>
              <a className="ai-cfg-link" href="https://platform.deepseek.com" target="_blank" rel="noreferrer">
                DeepSeek 原生 Key 在 platform.deepseek.com 获取；ZenMux Key 在 zenmux.ai
              </a>
            </div>
            <div className="ai-cfg-row">
              <label>模型</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {!catalog.models.length && <option value="">默认（推荐）</option>}
                {Object.entries(groups).map(([prov, list]) => (
                  <optgroup key={prov} label={prov}>
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.recommended ? '⭐ ' : ''}{m.name}
                        {m.supports_tools === false ? '（不支持工具·降级）' : ''}
                        {m.price ? `（${m.price}/M）` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {curModel?.hint && <div className="ai-cfg-hint">{curModel.hint}</div>}
            </div>
            <div className="ai-cfg-foot">
              <button className="ai-cfg-save" onClick={saveCfg}>保存</button>
              <span className="ai-cfg-note">配置仅保存在本机浏览器，随对话发送给本地后端。</span>
            </div>
          </div>
        )}

        <div className="ai-msgs" ref={listRef}>
          {msgs.map((m, i) => (
            <div key={i} className={'ai-msg ' + m.role}>
              {m.role === 'assistant' && m.trace?.length > 0 && <Trace trace={m.trace} />}
              <div className="ai-bubble">
                {m.content
                  ? (m.role === 'assistant' ? <Markdown content={m.content} /> : m.content)
                  : (busy && i === msgs.length - 1 && !(m.trace?.length)
                    ? <span className="ai-typing"><i /><i /><i /></span> : '')}
              </div>
            </div>
          ))}
        </div>

        <div className="ai-quick">
          {quick.map((q) => (
            <button key={q} disabled={busy} onClick={() => send(q)}>{q}</button>
          ))}
        </div>

        <div className="ai-input">
          <textarea rows={2} value={input} placeholder="问问这部剧、或任意分析结论…（Enter 发送，Shift+Enter 换行）"
            onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy} />
          {busy
            ? <button className="ai-send stop" onClick={stop}>停止</button>
            : <button className="ai-send" onClick={() => send()} disabled={!input.trim()}>发送</button>}
        </div>
      </div>
    </>
  )
}

// 智能体检索轨迹：可折叠的工具调用小卡，展示「检索→作答」过程。
function Trace({ trace }) {
  const [open, setOpen] = useState(true)
  const running = trace.some((t) => !t.done)
  return (
    <div className={'ai-trace' + (running ? ' running' : '')}>
      <button className="ai-trace-head" onClick={() => setOpen((v) => !v)}>
        <span className="ai-trace-spark">{running ? '◐' : '✓'}</span>
        检索过程 · {trace.length} 步
        <span className="ai-trace-toggle">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="ai-trace-body">
          {trace.map((t, i) => {
            const meta = TOOL_META[t.name] || { icon: '⚙️', label: t.name, arg: () => '' }
            const arg = meta.arg(t.args)
            return (
              <div key={i} className={'ai-trace-step' + (t.done ? ' done' : '')}>
                <span className="ai-trace-ico">{meta.icon}</span>
                <span className="ai-trace-name">{meta.label}</span>
                {arg && <span className="ai-trace-arg">{arg}</span>}
                <span className="ai-trace-sum">{t.summary}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
