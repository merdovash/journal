import { useEffect, useState, type FormEvent } from 'react'
import { JournalApp } from './components/journal-app'
import { Button, Input, Label, LoadingState } from './components/ui'
import { portalLoginUrl } from './lib/portalUrl'
import { useTheme } from './lib/useTheme'
import type { ThemeMode } from './lib/theme'
import { useAuthStore } from './store/authStore'

export default function App() {
  const init = useAuthStore((state) => state.init)
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    void init()
  }, [init])

  if (!initialized) {
    return (
      <main className="min-h-dvh">
        <LoadingState label="Загрузка…" />
      </main>
    )
  }

  if (!user) {
    return (
      <main className="relative min-h-dvh">
        <div className="absolute right-4 top-4 z-10 flex items-center gap-3">
          <AppVersion />
          <ThemeControl />
        </div>
        <LoginGate />
      </main>
    )
  }

  return (
    <main className="min-h-dvh">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-end gap-3 px-4 pt-4 sm:px-6">
        <AppVersion />
        <ThemeControl />
        <p className="truncate text-xs text-muted-foreground" title={user.email}>
          {user.email}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
          Выйти
        </Button>
      </div>
      <JournalApp />
    </main>
  )
}

function AppVersion() {
  return (
    <p
      className="shrink-0 select-none text-[10px] leading-none text-muted-foreground"
      title={`Версия ${__APP_VERSION__}`}
    >
      версия {__APP_VERSION__}
    </p>
  )
}

function ThemeControl() {
  const { mode, setMode } = useTheme()

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Тема</span>
      <select
        aria-label="Тема оформления"
        value={mode}
        onChange={(event) => setMode(event.target.value as ThemeMode)}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="system">Как в системе</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
    </label>
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
