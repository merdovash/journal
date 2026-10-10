import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { ensureApiAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/**
 * Candles are fetched live from Yahoo Finance and never persisted.
 * GET /api/candles?symbol=GC=F&from=ISO&to=ISO&interval=5m
 */
export async function GET(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const interval = (searchParams.get("interval") ?? "5m") as
    | "1m"
    | "2m"
    | "5m"
    | "15m"
    | "30m"
    | "60m"
    | "90m"
    | "1h"
    | "1d";

  if (!symbol || !from || !to) {
    return NextResponse.json(
      { error: "Нужны параметры symbol, from, to" },
      { status: 400 }
    );
  }

  const period1 = new Date(from);
  const period2 = new Date(to);
  if (Number.isNaN(period1.getTime()) || Number.isNaN(period2.getTime())) {
    return NextResponse.json({ error: "Некорректные даты from/to" }, { status: 400 });
  }
  if (period2 <= period1) {
    return NextResponse.json(
      { error: "Параметр to должен быть позже from" },
      { status: 400 }
    );
  }

  try {
    // Suppress yahoo-finance2 survey notice in server logs
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (yahooFinance as any).suppressNotices?.(["yahooSurvey"]);
    } catch {
      /* ignore */
    }

    const result = await fetchChartWithRetry(symbol, period1, period2, interval);

    const quotes = result.quotes ?? [];
    const candles: Candle[] = quotes
      .filter(
        (q) =>
          q.date &&
          q.open != null &&
          q.high != null &&
          q.low != null &&
          q.close != null
      )
      .map((q) => ({
        time: Math.floor(new Date(q.date!).getTime() / 1000),
        open: q.open as number,
        high: q.high as number,
        low: q.low as number,
        close: q.close as number,
        volume: q.volume ?? undefined,
      }));

    return NextResponse.json({
      symbol,
      interval,
      from: period1.toISOString(),
      to: period2.toISOString(),
      candles,
    });
  } catch (error) {
    console.error("candles error", error);
    const detail = error instanceof Error ? error.message : String(error);
    const rateLimited = /too many requests|429/i.test(detail);
    return NextResponse.json(
      {
        error: rateLimited
          ? "Yahoo Finance временно ограничил запросы. Повторите через минуту."
          : "Не удалось получить свечи",
        detail,
      },
      { status: rateLimited ? 429 : 502 }
    );
  }
}

async function fetchChartWithRetry(
  symbol: string,
  period1: Date,
  period2: Date,
  interval: string,
  attempts = 3
) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await yahooFinance.chart(symbol, {
        period1,
        period2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interval: interval as any,
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/too many requests|429/i.test(msg) || i === attempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}
