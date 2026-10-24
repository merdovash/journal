import { useEffect, useState, type FormEvent } from 'react'
import { BookOpen, ChevronLeft, Home, Settings } from 'lucide-react'
import { JournalApp } from './components/journal-app'
import { Button, Input, Label, LoadingState } from './components/ui'
import { portalHomeUrl, portalLoginUrl } from './lib/portalUrl'
import { useTheme } from './lib/useTheme'
import type { ThemeMode } from './lib/theme'
import { useAuthStore } from './store/authStore'

type Section = 'journal' | 'settings'

const NAV: { id: Section; label: string; icon: typeof BookOpen }[] = [
  { id: 'journal', label: 'Журнал', icon: BookOpen },
  { id: 'settings', label: 'Настройки', icon: Settings },
]

const SIDEBAR_KEY = 'journal-sidebar-collapsed'

export default function App() {
  const init = useAuthStore((state) => state.init)
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const [section, setSection] = useState<Section>('journal')
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  if (!initialized) {
    return (
      <main className="min-h-dvh">
        <LoadingState label="Загрузка…" />
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-dvh">
        <LoginGate />
      </main>
    )
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <AppMenu
        section={section}
        collapsed={collapsed}
        onSection={setSection}
        onCollapsed={setCollapsed}
      />
      <main
        className={`min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] transition-[margin] duration-200 md:pb-6 ${
          collapsed ? 'md:ml-14' : 'md:ml-56'
        }`}
      >
        {section === 'journal' ? <JournalApp /> : <SettingsPage />}
      </main>
    </div>
  )
}

function AppMenu({
  section,
  collapsed,
  onSection,
  onCollapsed,
}: {
  section: Section
  collapsed: boolean
  onSection: (section: Section) => void
  onCollapsed: (collapsed: boolean) => void
}) {
  return (
    <>
      <nav
        aria-label="Разделы"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              compact
              onSelect={onSection}
            />
          ))}
        </div>
      </nav>

      <aside
        className={`absolute inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card shadow-md transition-[width] duration-200 md:flex ${
          collapsed ? 'w-14' : 'w-56'
        }`}
        aria-label="Навигация"
      >
        <div className={`shrink-0 border-b border-border px-3 py-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <PortalHomeLink collapsed={collapsed} />
        </div>
        <nav className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 ${collapsed ? 'items-center' : ''}`}>
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              compact={collapsed}
              onSelect={onSection}
            />
          ))}
        </nav>
        <div className="shrink-0 space-y-2 border-t border-border bg-card p-2">
          {!collapsed ? <AccountControls /> : null}
          <button
            type="button"
            onClick={() => onCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <ChevronLeft className={`size-5 transition ${collapsed ? 'rotate-180' : ''}`} />
          </button>
          <AppVersion collapsed={collapsed} />
        </div>
      </aside>
    </>
  )
}

function NavButton({
  item,
  active,
  compact,
  onSelect,
}: {
  item: (typeof NAV)[number]
  active: boolean
  compact: boolean
  onSelect: (section: Section) => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      title={item.label}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
      className={`flex items-center rounded-lg font-medium ${
        compact
          ? 'min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 py-1.5 text-[10px] md:size-10 md:flex-none'
          : 'w-full gap-2.5 px-3 py-2 text-sm'
      } ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {compact ? <span className="leading-none md:sr-only">{item.label}</span> : <span>{item.label}</span>}
    </button>
  )
}

function PortalHomeLink({ collapsed }: { collapsed: boolean }) {
  const href = portalHomeUrl()
  return (
    <a
      href={href}
      title="На главную"
      aria-label="На главную"
      className={`flex items-center gap-2 rounded-lg text-foreground hover:bg-muted ${
        collapsed ? 'justify-center p-1.5' : 'px-1 py-0.5'
      }`}
    >
      <Home className="size-5 shrink-0 text-primary" aria-hidden />
      {collapsed ? null : <span className="text-sm font-semibold">Портал</span>}
    </a>
  )
}

function AccountControls() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  if (!user) return null
  return (
    <div className="space-y-2">
      <p className="truncate px-1 text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </p>
      <Button type="button" variant="outline" className="w-full" onClick={() => void logout()}>
        Выйти
      </Button>
    </div>
  )
}

function AppVersion({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <p
      className="select-none text-center text-[10px] leading-none text-muted-foreground"
      title={`Версия ${__APP_VERSION__}`}
    >
      {collapsed ? `v${__APP_VERSION__}` : `версия ${__APP_VERSION__}`}
    </p>
  )
}

function SettingsPage() {
  const { mode, setMode } = useTheme()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [startingBalance, setStartingBalance] = useState('')
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Не удалось загрузить настройки')
        if (!cancelled) {
          setStartingBalance(String(json.startingBalance))
          setReady(true)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить настройки')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = Number(startingBalance)
      if (!Number.isFinite(next)) throw new Error('Некорректное поле: начальная сумма')
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingBalance: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Ошибка сохранения')
      setStartingBalance(String(json.startingBalance))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Broker Journal</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Настройки</h1>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Тема оформления</h2>
        <select
          id="theme-mode"
          aria-label="Тема оформления"
          value={mode}
          onChange={(event) => setMode(event.target.value as ThemeMode)}
          className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="system">Как в системе</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
      </section>

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-medium">Счёт</h2>
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="starting-balance">Начальная сумма</Label>
          <Input
            id="starting-balance"
            required
            type="number"
            step="any"
            inputMode="decimal"
            disabled={!ready || Boolean(loadError)}
            value={startingBalance}
            onChange={(event) => setStartingBalance(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Баланс считается от этой суммы: плюс вводы и заработанное, минус выводы и маржа открытых позиций.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={!ready || busy} className="self-start">
          {busy ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </form>

      {user ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:hidden">
          <p className="truncate text-sm text-muted-foreground" title={user.email}>
            {user.email}
          </p>
          <Button type="button" variant="outline" onClick={() => void logout()}>
            Выйти
          </Button>
        </section>
      ) : null}
    </div>
  )
}

function LoginGate() {
  const portalUrl = portalLoginUrl()
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const loading = useAuthStore((state) => state.loading)
  const error = useAuthStore((state) => state.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password)
    } catch {
      /* сообщение уже лежит в store */
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Broker Journal</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">Журнал брокера</h1>
      <p className="mt-2 text-sm text-muted-foreground">Вход общий с хабом: одна cookie session на все поддомены.</p>

      {portalUrl ? (
        <a
          href={portalUrl}
          className="mt-8 flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Войти через Portal
        </a>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
          >
            {mode === 'login' ? 'Нет аккаунта — регистрация' : 'Уже есть аккаунт — войти'}
          </button>
        </form>
      )}
    </div>
  )
}
