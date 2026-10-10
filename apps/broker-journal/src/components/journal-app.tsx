"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  StackedPanelHost,
  StackedPanelProvider,
  StatWidget,
  useStackedPanel,
  type PanelEntry,
} from "@broker-journal/ui";
import { Check, Plus, XCircle } from "lucide-react";
import {
  CLOSE_REASON_LABELS,
  formatDateTime,
  formatMoney,
  type JournalStats,
  type RegistryItem,
} from "@/lib/journal";
import {
  CreateClosePanel,
  CreateOpenPanel,
  ViewClosePanel,
  ViewOpenPanel,
} from "./panel-views";

type RegistryResponse = {
  stats: JournalStats;
  items: RegistryItem[];
  openPositions: {
    id: string;
    instrument: string;
    openedAt: string;
    price: number;
    quantity: number;
  }[];
};

export function JournalApp() {
  return (
    <StackedPanelProvider>
      <JournalShell />
    </StackedPanelProvider>
  );
}

function JournalShell() {
  const { push, clear, stack } = useStackedPanel();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = React.useState<RegistryResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const deepLinkHandled = React.useRef(false);

  const load = React.useCallback(async () => {
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    try {
      const res = await fetch("/api/registry", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка реестра");
      setData(json);
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Optional deep link: ?stack=open:id or ?stack=close:id
  React.useEffect(() => {
    if (deepLinkHandled.current || status !== "ready") return;
    const stackParam = searchParams.get("stack");
    if (!stackParam) return;
    deepLinkHandled.current = true;
    const [kind, id] = stackParam.split(":");
    if (kind === "open" && id) {
      push({ type: "view-open", title: "Открытие", data: { openId: id }, id: `dl-open-${id}` });
    } else if (kind === "close" && id) {
      push({ type: "view-close", title: "Закрытие", data: { closeId: id }, id: `dl-close-${id}` });
    }
  }, [searchParams, status, push]);

  // Keep URL in sync with top panel (optional)
  React.useEffect(() => {
    const top = stack[stack.length - 1];
    const url = new URL(window.location.href);
    if (!top) {
      if (url.searchParams.has("stack")) {
        url.searchParams.delete("stack");
        router.replace(url.pathname + (url.search || ""), { scroll: false });
      }
      return;
    }
    let next: string | null = null;
    if (top.type === "view-open" && (top.data as { openId?: string })?.openId) {
      next = `open:${(top.data as { openId: string }).openId}`;
    } else if (top.type === "view-close" && (top.data as { closeId?: string })?.closeId) {
      next = `close:${(top.data as { closeId: string }).closeId}`;
    }
    if (next && url.searchParams.get("stack") !== next) {
      url.searchParams.set("stack", next);
      router.replace(url.pathname + "?" + url.searchParams.toString(), { scroll: false });
    }
  }, [stack, router]);

  const renderPanel = React.useCallback(
    (panel: PanelEntry) => {
      switch (panel.type) {
        case "create-open":
          return <CreateOpenPanel onDone={load} />;
        case "create-close": {
          const d = panel.data as { openId: string; openLabel?: string };
          return (
            <CreateClosePanel openId={d.openId} openLabel={d.openLabel} onDone={load} />
          );
        }
        case "view-open":
          return (
            <ViewOpenPanel
              openId={(panel.data as { openId: string }).openId}
              onDone={load}
            />
          );
        case "view-close":
          return (
            <ViewClosePanel
              closeId={(panel.data as { closeId: string }).closeId}
              onDone={load}
            />
          );
        case "pick-open-to-close":
          return (
            <PickOpenToClose
              positions={data?.openPositions ?? []}
              onPick={(id, label) =>
                push({
                  type: "create-close",
                  title: "Закрыть позицию",
                  data: { openId: id, openLabel: label },
                })
              }
            />
          );
        default:
          return (
            <EmptyState title="Неизвестная панель" description={panel.type ?? "—"} />
          );
      }
    },
    [load, push, data?.openPositions]
  );

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-6 flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Broker Journal
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Журнал брокера
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Учёт открытий и закрытий фьючерсов: баланс, маржа, PnL и графики входа/выхода.
        </p>
      </header>

      {status === "loading" && !data ? <LoadingState label="Загрузка реестра…" /> : null}
      {status === "error" && !data ? (
        <ErrorState title="Не удалось загрузить реестр" description={error ?? undefined} onRetry={load} />
      ) : null}

      {data ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatWidget
              label="Баланс"
              value={formatMoney(data.stats.balance)}
              tone={data.stats.balance >= 0 ? "default" : "negative"}
            />
            <StatWidget label="Вложено" value={formatMoney(data.stats.invested)} />
            <StatWidget
              label="Заработано"
              value={formatMoney(data.stats.earned)}
              tone={
                data.stats.earned > 0
                  ? "positive"
                  : data.stats.earned < 0
                    ? "negative"
                    : "muted"
              }
            />
            <StatWidget label="Комиссии" value={formatMoney(data.stats.commissions)} tone="muted" />
          </section>

          <section className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Операции</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!data.openPositions.length}
                onClick={() =>
                  push({
                    type: "pick-open-to-close",
                    title: "Выберите открытие",
                  })
                }
              >
                <XCircle className="size-4" />
                Закрыть
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  push({
                    type: "create-open",
                    title: "Новое открытие",
                  })
                }
              >
                <Plus className="size-4" />
                Открыть
              </Button>
            </div>
          </section>

          {data.items.length === 0 ? (
            <EmptyState
              title="Пока нет операций"
              description="Создайте первое открытие — карточка появится в реестре, а график подтянет свечи с Yahoo Finance."
              action={
                <Button
                  type="button"
                  onClick={() => push({ type: "create-open", title: "Новое открытие" })}
                >
                  Открыть позицию
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {data.items.map((item) => {
                const closed = item.kind === "close" || item.closed;
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <div className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-muted/50">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        onClick={() => {
                          if (item.kind === "open") {
                            push({
                              type: "view-open",
                              title: `Открытие ${item.instrument}`,
                              data: { openId: item.id },
                            });
                          } else {
                            push({
                              type: "view-close",
                              title: `Закрытие ${item.instrument}`,
                              data: { closeId: item.id },
                            });
                          }
                        }}
                      >
                        <span
                          className={`mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            item.kind === "open"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {item.kind === "open" ? "Open" : "Close"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-medium">{item.instrument}</span>
                            <span className="shrink-0 tabular-nums text-sm">
                              {item.kind === "open"
                                ? formatMoney(item.price, 4)
                                : `${item.pnl >= 0 ? "+" : ""}${formatMoney(item.pnl)}`}
                            </span>
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            <span>{formatDateTime(item.at)}</span>
                            {item.kind === "open" ? (
                              <span>
                                ×{formatMoney(item.quantity, 2)} · плечо {formatMoney(item.leverage, 0)}
                              </span>
                            ) : (
                              <span>{CLOSE_REASON_LABELS[item.closeReason]}</span>
                            )}
                          </span>
                        </span>
                      </button>
                      {item.kind === "open" && !item.closed ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-0.5 shrink-0"
                          onClick={() =>
                            push({
                              type: "create-close",
                              title: "Закрыть позицию",
                              data: {
                                openId: item.id,
                                openLabel: `${item.instrument} · вход ${formatMoney(item.price, 4)}`,
                              },
                            })
                          }
                        >
                          <XCircle className="size-4" />
                          Закрыть
                        </Button>
                      ) : closed ? (
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          <Check className="size-3" />
                          Закрыто
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      <StackedPanelHost renderPanel={renderPanel} />

      {/* Escape hatch if somehow stuck */}
      {stack.length > 0 ? (
        <button
          type="button"
          className="sr-only"
          onClick={() => clear()}
        >
          Закрыть стек
        </button>
      ) : null}
    </div>
  );
}

function PickOpenToClose({
  positions,
  onPick,
}: {
  positions: RegistryResponse["openPositions"];
  onPick: (id: string, label: string) => void;
}) {
  if (!positions.length) {
    return (
      <EmptyState
        title="Нет открытых позиций"
        description="Сначала создайте открытие, затем закрывайте."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {positions.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/50"
            onClick={() =>
              onPick(
                p.id,
                `${p.instrument} · вход ${formatMoney(p.price, 4)} · ${formatDateTime(p.openedAt)}`
              )
            }
          >
            <span className="font-medium">{p.instrument}</span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(p.openedAt)} · цена {formatMoney(p.price, 4)} · qty{" "}
              {formatMoney(p.quantity, 2)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
