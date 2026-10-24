export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'journal-theme'

/** Brand green for PWA/status bar — darker in dark mode so it does not glow. */
export const THEME_COLOR_LIGHT = '#1f7a54'
export const THEME_COLOR_DARK = '#14543a'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

export function readThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

function setMetaThemeColor(color: string) {
  const metas = document.querySelectorAll('meta[name="theme-color"]')
  if (metas.length === 0) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = color
    document.head.appendChild(meta)
    return
  }
  metas.forEach((meta) => {
    meta.setAttribute('content', color)
  })
}

function setAppleStatusBar(resolved: 'light' | 'dark') {
  let meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default')
}

export function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  setMetaThemeColor(resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT)
  setAppleStatusBar(resolved)
  return resolved
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  applyTheme(mode)
}
