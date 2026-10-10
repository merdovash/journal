"use client";

import * as React from "react";
import {
  Button,
  PanelActions,
  PanelBody,
  PanelSection,
  LoadingState,
  ErrorState,
  useStackedPanel,
} from "@broker-journal/ui";
import { TradeChart } from "./trade-chart";
import {
  CloseTradeForm,
  OpenTradeForm,
  localInputToIso,
  parseOptionalNumber,
  parseRequiredNumber,
  toLocalInput,
} from "./trade-forms";
import {
  CLOSE_REASON_LABELS,
  formatDateTime,
  formatMoney,
} from "@/lib/journal";
import { TradeAmountSummary } from "./trade-amounts";

export type SerializedOpen = {
  id: string;
  openedAt: string;
  instrument: string;
  price: number;
  commission: number;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  quantity: number;
  openReason: string;
  close: {
    id: string;
    closedAt: string;
    price: number;
    commission: number;
    closeReason: "manual" | "take_profit" | "stop_loss";
    pnl: number;
  } | null;
};

export type SerializedClose = {
  id: string;
  openId: string;
  closedAt: string;
  price: number;
  commission: number;
  closeReason: "manual" | "take_profit" | "stop_loss";
  pnl: number;
  open: SerializedOpen;
};

type RefreshFn = () => Promise<void> | void;

