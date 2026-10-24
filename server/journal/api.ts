import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { calcNetPnl, computeStats, d, serializeOpen, toRegistryItems, type CloseReason } from '../../src/lib/journal'
import { getUserFromRequest } from '../auth/session'
import { readJsonBody, sendJson } from '../http/util'
import { handleScreenshotApi } from '../screenshot/api'
import * as store from './store'

const closeReasonSchema = z.enum(['manual', 'take_profit', 'stop_loss'])

const openSchema = z.object({
  openedAt: z.string().min(1),
  instrument: z.string().min(1).max(64),
  price: z.number().positive(),
  commission: z.number().min(0),
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  leverage: z.number().positive(),
  quantity: z.number().positive(),
  openReason: z.string().max(2000).default(''),
})

const closeSchema = z.object({
  openId: z.string().min(1),
  closedAt: z.string().min(1),
  price: z.number().positive(),
  commission: z.number().min(0),
  closeReason: closeReasonSchema,
})

function openInput(data: z.infer<typeof openSchema>): store.OpenInput {
  return {
    openedAt: data.openedAt,
    instrument: data.instrument.trim().toUpperCase(),
    price: data.price,
    commission: data.commission,
    stopLoss: data.stopLoss ?? null,
    takeProfit: data.takeProfit ?? null,
    leverage: data.leverage,
    quantity: data.quantity,
    openReason: data.openReason ?? '',
  }
}

function closePayload(open: NonNullable<Awaited<ReturnType<typeof store.getOpen>>>) {
  const close = open.close
  if (!close) throw new Error('Закрытие не найдено')
  return {
    id: close.id,
    openId: close.openId,
    closedAt: close.closedAt,
    price: d(close.price),
    commission: d(close.commission),
    closeReason: close.closeReason,
    pnl: calcNetPnl(d(open.price), d(close.price), d(open.quantity), d(open.commission), d(close.commission)),
    open: serializeOpen(open),
  }
}

async function requireUser(req: IncomingMessage, res: ServerResponse) {
  const user = await getUserFromRequest(req)
  if (!user) {
    sendJson(res, 401, { error: 'Требуется вход' })
    return null
  }
  return user
}

function sendError(res: ServerResponse, error: unknown, fallback: string): void {
  if (error instanceof z.ZodError) {
    sendJson(res, 400, { error: 'Некорректные данные', details: error.flatten() })
    return
  }
  const status = store.httpStatus(error)
  if (status) {
    sendJson(res, status, { error: error instanceof Error ? error.message : fallback })
    return
  }
  console.error(error)
  sendJson(res, 500, { error: fallback })
}

