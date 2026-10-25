"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Textarea,
  PanelActions,
  PanelBody,
  PanelSection,
} from "./ui";
import type { ParsedCloseValues } from "../lib/screenshot/parse-close";
import type { ParsedOpenValues } from "../lib/screenshot/parse-open";
import type { TradeSide } from "../lib/journal";
import { SIDE_LABELS, signedOpenCash } from "../lib/journal";
import { ScreenshotCloseImport, ScreenshotOpenImport } from "./screenshot-open-import";
import { TradeAmountSummary } from "./trade-amounts";

export type OpenFormValues = {
  openedAt: string;
  instrument: string;
  price: string;
  commission: string;
  stopLoss: string;
  takeProfit: string;
  leverage: string;
  quantity: string;
  side: TradeSide;
  cashAmount: string;
  openReason: string;
};

const emptyOpen: OpenFormValues = {
  openedAt: toLocalInput(new Date()),
  instrument: "",
  price: "",
  commission: "0",
  stopLoss: "",
  takeProfit: "",
  leverage: "10",
  quantity: "1",
  side: "long",
  cashAmount: "",
  openReason: "",
};

export function OpenTradeForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  enableScreenshot = false,
}: {
  initial?: Partial<OpenFormValues>;
  submitLabel: string;
  onSubmit: (values: OpenFormValues) => Promise<void>;
  onCancel?: () => void;
  enableScreenshot?: boolean;
}) {
  const [values, setValues] = React.useState<OpenFormValues>({
    ...emptyOpen,
    ...initial,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set =
    (key: keyof OpenFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
    };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col">
      <PanelBody>
        {enableScreenshot ? (
          <PanelSection title="Скриншот">
            <ScreenshotOpenImport
              disabled={busy}
              onApply={(values: ParsedOpenValues) =>
                setValues((current) => ({ ...current, ...values }))
              }
            />
          </PanelSection>
        ) : null}
        <PanelSection title="Инструмент">
          <Field label="Тикер (Yahoo)">
            <Input
              required
              placeholder="GC=F"
              value={values.instrument}
              onChange={set("instrument")}
            />
          </Field>
          <Field label="Дата и время открытия">
            <Input
              required
              type="datetime-local"
              value={values.openedAt}
              onChange={set("openedAt")}
            />
          </Field>
        </PanelSection>
        <PanelSection title="Параметры">
          <Field label="Направление">
            <div className="grid grid-cols-2 gap-2">
              {(["long", "short"] as const).map((side) => {
                const selected = values.side === side;
                return (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={selected}
                    className={`h-10 rounded-lg border text-sm font-medium ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground"
                    }`}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        side,
                        cashAmount: cashInputForSide(current.cashAmount, side),
                      }))
                    }
                  >
                    {SIDE_LABELS[side]}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Цена">
              <Input required type="number" step="any" value={values.price} onChange={set("price")} />
            </Field>
            <Field label="Комиссия">
              <Input
                required
                type="number"
                step="any"
                min="0"
                value={values.commission}
                onChange={set("commission")}
              />
            </Field>
            <Field label="Количество">
              <Input
                required
                type="number"
                step="any"
                min="0"
                value={values.quantity}
                onChange={set("quantity")}
              />
            </Field>
            <Field label="Плечо">
              <Input
                required
                type="number"
                step="any"
                min="0"
                value={values.leverage}
                onChange={set("leverage")}
              />
            </Field>
            <Field label="Stop Loss">
              <Input type="number" step="any" value={values.stopLoss} onChange={set("stopLoss")} />
            </Field>
            <Field label="Take Profit">
              <Input
                type="number"
                step="any"
                value={values.takeProfit}
                onChange={set("takeProfit")}
              />
            </Field>
          </div>
          <Field label={values.side === "short" ? "Получено" : "Списано"}>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="Необязательно"
              value={values.cashAmount}
              onChange={set("cashAmount")}
              onBlur={() =>
                setValues((current) => ({
                  ...current,
                  cashAmount: cashInputForSide(current.cashAmount, current.side),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {values.side === "short"
                ? "Шорт зачисляет деньги на счёт, минус ставится сам. Плечо не входит — его оплачивает платформа."
                : "Лонг списывает деньги со счёта. Плечо не входит — его оплачивает платформа."}
            </p>
          </Field>
        </PanelSection>
        <PanelSection title="Итог">
          <TradeAmountSummary
            price={Number(values.price)}
            quantity={Number(values.quantity)}
            leverage={Number(values.leverage)}
            commission={Number(values.commission)}
            side={values.side}
            cashAmount={values.cashAmount.trim() ? Number(values.cashAmount) : null}
          />
        </PanelSection>
        <PanelSection title="Причина">
          <Field label="Комментарий">
            <Textarea
              rows={3}
              placeholder="Почему открыли позицию"
              value={values.openReason}
              onChange={set("openReason")}
            />
          </Field>
        </PanelSection>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </PanelBody>
      <PanelActions>
        {onCancel ? (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Сохранение…" : submitLabel}
        </Button>
      </PanelActions>
    </form>
  );
}

export type CloseFormValues = {
  openId: string;
  closedAt: string;
  price: string;
  commission: string;
  closeReason: "manual" | "take_profit" | "stop_loss";
};

export function CloseTradeForm({
  openId,
  openLabel,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  enableScreenshot = false,
  openInstrument,
  openEntryPrice,
}: {
  openId: string;
  openLabel?: string;
  initial?: Partial<CloseFormValues>;
  submitLabel: string;
  onSubmit: (values: CloseFormValues) => Promise<void>;
  onCancel?: () => void;
  enableScreenshot?: boolean;
  openInstrument?: string;
  openEntryPrice?: number;
}) {
  const [values, setValues] = React.useState<CloseFormValues>({
    openId,
    closedAt: toLocalInput(new Date()),
    price: "",
    commission: "0",
    closeReason: "manual",
    ...initial,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col">
      <PanelBody>
        {enableScreenshot ? (
          <PanelSection title="Скриншот">
            <ScreenshotCloseImport
              disabled={busy}
              openInstrument={openInstrument}
              openEntryPrice={openEntryPrice}
              onApply={(parsed: ParsedCloseValues) =>
                setValues((current) => ({ ...current, ...parsed, openId: current.openId }))
              }
            />
          </PanelSection>
        ) : null}
        <PanelSection title="Закрытие">
          {openLabel ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">{openLabel}</p>
          ) : null}
          <Field label="Дата и время закрытия">
            <Input
              required
              type="datetime-local"
              value={values.closedAt}
              onChange={(e) => setValues((v) => ({ ...v, closedAt: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Цена выхода">
              <Input
                required
                type="number"
                step="any"
                value={values.price}
                onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
              />
            </Field>
            <Field label="Комиссия">
              <Input
                required
                type="number"
                step="any"
                min="0"
                value={values.commission}
                onChange={(e) => setValues((v) => ({ ...v, commission: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Причина закрытия">
            <select
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={values.closeReason}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  closeReason: e.target.value as CloseFormValues["closeReason"],
                }))
              }
            >
              <option value="manual">Вручную</option>
              <option value="take_profit">Тейк-профит</option>
              <option value="stop_loss">Стоп-лосс</option>
            </select>
          </Field>
        </PanelSection>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </PanelBody>
      <PanelActions>
        {onCancel ? (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Сохранение…" : submitLabel}
        </Button>
      </PanelActions>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Magnitude from the field, sign from the direction. Empty stays empty. */
export function cashInputForSide(raw: string, side: TradeSide): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return raw;
  const signed = signedOpenCash(amount, side);
  return Object.is(signed, amount) ? raw : String(signed);
}

export function signedCashFromInput(raw: string, side: TradeSide): number | null {
  const amount = parseOptionalNumber(raw);
  return amount == null ? null : signedOpenCash(amount, side);
}

export function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error("Некорректное число");
  return n;
}

export function parseRequiredNumber(value: string, label: string): number {
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`Некорректное поле: ${label}`);
  return n;
}
