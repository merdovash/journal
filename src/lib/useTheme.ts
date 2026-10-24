import { useEffect, useState } from 'react'
import { applyTheme, readThemeMode, storeThemeMode, type ThemeMode } from './theme'

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode())

  useEffect(() => {
    applyTheme(mode)
    function onSystemChange() {
      if (readThemeMode() === 'system') applyTheme('system')
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onSystemChange)
    return () => mq.removeEventListener('change', onSystemChange)
  }, [mode])

  function setMode(next: ThemeMode) {
    storeThemeMode(next)
    setModeState(next)
  }

  return { mode, setMode }
}