export async function handleJournalApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (pathname.endsWith('/parse-screenshot')) {
    return handleScreenshotApi(req, res, pathname)
  }

  const journal =
    pathname === '/api/registry' ||
    pathname === '/api/settings' ||
    pathname === '/api/opens' ||
    pathname === '/api/closes'
  if (!journal) return false

  const method = req.method ?? 'GET'
  const user = await requireUser(req, res)
  if (!user) return true

  try {
    if (pathname === '/api/registry' && method === 'GET') {
      const [startingBalance, opens] = await Promise.all([
        store.ensureSettings(user.id),
        store.listOpens(user.id),
      ])
      sendJson(res, 200, {
        stats: computeStats(startingBalance, opens),
        items: toRegistryItems(opens),
        openPositions: opens
          .filter((open) => !open.close)
          .map((open) => ({
            id: open.id,
            instrument: open.instrument,
            openedAt: open.openedAt,
            price: Number(open.price),
            quantity: Number(open.quantity),
          })),
      })
      return true
    }

    if (pathname === '/api/settings' && method === 'GET') {
      sendJson(res, 200, { startingBalance: await store.ensureSettings(user.id) })
      return true
    }

    if (pathname === '/api/settings' && method === 'PATCH') {
      const body = await readJsonBody<{ startingBalance?: number }>(req)
      const startingBalance = z.number().finite().parse(body.startingBalance)
      sendJson(res, 200, { startingBalance: await store.updateSettings(user.id, startingBalance) })
      return true
    }

    if (pathname === '/api/opens' && method === 'GET') {
      const id = url.searchParams.get('id')
      if (id) {
        const open = await store.getOpen(user.id, id)
        if (!open) {
          sendJson(res, 404, { error: 'Открытие не найдено' })
          return true
        }
        sendJson(res, 200, serializeOpen(open))
        return true
      }
      const opens = await store.listOpens(user.id)
      sendJson(res, 200, opens.map(serializeOpen))
      return true
    }

    if (pathname === '/api/opens' && method === 'POST') {
      const data = openSchema.parse(await readJsonBody(req))
      const open = await store.createOpen(user.id, openInput(data))
      sendJson(res, 201, serializeOpen(open))
      return true
    }

    if (pathname === '/api/opens' && method === 'PATCH') {
      const body = await readJsonBody<{ id?: string }>(req)
      const id = z.string().min(1).parse(body.id)
      const data = openSchema.partial().parse(body)
      const patch: Partial<store.OpenInput> = {}
      if (data.openedAt) patch.openedAt = data.openedAt
      if (data.instrument) patch.instrument = data.instrument.trim().toUpperCase()
      if (data.price !== undefined) patch.price = data.price
      if (data.commission !== undefined) patch.commission = data.commission
      if (data.stopLoss !== undefined) patch.stopLoss = data.stopLoss
      if (data.takeProfit !== undefined) patch.takeProfit = data.takeProfit
      if (data.leverage !== undefined) patch.leverage = data.leverage
      if (data.quantity !== undefined) patch.quantity = data.quantity
      if (data.openReason !== undefined) patch.openReason = data.openReason
      const open = await store.updateOpen(user.id, id, patch)
      if (!open) {
        sendJson(res, 404, { error: 'Открытие не найдено' })
        return true
      }
      sendJson(res, 200, serializeOpen(open))
      return true
    }

    if (pathname === '/api/closes' && method === 'GET') {
      const id = url.searchParams.get('id')
      const opens = await store.listOpens(user.id)
      if (id) {
        const open = opens.find((item) => item.close?.id === id)
        if (!open?.close) {
          sendJson(res, 404, { error: 'Закрытие не найдено' })
          return true
        }
        sendJson(res, 200, closePayload(open))
        return true
      }
      sendJson(
        res,
        200,
        opens.flatMap((open) => {
          if (!open.close) return []
          return [
            {
              id: open.close.id,
              openId: open.id,
              closedAt: open.close.closedAt,
              price: d(open.close.price),
              commission: d(open.close.commission),
              closeReason: open.close.closeReason as CloseReason,
              instrument: open.instrument,
              pnl: calcNetPnl(
                d(open.price),
                d(open.close.price),
                d(open.quantity),
                d(open.commission),
                d(open.close.commission),
              ),
            },
          ]
        }),
      )
      return true
    }

    if (pathname === '/api/closes' && method === 'POST') {
      const data = closeSchema.parse(await readJsonBody(req))
      const open = await store.createClose(user.id, data)
      sendJson(res, 201, closePayload(open))
      return true
    }

    if (pathname === '/api/closes' && method === 'PATCH') {
      const body = await readJsonBody<{ id?: string }>(req)
      const id = z.string().min(1).parse(body.id)
      const data = closeSchema.partial().omit({ openId: true }).parse(body)
      const open = await store.updateClose(user.id, id, data)
      if (!open) {
        sendJson(res, 404, { error: 'Закрытие не найдено' })
        return true
      }
      sendJson(res, 200, closePayload(open))
      return true
    }

    sendJson(res, 404, { error: 'Not found' })
    return true
  } catch (error) {
    sendError(res, error, 'Ошибка журнала')
    return true
  }
}
