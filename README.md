# Журнал брокера

Русскоязычный PWA-журнал открытий и закрытий фьючерсов: реестр операций, виджеты баланса, стековые карточки с графиками Yahoo Finance.

Сервис собран как дочернее приложение [project_hub](https://github.com/merdovash/project_hub): Vite, React 19, Tailwind 4, общая база `finance` и cookie `session`.

## Требования

- Node.js 20+
- npm
- PostgreSQL 16 — тот же экземпляр, что у портала (`C:\projects\portal`, `npm run db:up`)

## Быстрый старт

```bash
cp .env.example .env
# DATABASE_URL=postgresql://finance:finance@localhost:5432/finance

npm install
npm run db:migrate
npm run dev
```

Откройте [http://127.0.0.1:5175](http://127.0.0.1:5175).

Без `VITE_PORTAL_URL` на экране входа есть локальные вход и регистрация в общие таблицы `users` / `sessions`. Если задан `VITE_PORTAL_URL`, кнопка ведёт на портал с `?return=` на текущую страницу.

## Возможности

- Реестр на `/` со счётчиками: **баланс**, **вложено**, **заработано**, **комиссии**
- Открытие со скриншота Walt («Лонг открыт» или «Ваша позиция»): локальный OCR заполняет форму, сделка сохраняется после проверки
- Закрытие со скриншота Walt («Цена при закрытии»): в форму подставляются цена выхода, комиссия и дата
- Карточки на стековых панелях: просмотр / правка / создание открытия и закрытия
- Deep-link: `?stack=open:<id>` / `?stack=close:<id>`
- Свечи: `GET /api/candles?symbol=&from=&to&interval=5m` через `yahoo-finance2` (не хранятся в БД)
- Графики: Lightweight Charts (линии SL/TP, маркеры входа/выхода)
- PWA: `vite-plugin-pwa`, иконки 192/512. Service worker ставится в production-сборке.

Строки журнала принадлежат пользователю сессии (`journal_opens.user_id`).

## Модель данных

SQL-миграции в `server/db/migrations`. Журнал применения — таблица `journal_schema_migrations`, чтобы не пересечься с wallet и бюджетом.

- `journal_opens` — открытие
- `journal_closes` — закрытие с уникальным `open_id` (открытие при закрытии не меняется)
- `journal_settings` — стартовый баланс пользователя
- `users`, `sessions` — общие с порталом, создаются через `IF NOT EXISTS`

Формулы PnL — в `src/lib/journal.ts`.

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Dev-сервер на порту 5175 |
| `npm test` | Vitest: суммы сделки и разбор текста скриншотов |
| `npm run build` | `tsc -b` и production-сборка |
| `npm run preview` | Превью сборки (так журнал запускает PM2 хаба) |
| `npm run db:migrate` | Применить SQL-миграции |

OCR-тесты фикстур (`server/screenshot/*.test.ts`) тоже входят в `npm test` и читают веса из `models/tessdata`.

## Установка как PWA

После `npm run build && npm run preview` откройте сайт в Chrome/Edge и выберите «Установить приложение».

## Интеграция с project_hub

Портал публикует журнал на поддомене `journal.<domain>`: Caddy проксирует на порт **5175**. Каталог сервисов — запись `journal` в `config/services.yaml` портала.

Подробности: [`docs/portal-integration.md`](./docs/portal-integration.md).
