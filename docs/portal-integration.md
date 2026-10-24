# Portal integration — Broker Journal ↔ project_hub

Журнал — дочерний сервис хаба в том же каркасе, что wallet: Vite SPA, API в middleware, общая база `finance`, cookie `session`.

Портал: `C:\projects\portal`. Каталог ведёт на `https://journal.<domain>`, Caddy делает `reverse_proxy` на `127.0.0.1:5175`. PM2 запускает `npm run preview -- --host 127.0.0.1 --port 5175`.

```
Browser ── cookie session ──► Caddy
                              ├─ example.com            portal (:5180)
                              └─ journal.example.com    journal (:5175)
                                         │
                                         └─ SHA-256(token) → sessions ⋈ users
```

## Auth

Журнал не держит отдельную учётную запись. Таблицы `users` и `sessions` общие с порталом.

Cookie `session`: случайные 32 байта hex, в базе только `token_hash` (SHA-256). Атрибуты: `HttpOnly; SameSite=Lax; Path=/`, в проде ещё `Secure` и `Domain` из `COOKIE_DOMAIN`.

`GET /api/auth/me` отвечает `{ user: { id, email } | null }`.

Есть `POST /api/auth/login`, `register`, `logout` — те же контракты, что у wallet. API журнала, свечей и OCR без сессии отвечает `401`.

Клиент при старте вызывает `/api/auth/me`. Если задан `VITE_PORTAL_URL`, кнопка «Войти через Portal» открывает `${VITE_PORTAL_URL}/?return=<текущий абсолютный URL>`. Портал после входа возвращает на этот адрес, если хост — тот же домен, localhost или `*.localhost`.

Sync хаба копирует в корень журнала `.env` с `DATABASE_URL`, `COOKIE_DOMAIN`, `PORTAL_URL` и `VITE_PORTAL_URL`. `VITE_*` попадает в клиент на этапе `npm run build`.

## База

`DATABASE_URL=postgresql://finance:finance@localhost:5432/finance`

Свои таблицы: `journal_opens`, `journal_closes`, `journal_settings`, плюс книга миграций `journal_schema_migrations`. `npm run db:migrate` идемпотентен и не переписывает чужие таблицы.

## Запись в каталоге портала

`config/services.yaml`:

- id `journal`, subdomain `journal`, port `5175`
- repo `https://github.com/merdovash/journal.git`, branch `main`
- `install: npm ci`, `migrate: npm run db:migrate`, `build: npm run build`

Отдельная команда `start` хабу не нужна: sync и так вызывает `npm run preview` с портом из yaml.

## PWA

Манифест и service worker живут на origin журнала (`journal.example.com`), scope `/`. Навигационный fallback не перехватывает `/api/`.
