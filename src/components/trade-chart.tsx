"use client";

import * as React from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type IPriceLine,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { resolveTheme, readThemeMode } from "../lib/theme";
import { useTheme } from "../lib/useTheme";
import { ErrorState, LoadingState } from "./ui";

export type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type TradeChartProps = {
  symbol: string;
  from: string;
  to: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
  entryPrice?: number | null;
  entryTime?: string | null;
  exitPrice?: number | null;
  exitTime?: string | null;
  side?: "long" | "short";
  className?: string;
};

export function TradeChart({
  symbol,
  from,
  to,
  stopLoss,
  takeProfit,
  entryPrice,
  entryTime,
  exitPrice,
  exitTime,
  side = "long",
  className,
}: TradeChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = React.useRef<IPriceLine[]>([]);

  const [status, setStatus] = React.useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [error, setError] = React.useState<string | null>(null);
  const { mode: themeMode } = useTheme();
  const isDark = resolveTheme(themeMode) === "dark";

  const load = React.useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const qs = new URLSearchParams({
        symbol,
        from,
        to,
        interval: "5m",
      });
      const res = await fetch(`/api/candles?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Ошибка свечей");
      }
      const candles: CandlePoint[] = data.candles ?? [];
      if (!candles.length) {
        setStatus("empty");
        return;
      }

      if (!containerRef.current) return;

      if (!chartRef.current) {
        const chart = createChart(containerRef.current, {
          ...chartChrome(resolveTheme(readThemeMode()) === "dark"),
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
          crosshair: { mode: 1 },
          width: containerRef.current.clientWidth,
          height: 280,
        });
        const series = chart.addCandlestickSeries({
          upColor: "#1f7a54",
          downColor: "#c0392b",
          borderVisible: false,
          wickUpColor: "#1f7a54",
          wickDownColor: "#c0392b",
        });
        chartRef.current = chart;
        seriesRef.current = series;
      }

      const series = seriesRef.current!;
      for (const line of linesRef.current) {
        series.removePriceLine(line);
      }
      linesRef.current = [];

      const mapped: CandlestickData[] = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      series.setData(mapped);

      if (stopLoss != null) {
        linesRef.current.push(
          series.createPriceLine({
            price: stopLoss,
            color: "#c0392b",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "SL",
          })
        );
      }
      if (takeProfit != null) {
        linesRef.current.push(
          series.createPriceLine({
            price: takeProfit,
            color: "#1f7a54",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "TP",
          })
        );
      }

      const markers: SeriesMarker<Time>[] = [];
      const short = side === "short";
      if (entryTime && entryPrice != null) {
        const t = Math.floor(new Date(entryTime).getTime() / 1000);
        const nearest = nearestTime(mapped, t);
        if (nearest != null) {
          markers.push({
            time: nearest,
            position: short ? "aboveBar" : "belowBar",
            color: "#1f7a54",
            shape: short ? "arrowDown" : "arrowUp",
            text: `Вход ${entryPrice}`,
          });
        }
      }
      if (exitTime && exitPrice != null) {
        const t = Math.floor(new Date(exitTime).getTime() / 1000);
        const nearest = nearestTime(mapped, t);
        if (nearest != null) {
          markers.push({
            time: nearest,
            position: short ? "belowBar" : "aboveBar",
            color: "#c0392b",
            shape: short ? "arrowUp" : "arrowDown",
            text: `Выход ${exitPrice}`,
          });
        }
      }
      series.setMarkers(markers);
      chartRef.current.timeScale().fitContent();
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка графика");
      setStatus("error");
    }
  }, [
    symbol,
    from,
    to,
    stopLoss,
    takeProfit,
    entryPrice,
    entryTime,
    exitPrice,
    exitTime,
    side,
  ]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (chartRef.current) chartRef.current.applyOptions(chartChrome(isDark));
  }, [isDark]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({ width: el.clientWidth });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [status]);

  React.useEffect(() => {
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  return (
    <div className={className}>
      {status === "loading" ? <LoadingState label="Загрузка свечей…" /> : null}
      {status === "error" ? (
        <ErrorState title="График недоступен" description={error ?? undefined} onRetry={load} />
      ) : null}
      {status === "empty" ? (
        <ErrorState
          title="Нет свечей"
          description="Yahoo Finance не вернул данные за выбранный интервал. Проверьте тикер и даты."
          onRetry={load}
        />
      ) : null}
      <div
        ref={containerRef}
        className={status === "ready" ? "h-[280px] w-full" : "hidden"}
      />
    </div>
  );
}

function chartChrome(dark: boolean) {
  const grid = dark ? "rgba(148,163,184,0.14)" : "rgba(63,70,80,0.08)";
  return {
    layout: {
      background: { color: "transparent" },
      textColor: dark ? "#94a3b8" : "#3f4650",
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: grid },
    },
  };
}

function nearestTime(
  data: CandlestickData[],
  target: number
): UTCTimestamp | null {
  if (!data.length) return null;
  let best = data[0].time as number;
  let bestDiff = Math.abs(best - target);
  for (const bar of data) {
    const t = bar.time as number;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      best = t;
      bestDiff = diff;
    }
  }
  return best as UTCTimestamp;
}
