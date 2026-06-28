import React, { useState, useRef, useEffect } from 'react'
import useSound from '../hooks/useSound'

// 宣纸风小开关（受控）
function Switch({ on, disabled, onChange }) {
  return (
    <button type="button"
      className={'sc-switch' + (on ? ' on' : '') + (disabled ? ' disabled' : '')}
      role="switch" aria-checked={on} disabled={disabled}
      onClick={() => !disabled && onChange(!on)}>
      <span className="sc-knob" />
    </button>
  )
}

// 侧栏声音控制：喇叭按钮 + 弹层（总静音 / 背景音乐开关·音量 / 交互音效开关·音量）。
export default function SoundControl() {
  const { state, setMuted, setBgm, setSfx, setMusicVol, setSfxVol } = useSound()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const muted = state.muted
  return (
    <div className="sound-ctl" ref={ref}>
      <button className={'sound-toggle' + (muted ? ' muted' : '')}
        title="声音设置" onClick={() => setOpen((o) => !o)}>
        <span className="sc-ico">{muted ? '🔇' : '🔊'}</span>
        <span className="sc-lab">声音{muted ? ' · 已静音' : ''}</span>
      </button>

      {open && (
        <div className="sound-pop" role="dialog" aria-label="声音设置">
          <div className="sp-head">声音设置</div>

          <div className="sp-row sp-master">
            <span>全部静音</span>
            <Switch on={muted} onChange={(v) => setMuted(v)} />
          </div>

          <div className={'sp-group' + (muted ? ' dim' : '')}>
            <div className="sp-row">
              <span>背景音乐</span>
              <Switch on={state.bgm} disabled={muted} onChange={(v) => setBgm(v)} />
            </div>
            <input type="range" className="sp-range" min="0" max="1" step="0.01"
              value={state.musicVol} disabled={muted || !state.bgm}
              onChange={(e) => setMusicVol(e.target.value)} aria-label="背景音乐音量" />

            <div className="sp-row">
              <span>交互音效</span>
              <Switch on={state.sfx} disabled={muted} onChange={(v) => setSfx(v)} />
            </div>
            <input type="range" className="sp-range" min="0" max="1" step="0.01"
              value={state.sfxVol} disabled={muted || !state.sfx}
              onChange={(e) => setSfxVol(e.target.value)} aria-label="交互音效音量" />
          </div>

          <div className="sp-foot">古琴《阳关三叠》· 点击有声</div>
        </div>
      )}
    </div>
  )
}
