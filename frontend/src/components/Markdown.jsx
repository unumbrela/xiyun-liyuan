import React from 'react'

// 轻量零依赖 Markdown 渲染器：覆盖大模型常用语法（标题/粗斜体/行内码/链接/
// 无序与有序列表/引用/分隔线/围栏代码块/GFM 表格）。渲染为安全的 React 元素，
// 不用 dangerouslySetInnerHTML；对流式中途的不完整 Markdown 也能容错显示。

// —— 行内：粗体 / 斜体 / 行内代码 / 链接（单层，足够覆盖模型输出）——
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

function renderInline(text, keyBase) {
  const parts = String(text).split(INLINE)
  return parts.map((seg, i) => {
    if (!seg) return null
    const key = `${keyBase}-${i}`
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return <code key={key} className="ai-md-code">{seg.slice(1, -1)}</code>
    }
    if ((seg.startsWith('**') && seg.endsWith('**')) || (seg.startsWith('__') && seg.endsWith('__'))) {
      return <strong key={key}>{seg.slice(2, -2)}</strong>
    }
    if (seg.startsWith('*') && seg.endsWith('*')) {
      return <em key={key}>{seg.slice(1, -1)}</em>
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(seg)
    if (link) {
      return <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    }
    return <React.Fragment key={key}>{seg}</React.Fragment>
  })
}

function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const alignOf = (cell) => {
  const l = cell.startsWith(':'), r = cell.endsWith(':')
  return l && r ? 'center' : r ? 'right' : l ? 'left' : undefined
}

export default function Markdown({ content }) {
  const lines = String(content || '').replace(/\r/g, '').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // 围栏代码块 ```
    if (/^```/.test(line.trim())) {
      const body = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i++ }
      i++ // 跳过结尾 ```
      blocks.push(<pre key={blocks.length} className="ai-md-pre"><code>{body.join('\n')}</code></pre>)
      continue
    }

    // 标题 #..######
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const lvl = h[1].length
      const Tag = `h${Math.min(lvl + 2, 6)}` // 映射到较小号，贴合气泡尺寸
      blocks.push(<Tag key={blocks.length} className="ai-md-h">{renderInline(h[2], `h${i}`)}</Tag>)
      i++; continue
    }

    // 分隔线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} className="ai-md-hr" />)
      i++; continue
    }

    // GFM 表格：当前行含 | 且下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line)
      const aligns = splitRow(lines[i + 1]).map(alignOf)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i])); i++
      }
      blocks.push(
        <table key={blocks.length} className="ai-md-table">
          <thead><tr>{header.map((c, k) => (
            <th key={k} style={{ textAlign: aligns[k] }}>{renderInline(c, `th${i}-${k}`)}</th>
          ))}</tr></thead>
          <tbody>{rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, k) => (
              <td key={k} style={{ textAlign: aligns[k] }}>{renderInline(c, `td${ri}-${k}`)}</td>
            ))}</tr>
          ))}</tbody>
        </table>,
      )
      continue
    }

    // 引用块
    if (/^\s*>\s?/.test(line)) {
      const body = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, '')); i++
      }
      blocks.push(
        <blockquote key={blocks.length} className="ai-md-quote">
          {renderInline(body.join('\n'), `q${i}`)}
        </blockquote>,
      )
      continue
    }

    // 列表（有序 / 无序，连续行成组）
    if (/^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items = []
      while (i < lines.length && /^\s*([-*+]\s+|\d+[.)]\s+)/.test(lines[i])) {
        const txt = lines[i].replace(/^\s*([-*+]\s+|\d+[.)]\s+)/, '')
        items.push(<li key={items.length}>{renderInline(txt, `li${i}-${items.length}`)}</li>)
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={blocks.length} className="ai-md-list">{items}</Tag>)
      continue
    }

    // 段落：合并到下一个空行 / 块级起始
    const para = []
    while (i < lines.length && lines[i].trim()
           && !/^(#{1,6}\s|```|\s*>\s?|\s*([-*+]\s+|\d+[.)]\s+))/.test(lines[i])
           && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
           && !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])) {
      para.push(lines[i]); i++
    }
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className="ai-md-p">
          {para.map((ln, k) => (
            <React.Fragment key={k}>
              {k > 0 && <br />}
              {renderInline(ln, `p${blocks.length}-${k}`)}
            </React.Fragment>
          ))}
        </p>,
      )
    }
  }

  return <div className="ai-md">{blocks}</div>
}
