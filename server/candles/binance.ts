export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type CandleSource = 'yahoo' | 'binance'

const BINANCE_INTERVALS: Record<string, string | null> = {
  '1m': '1m',
  '2m': null,
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '60m': '1h',
  '90m': null,
  '1h': '1h',
  '1d': '1d',
}

/** Yahoo stays the default. `BINANCE:BTCUSDT` selects Binance and the pair. */
export function resolveCandleSource(
  symbol: string,
  sourceParam: string | null,
): { source: CandleSource; symbol: string } {
  const trimmed = symbol.trim()
  const prefixed = trimmed.match(/^(binance|yahoo)\s*:\s*(.+)$/i)
  if (prefixed) {
    const source: CandleSource = prefixed[1].toLowerCase() === 'binance' ? 'binance' : 'yahoo'
    const pair = prefixed[2].trim()
    return { source, symbol: source === 'binance' ? pair.toUpperCase() : pair }
  }
  if (sourceParam === 'binance') return { source: 'binance', symbol: trimmed.toUpperCase() }
  return { source: 'yahoo', symbol: trimmed }
}

export function toBinanceInterval(interval: string): string | null {
  if (!(interval in BINANCE_INTERVALS)) return null
  return BINANCE_INTERVALS[interval]
}

export function mapBinanceKlines(rows: unknown[]): Candle[] {
  const candles: Candle[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const openTime = Number(row[0])
    const open = Number(row[1])
    const high = Number(row[2])
    const low = Number(row[3])
    const close = Number(row[4])
    const volume = Number(row[5])
    if (![openTime, open, high, low, close].every((value) => Number.isFinite(value))) continue
    candles.push({
      time: Math.floor(openTime / 1000),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined,
    })
  }
  return candles
}

export async function fetchBinanceCandles(
  symbol: string,
  from: Date,
  to: Date,
  interval: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Candle[]> {
  const binanceInterval = toBinanceInterval(interval)
  if (!binanceInterval) {
    throw new Error(`Binance не отдаёт интервал ${interval}`)
  }
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    throw new Error('Invalid symbol.')
  }

  const candles: Candle[] = []
  let start = from.getTime()
  const end = to.getTime()

  for (let page = 0; page < 20 && start < end; page += 1) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', binanceInterval)
    url.searchParams.set('startTime', String(start))
    url.searchParams.set('endTime', String(end))
    url.searchParams.set('limit', '1000')

    const response = await fetchImpl(url)
    const body = await response.text()
    if (!response.ok) throw binanceFailure(response.status, body)

    const rows = JSON.parse(body) as unknown
    if (!Array.isArray(rows) || rows.length === 0) break

    candles.push(...mapBinanceKlines(rows))
    const last = rows[rows.length - 1]
    const lastOpen = Array.isArray(last) ? Number(last[0]) : NaN
    if (!Number.isFinite(lastOpen) || rows.length < 1000) break
    const next = lastOpen + 1
    if (next <= start) break
    start = next
  }

  return candles
}

function binanceFailure(status: number, body: string): Error {
  if (status === 429 || status === 418) return new Error('too many requests')
  try {
    const parsed = JSON.parse(body) as { msg?: string }
    if (parsed.msg) return new Error(parsed.msg)
  } catch {
    /* keep the raw body */
  }
  return new Error(body || `Binance ${status}`)
}
