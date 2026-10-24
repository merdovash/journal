import { useEffect, useState, type FormEvent } from 'react'
import { JournalApp } from './components/journal-app'
import { Button, Input, Label, LoadingState } from './components/ui'
import { portalLoginUrl } from './lib/portalUrl'
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
      <main className="min-h-dvh">
        <LoginGate />
      </main>
    )
  }

  return (
    <main className="min-h-dvh">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-3 px-4 pt-4 sm:px-6">
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
