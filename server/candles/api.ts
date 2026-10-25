import type { IncomingMessage, ServerResponse } from 'node:http'
import yahooFinance from 'yahoo-finance2'
import { getUserFromRequest } from '../auth/session'
import { sendJson } from '../http/util'
import { fetchBinanceCandles, resolveCandleSource, toBinanceInterval, type Candle } from './binance'

const INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d'])

export async function handleCandlesApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== '/api/candles' || (req.method ?? 'GET') !== 'GET') return false

  const user = await getUserFromRequest(req)
  if (!user) {
    sendJson(res, 401, { error: 'Требуется вход' })
    return true
  }

  const symbol = url.searchParams.get('symbol')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const interval = url.searchParams.get('interval') ?? '5m'

  if (!symbol || !from || !to) {
    sendJson(res, 400, { error: 'Нужны параметры symbol, from, to' })
    return true
  }
  if (!INTERVALS.has(interval)) {
    sendJson(res, 400, { error: 'Некорректный interval' })
    return true
  }

  const period1 = new Date(from)
  const period2 = new Date(to)
  if (Number.isNaN(period1.getTime()) || Number.isNaN(period2.getTime())) {
    sendJson(res, 400, { error: 'Некорректные даты from/to' })
    return true
  }
  if (period2 <= period1) {
    sendJson(res, 400, { error: 'Параметр to должен быть позже from' })
    return true
  }

  const resolved = resolveCandleSource(symbol, url.searchParams.get('source'))
  if (resolved.source === 'binance' && !toBinanceInterval(interval)) {
    sendJson(res, 400, { error: `Binance не отдаёт интервал ${interval}` })
    return true
  }

  try {
    const candles =
      resolved.source === 'binance'
        ? await fetchBinanceCandles(resolved.symbol, period1, period2, interval)
        : await fetchYahooCandles(resolved.symbol, period1, period2, interval)
    sendJson(res, 200, {
      symbol: resolved.symbol,
      source: resolved.source,
      interval,
      from: period1.toISOString(),
      to: period2.toISOString(),
      candles,
    })
  } catch (error) {
    console.error('candles error', error)
    const detail = error instanceof Error ? error.message : String(error)
    const rateLimited = /too many requests|429/i.test(detail)
    const unknownPair = resolved.source === 'binance' && /invalid symbol/i.test(detail)
    sendJson(res, rateLimited ? 429 : 502, {
      error: unknownPair
        ? 'Binance не знает такую пару. Нужен вид BINANCE:BTCUSDT.'
        : rateLimited
          ? resolved.source === 'binance'
            ? 'Binance временно ограничил запросы. Повторите через минуту.'
            : 'Yahoo Finance временно ограничил запросы. Повторите через минуту.'
          : 'Не удалось получить свечи',
      detail,
    })
  }
  return true
}

async function fetchYahooCandles(
  symbol: string,
  period1: Date,
  period2: Date,
  interval: string,
): Promise<Candle[]> {
  try {
    yahooFinance.suppressNotices?.(['yahooSurvey'])
  } catch {
    /* ignore */
  }
  const result = await fetchChartWithRetry(symbol, period1, period2, interval)
  return (result.quotes ?? [])
    .filter(
      (quote) =>
        quote.date &&
        quote.open != null &&
        quote.high != null &&
        quote.low != null &&
        quote.close != null,
    )
    .map((quote) => ({
      time: Math.floor(new Date(quote.date!).getTime() / 1000),
      open: quote.open as number,
      high: quote.high as number,
      low: quote.low as number,
      close: quote.close as number,
      volume: quote.volume ?? undefined,
    }))
}

async function fetchChartWithRetry(symbol: string, period1: Date, period2: Date, interval: string, attempts = 3) {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: interval as '5m',
      })
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (!/too many requests|429/i.test(message) || i === attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)))
    }
  }
  throw lastError
}
