# Журнал брокера

Русскоязычный PWA-журнал открытий и закрытий фьючерсов: реестр операций, виджеты баланса, стековые карточки с графиками Yahoo Finance.

## Структура монорепо

```
apps/broker-journal   — Next.js App Router (UI, API, Prisma, PWA)
packages/ui           — @broker-journal/ui: StackedPanel + примитивы (Button, Input, …)
```

Пакет UI рассчитан на переиспользование (в т.ч. будущий wallet). Исходники wallet в этой среде недоступны — стек панелей реализован здесь с нуля (push/pop/overlay/back).

## Требования

- Node.js 20+
- pnpm 10+
- PostgreSQL 16 (локально или через Docker)

## Быстрый старт

```bash
# 1. Postgres
docker compose up -d

# 2. Env
cp .env.example apps/broker-journal/.env
# DATABASE_URL=postgresql://broker:broker@localhost:5432/broker_journal?schema=public

# 3. Зависимости
pnpm install

# 4. Миграции и сид
pnpm --filter @broker-journal/app exec prisma migrate dev --name init
pnpm db:seed

# 5. Dev-сервер (0.0.0.0:43127)
pnpm dev
```

Откройте [http://127.0.0.1:43127](http://127.0.0.1:43127).

### Без Docker

Поднимите PostgreSQL сами и укажите `DATABASE_URL` в `apps/broker-journal/.env`. Пример из `.env.example` совпадает с `docker-compose.yml`.

## Возможности

- Реестр на `/` со счётчиками: **баланс**, **вложено**, **заработано**, **комиссии**
- Карточки на **стековых панелях** (не отдельных роутах): просмотр / правка / создание открытия и закрытия
- Deep-link: `?stack=open:<id>` / `?stack=close:<id>`
- Свечи: `GET /api/candles?symbol=&from=&to&interval=5m` через `yahoo-finance2` (**не хранятся** в БД)
- Графики: Lightweight Charts (SL/TP линии, маркеры входа/выхода)
- PWA: manifest, иконки 192/512, service worker (`@ducanh2912/next-pwa`, в production-сборке; в `dev` отключён). Online-first для API.

## Модель данных (Prisma)

- `TradeOpen` — открытие
- `TradeClose` — закрытие с уникальным `openId` (открытие при закрытии **не мутируется**)
- `BrokerSettings` — singleton `startingBalance`

Формулы — в `apps/broker-journal/src/lib/journal.ts` (long PnL в первом срезе).

## Скрипты

| Команда | Описание |
|--------|----------|
| `pnpm dev` | Dev-сервер на порту 43127 |
| `pnpm build` | Сборка UI + app |
| `pnpm db:push` | Prisma db push |
| `pnpm db:seed` | Пример сделок |
| `pnpm db:migrate` | `prisma migrate deploy` |

## Установка как PWA

После `pnpm build && pnpm --filter @broker-journal/app start` откройте сайт в Chrome/Edge → «Установить приложение» / Add to Home Screen. В режиме `dev` SW не регистрируется.

## Интеграция с project_hub (portal)

Авторизация **живёт в portal** (`C:\projects\portal` на машине пользователя). Журнал не рисует login UI.

**Подход:** reverse-proxy / Next.js rewrites portal → journal под путём `/broker` (не iframe по умолчанию).

Кратко:

1. Portal владеет сессией / JWT.
2. Journal принимает identity: cookie JWT, `Authorization: Bearer`, или trusted headers `x-portal-user-*`.
3. При `AUTH_REQUIRED=true` API отвечает `401`, страницы редиректят на `PORTAL_LOGIN_URL`.
4. Локально по умолчанию auth **выключен**; для демо можно `AUTH_DEV_BYPASS=true`.

Полный контракт, env и шаги стыковки с portal: [`docs/portal-integration.md`](./docs/portal-integration.md).

### Env для auth / mount

```bash
# apps/broker-journal/.env — см. также корневой .env.example

# AUTH_REQUIRED="true"          # enforce portal auth
# AUTH_DEV_BYPASS="true"        # local demo only
# AUTH_COOKIE_NAME="portal_session"   # ASSUMPTION — сверить с portal
# AUTH_JWT_SECRET="…"
# AUTH_TRUST_PROXY_HEADERS="true"
# AUTH_PROXY_SECRET="…"
# PORTAL_LOGIN_URL="http://127.0.0.1:3000/login"
# NEXT_PUBLIC_BASE_PATH="/broker"     # rebuild after change
```

Проверка identity: `GET /api/auth/me` (с basePath: `/broker/api/auth/me`).

PWA работает в standalone; при embed через iframe install обычно недоступен — см. portal-integration.md.
