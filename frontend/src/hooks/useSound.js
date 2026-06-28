import { useEffect, useState } from 'react'
import sound from '../sound'

// 薄封装：订阅音效单例的状态变化，供控制面板等 UI 即时反映与调节。
export default function useSound() {
  const [state, setState] = useState(sound.getState())
  useEffect(() => sound.subscribe(setState), [])
  return {
    state,
    setMuted: sound.setMuted,
    setBgm: sound.setBgm,
    setSfx: sound.setSfx,
    setMusicVol: sound.setMusicVol,
    setSfxVol: sound.setSfxVol,
  }
}