export function CreateOpenPanel({ onDone }: { onDone: RefreshFn }) {
  const { clear } = useStackedPanel();
  return (
    <OpenTradeForm
      enableScreenshot
      submitLabel="Открыть позицию"
      onCancel={() => clear()}
      onSubmit={async (values) => {
        const res = await fetch("/api/opens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            openedAt: localInputToIso(values.openedAt),
            instrument: values.instrument,
            price: parseRequiredNumber(values.price, "цена"),
            commission: parseRequiredNumber(values.commission, "комиссия"),
            stopLoss: parseOptionalNumber(values.stopLoss),
            takeProfit: parseOptionalNumber(values.takeProfit),
            leverage: parseRequiredNumber(values.leverage, "плечо"),
            quantity: parseRequiredNumber(values.quantity, "количество"),
            openReason: values.openReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        await onDone();
        clear();
      }}
    />
  );
}

export function CreateClosePanel({
  openId,
  openLabel,
  instrument,
  entryPrice,
  onDone,
}: {
  openId: string;
  openLabel?: string;
  instrument?: string;
  entryPrice?: number;
  onDone: RefreshFn;
}) {
  const { clear } = useStackedPanel();
  return (
    <CloseTradeForm
      enableScreenshot
      openId={openId}
      openLabel={openLabel}
      openInstrument={instrument}
      openEntryPrice={entryPrice}
      submitLabel="Закрыть позицию"
      onCancel={() => clear()}
      onSubmit={async (values) => {
        const res = await fetch("/api/closes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            openId: values.openId,
            closedAt: localInputToIso(values.closedAt),
            price: parseRequiredNumber(values.price, "цена"),
            commission: parseRequiredNumber(values.commission, "комиссия"),
            closeReason: values.closeReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка");
        await onDone();
        clear();
      }}
    />
  );
}

export function ViewOpenPanel({
  openId,
  onDone,
}: {
  openId: string;
  onDone: RefreshFn;
}) {
  const { push, replace } = useStackedPanel();
  const [open, setOpen] = React.useState<SerializedOpen | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/opens?id=${encodeURIComponent(openId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setOpen(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [openId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error || !open) {
    return <ErrorState title="Не удалось загрузить" description={error ?? undefined} onRetry={load} />;
  }

  if (editing) {
    return (
      <OpenTradeForm
        submitLabel="Сохранить"
        initial={{
          openedAt: toLocalInput(new Date(open.openedAt)),
          instrument: open.instrument,
          price: String(open.price),
          commission: String(open.commission),
          stopLoss: open.stopLoss == null ? "" : String(open.stopLoss),
          takeProfit: open.takeProfit == null ? "" : String(open.takeProfit),
          leverage: String(open.leverage),
          quantity: String(open.quantity),
          openReason: open.openReason,
        }}
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          const res = await fetch("/api/opens", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: open.id,
              openedAt: localInputToIso(values.openedAt),
              instrument: values.instrument,
              price: parseRequiredNumber(values.price, "цена"),
              commission: parseRequiredNumber(values.commission, "комиссия"),
              stopLoss: parseOptionalNumber(values.stopLoss),
              takeProfit: parseOptionalNumber(values.takeProfit),
              leverage: parseRequiredNumber(values.leverage, "плечо"),
              quantity: parseRequiredNumber(values.quantity, "количество"),
              openReason: values.openReason,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Ошибка");
          setOpen(data);
          setEditing(false);
          await onDone();
        }}
      />
    );
  }

  const from = new Date(new Date(open.openedAt).getTime() - 4 * 60 * 60 * 1000).toISOString();
  const to = open.openedAt;

  return (
    <div className="flex min-h-full flex-col">
      <PanelBody>
        <PanelSection title="Параметры">
          <AttrGrid
            rows={[
              ["Инструмент", open.instrument],
              ["Открыто", formatDateTime(open.openedAt)],
              ["Цена", formatMoney(open.price, 4)],
              ["Количество", formatMoney(open.quantity, 4)],
              ["Плечо", formatMoney(open.leverage, 2)],
              ["Комиссия", formatMoney(open.commission)],
              ["Stop Loss", open.stopLoss == null ? "—" : formatMoney(open.stopLoss, 4)],
              ["Take Profit", open.takeProfit == null ? "—" : formatMoney(open.takeProfit, 4)],
            ]}
          />
          <TradeAmountSummary
            price={open.price}
            quantity={open.quantity}
            leverage={open.leverage}
            commission={open.commission + (open.close?.commission ?? 0)}
          />
          {open.openReason ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">
              {open.openReason}
            </p>
          ) : null}
          {open.close ? (
            <button
              type="button"
              className="text-left text-sm text-primary underline-offset-4 hover:underline"
              onClick={() =>
                push({
                  type: "view-close",
                  title: `Закрытие ${open.instrument}`,
                  data: { closeId: open.close!.id },
                })
              }
            >
              Есть закрытие · PnL {formatMoney(open.close.pnl)} →
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Позиция открыта</p>
          )}
        </PanelSection>
        <PanelSection title="График (openedAt − 4ч → openedAt)">
          <TradeChart
            symbol={open.instrument}
            from={from}
            to={to}
            stopLoss={open.stopLoss}
            takeProfit={open.takeProfit}
            entryPrice={open.price}
            entryTime={open.openedAt}
          />
        </PanelSection>
      </PanelBody>
      <PanelActions>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(true)}>
          Изменить
        </Button>
        {!open.close ? (
          <Button
            type="button"
            className="flex-1"
            onClick={() =>
              replace({
                type: "create-close",
                title: "Закрыть позицию",
                data: {
                  openId: open.id,
                  openLabel: `${open.instrument} · вход ${formatMoney(open.price, 4)}`,
                  instrument: open.instrument,
                  entryPrice: open.price,
                },
              })
            }
          >
            Закрыть
          </Button>
        ) : null}
      </PanelActions>
    </div>
  );
}

export function ViewClosePanel({
  closeId,
  onDone,
}: {
  closeId: string;
  onDone: RefreshFn;
}) {
  const { push } = useStackedPanel();
  const [close, setClose] = React.useState<SerializedClose | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/closes?id=${encodeURIComponent(closeId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setClose(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [closeId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error || !close) {
    return <ErrorState title="Не удалось загрузить" description={error ?? undefined} onRetry={load} />;
  }

  if (editing) {
    return (
      <CloseTradeForm
        openId={close.openId}
        openLabel={`${close.open.instrument} · вход ${formatMoney(close.open.price, 4)}`}
        submitLabel="Сохранить"
        initial={{
          closedAt: toLocalInput(new Date(close.closedAt)),
          price: String(close.price),
          commission: String(close.commission),
          closeReason: close.closeReason,
        }}
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          const res = await fetch("/api/closes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: close.id,
              closedAt: localInputToIso(values.closedAt),
              price: parseRequiredNumber(values.price, "цена"),
              commission: parseRequiredNumber(values.commission, "комиссия"),
              closeReason: values.closeReason,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Ошибка");
          setClose(data);
          setEditing(false);
          await onDone();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PanelBody>
        <PanelSection title="Результат">
          <div
            className={`rounded-xl px-4 py-3 text-2xl font-semibold tabular-nums ${
              close.pnl >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
            }`}
          >
            {close.pnl >= 0 ? "+" : ""}
            {formatMoney(close.pnl)}
          </div>
          <AttrGrid
            rows={[
              ["Инструмент", close.open.instrument],
              ["Закрыто", formatDateTime(close.closedAt)],
              ["Цена выхода", formatMoney(close.price, 4)],
              ["Комиссия закрытия", formatMoney(close.commission)],
              ["Причина", CLOSE_REASON_LABELS[close.closeReason]],
              ["Цена входа", formatMoney(close.open.price, 4)],
              ["Открыто", formatDateTime(close.open.openedAt)],
            ]}
          />
          <TradeAmountSummary
            price={close.open.price}
            quantity={close.open.quantity}
            leverage={close.open.leverage}
            commission={close.open.commission + close.commission}
          />
          <button
            type="button"
            className="text-left text-sm text-primary underline-offset-4 hover:underline"
            onClick={() =>
              push({
                type: "view-open",
                title: `Открытие ${close.open.instrument}`,
                data: { openId: close.openId },
              })
            }
          >
            Открыть связанное открытие →
          </button>
        </PanelSection>
        <PanelSection title="График (openedAt → closedAt)">
          <TradeChart
            symbol={close.open.instrument}
            from={close.open.openedAt}
            to={close.closedAt}
            stopLoss={close.open.stopLoss}
            takeProfit={close.open.takeProfit}
            entryPrice={close.open.price}
            entryTime={close.open.openedAt}
            exitPrice={close.price}
            exitTime={close.closedAt}
          />
        </PanelSection>
      </PanelBody>
      <PanelActions>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(true)}>
          Изменить
        </Button>
      </PanelActions>
    </div>
  );
}

function AttrGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
