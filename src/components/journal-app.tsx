import * as React from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PanelActions,
  PanelBody,
  PanelSection,
  StackedPanelHost,
  StackedPanelProvider,
  StatWidget,
  useStackedPanel,
  type PanelEntry,
} from "./ui";
import { ArrowDownToLine, ArrowUpFromLine, Check, Plus, XCircle } from "lucide-react";
import {
  CLOSE_REASON_LABELS,
  SIDE_LABELS,
  formatDateTime,
  formatMoney,
  suggestInstruments,
  type CashflowKind,
  type JournalStats,
  type RegistryItem,
} from "../lib/journal";
import {
  CreateClosePanel,
  CreateOpenPanel,
  ViewClosePanel,
  ViewOpenPanel,
} from "./panel-views";
import { localInputToIso, toLocalInput } from "./trade-forms";

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
    const stackParam = new URLSearchParams(window.location.search).get("stack");
    if (!stackParam) return;
    deepLinkHandled.current = true;
    const [kind, id] = stackParam.split(":");
    if (kind === "open" && id) {
      push({ type: "view-open", title: "Открытие", data: { openId: id }, id: `dl-open-${id}` });
    } else if (kind === "close" && id) {
      push({ type: "view-close", title: "Закрытие", data: { closeId: id }, id: `dl-close-${id}` });
    }
  }, [status, push]);

  // Keep URL in sync with top panel (optional)
  React.useEffect(() => {
    const top = stack[stack.length - 1];
    const url = new URL(window.location.href);
    if (!top) {
      if (url.searchParams.has("stack")) {
        url.searchParams.delete("stack");
        window.history.replaceState(null, "", url.pathname + url.search);
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
      window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
    }
  }, [stack]);

  const suggestions = React.useMemo(
    () =>
      suggestInstruments(
        (data?.items ?? [])
          .filter((item) => item.kind === "open")
          .map((item) => ({ instrument: item.instrument, at: item.at }))
      ),
    [data]
  );

  const renderPanel = React.useCallback(
    (panel: PanelEntry) => {
      switch (panel.type) {
        case "create-open":
          return <CreateOpenPanel onDone={load} suggestions={suggestions} />;
        case "create-close": {
          const d = panel.data as {
            openId: string;
            openLabel?: string;
            instrument?: string;
            entryPrice?: number;
          };
          return (
            <CreateClosePanel
              openId={d.openId}
              openLabel={d.openLabel}
              instrument={d.instrument}
              entryPrice={d.entryPrice}
              onDone={load}
            />
          );
        }
        case "view-open":
          return (
            <ViewOpenPanel
              openId={(panel.data as { openId: string }).openId}
              onDone={load}
              suggestions={suggestions}
            />
          );
        case "view-close":
          return (
            <ViewClosePanel
              closeId={(panel.data as { closeId: string }).closeId}
              onDone={load}
            />
          );
        case "create-cashflow":
          return (
            <CashflowPanel
              kind={(panel.data as { kind: CashflowKind }).kind}
              onDone={load}
            />
          );
        case "view-cashflow":
          return (
            <ViewCashflowPanel
              flow={panel.data as CashflowView}
              onDone={load}
            />
          );
        case "pick-open-to-close":
          return (
            <PickOpenToClose
              positions={data?.openPositions ?? []}
              onPick={(position) =>
                push({
                  type: "create-close",
                  title: "Закрыть позицию",
                  data: {
                    openId: position.id,
                    openLabel: `${position.instrument} · вход ${formatMoney(position.price, 4)} · ${formatDateTime(position.openedAt)}`,
                    instrument: position.instrument,
                    entryPrice: position.price,
                  },
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
    [load, push, data?.openPositions, suggestions]
  );

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-8 pt-6 sm:px-6">
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
              hint={`Старт ${formatMoney(data.stats.startingBalance)}`}
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  push({
                    type: "create-cashflow",
                    title: "Ввод средств",
                    data: { kind: "deposit" },
                  })
                }
              >
                <ArrowDownToLine className="size-4" />
                Ввод
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  push({
                    type: "create-cashflow",
                    title: "Вывод средств",
                    data: { kind: "withdrawal" },
                  })
                }
              >
                <ArrowUpFromLine className="size-4" />
                Вывод
              </Button>
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
                if (item.kind === "deposit" || item.kind === "withdrawal") {
                  const incoming = item.kind === "deposit";
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                          onClick={() =>
                            push({
                              type: "view-cashflow",
                              title: incoming ? "Ввод средств" : "Вывод средств",
                              data: {
                                id: item.id,
                                kind: item.kind,
                                amount: item.amount,
                                at: item.at,
                                note: item.note,
                              },
                            })
                          }
                        >
                          <RegistryWhen at={item.at} />
                          <span
                            className={`mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              incoming
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                            }`}
                          >
                            {incoming ? "Ввод" : "Вывод"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate font-medium">
                                {item.note || (incoming ? "Ввод средств" : "Вывод средств")}
                              </span>
                              <span className="shrink-0 tabular-nums text-sm">
                                {incoming ? "+" : "−"}
                                {formatMoney(item.amount)}
                              </span>
                            </span>
                          </span>
                        </button>
                    </li>
                  );
                }

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
                        <RegistryWhen at={item.at} />
                        <span
                          className={`mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            item.kind === "open"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
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
                            {item.kind === "open" ? (
                              <span>
                                {SIDE_LABELS[item.side]} · ×{formatMoney(item.quantity, 2)} · плечо{" "}
                                {formatMoney(item.leverage, 0)}
                                {" · "}
                                покупка {formatMoney(item.purchase)}
                                {" · "}
                                затраты {formatMoney(item.cost)}
                                {item.spread != null ? ` · спред ${item.spread > 0 ? "+" : ""}${formatMoney(item.spread)}` : ""}
                              </span>
                            ) : (
                              <span>
                                {SIDE_LABELS[item.side]} · {CLOSE_REASON_LABELS[item.closeReason]}
                              </span>
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
                                instrument: item.instrument,
                                entryPrice: item.price,
                              },
                            })
                          }
                        >
                          <XCircle className="size-4" />
                          Закрыть
                        </Button>
                      ) : closed ? (
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-300">
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

function RegistryWhen({ at }: { at: string }) {
  const date = new Date(at);
  const day = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return (
    <span className="flex min-w-[7.75rem] shrink-0 flex-col whitespace-nowrap text-left leading-tight">
      <span className="text-xs font-medium tabular-nums">{day}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
    </span>
  );
}

type CashflowView = {
  id: string;
  kind: CashflowKind;
  amount: number;
  at: string;
  note: string;
};

function CashflowPanel({
  kind,
  onDone,
}: {
  kind: CashflowKind;
  onDone: () => Promise<void> | void;
}) {
  const { clear } = useStackedPanel();
  const [amount, setAmount] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(() => toLocalInput(new Date()));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const incoming = kind === "deposit";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = Number(amount);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("Сумма должна быть больше нуля");
      }
      const res = await fetch("/api/cashflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amount: next,
          occurredAt: localInputToIso(occurredAt),
          note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Ошибка сохранения");
      await onDone();
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex min-h-full flex-col">
      <PanelBody>
        <PanelSection title={incoming ? "Ввод" : "Вывод"}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashflow-amount">Сумма</Label>
              <Input
                id="cashflow-amount"
                required
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashflow-at">Дата и время</Label>
              <Input
                id="cashflow-at"
                required
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashflow-note">Комментарий</Label>
              <Input
                id="cashflow-note"
                value={note}
                maxLength={500}
                placeholder="Необязательно"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {incoming
                ? "Ввод увеличивает баланс счёта."
                : "Вывод уменьшает баланс счёта."}
            </p>
          </div>
        </PanelSection>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </PanelBody>
      <PanelActions>
        <Button type="button" variant="outline" className="flex-1" onClick={() => clear()}>
          Отмена
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Сохранение…" : incoming ? "Ввести" : "Вывести"}
        </Button>
      </PanelActions>
    </form>
  );
}

function ViewCashflowPanel({
  flow,
  onDone,
}: {
  flow: CashflowView;
  onDone: () => Promise<void> | void;
}) {
  const { clear } = useStackedPanel();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const incoming = flow.kind === "deposit";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cashflows?id=${encodeURIComponent(flow.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Ошибка удаления");
      await onDone();
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PanelBody>
        <PanelSection title={incoming ? "Ввод" : "Вывод"}>
          <p className="text-2xl font-semibold tabular-nums">
            {incoming ? "+" : "−"}
            {formatMoney(flow.amount)}
          </p>
          <p className="text-sm text-muted-foreground">{formatDateTime(flow.at)}</p>
          {flow.note ? <p className="text-sm">{flow.note}</p> : null}
        </PanelSection>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </PanelBody>
      <PanelActions>
        <Button type="button" variant="outline" className="flex-1" onClick={() => clear()} disabled={busy}>
          Закрыть
        </Button>
        <Button type="button" variant="destructive" className="flex-1" onClick={() => void remove()} disabled={busy}>
          Удалить
        </Button>
      </PanelActions>
    </div>
  );
}

function PickOpenToClose({
  positions,
  onPick,
}: {
  positions: RegistryResponse["openPositions"];
  onPick: (position: RegistryResponse["openPositions"][number]) => void;
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
            onClick={() => onPick(p)}
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
