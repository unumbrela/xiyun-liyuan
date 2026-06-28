import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'

// 全局剧名搜索：选中后通过 onSelect 设为全局当前剧目，驱动各模块联动。
export default function PlaySearch({ onSelect }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!q.trim()) { setRes([]); return }
    let alive = true
    const t = setTimeout(() => {
      api.plays({ q: q.trim(), limit: 8 }).then((d) => {
        if (alive) { setRes(d.plays || []); setOpen(true) }
      })
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (p) => {
    onSelect({ play_id: p.play_id, title: p.title })
    setQ(''); setRes([]); setOpen(false)
  }

  return (
    <div className="play-search" ref={box}>
      <input placeholder="🔍 全局搜索剧目…" value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res.length && setOpen(true)} />
      {open && res.length > 0 && (
        <ul className="play-search-pop">
          {res.map((p) => (
            <li key={p.play_id} onClick={() => choose(p)}>
              <span className="ps-title">{p.title}</span>
              <span className="ps-meta">{p.period} · {p.n_roles}角</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
