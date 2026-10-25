import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  fetchBinanceCandles,
  mapBinanceKlines,
  resolveCandleSource,
  toBinanceInterval,
} from './binance'

test('binance prefix selects the pair and leaves yahoo symbols alone', () => {
  assert.deepEqual(resolveCandleSource('BINANCE:btcusdt', null), {
    source: 'binance',
    symbol: 'BTCUSDT',
  })
  assert.deepEqual(resolveCandleSource('GC=F', null), { source: 'yahoo', symbol: 'GC=F' })
  assert.deepEqual(resolveCandleSource('ETHUSDT', 'binance'), {
    source: 'binance',
    symbol: 'ETHUSDT',
  })
})

test('binance intervals keep 5m and drop gaps yahoo has', () => {
  assert.equal(toBinanceInterval('5m'), '5m')
  assert.equal(toBinanceInterval('60m'), '1h')
  assert.equal(toBinanceInterval('2m'), null)
  assert.equal(toBinanceInterval('90m'), null)
})

test('klines become chart candles in seconds', () => {
  const candles = mapBinanceKlines([
    [1_700_000_000_000, '1.5', '2', '1.1', '1.8', '10'],
    ['bad'],
  ])
  assert.deepEqual(candles, [
    { time: 1_700_000_000, open: 1.5, high: 2, low: 1.1, close: 1.8, volume: 10 },
  ])
})

test('binance pages follow the last open time', async () => {
  const pages = [
    Array.from({ length: 1000 }, (_, index) => [1_000 + index, '1', '2', '0.5', '1.5', '3']),
    [[2_000, '1', '2', '0.5', '1.5', '3']],
  ]
  let calls = 0
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    const body = pages[calls] ?? []
    calls += 1
    assert.equal(url.searchParams.get('symbol'), 'BTCUSDT')
    assert.equal(url.searchParams.get('interval'), '5m')
    return new Response(JSON.stringify(body), { status: 200 })
  }

  const candles = await fetchBinanceCandles(
    'BTCUSDT',
    new Date(0),
    new Date(10_000),
    '5m',
    fetchImpl,
  )
  assert.equal(calls, 2)
  assert.equal(candles.length, 1001)
  assert.equal(candles[0]?.time, 1)
  assert.equal(candles.at(-1)?.time, 2)
})
