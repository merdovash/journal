"use client";

import * as React from "react";
import { Button } from "./ui";
import { ImageUp } from "lucide-react";
import {
  closeMatchWarnings,
  type CloseScreen,
  type ParsedCloseValues,
} from "../lib/screenshot/parse-close";
import type { ParsedOpenValues } from "../lib/screenshot/parse-open";

function ScreenshotImport<T>({
  endpoint,
  description,
  disabled,
  onParsed,
}: {
  endpoint: string;
  description: string;
  disabled?: boolean;
  onParsed: (payload: { values: T; warnings?: string[]; screen?: CloseScreen }) => string[];
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const json = (await res.json()) as {
        error?: string;
        values?: T;
        warnings?: string[];
        screen?: CloseScreen;
      };
      if (!res.ok || !json.values) {
        throw new Error(json.error ?? "Не удалось разобрать скриншот");
      }
      setWarnings(onParsed({ values: json.values, warnings: json.warnings, screen: json.screen }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось разобрать скриншот");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{description}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <ImageUp className="size-4" />
        {busy ? "Читаем скриншот…" : "Заполнить по скриншоту"}
      </Button>
      {warnings.map((warning) => (
        <p key={warning} className="text-sm text-muted-foreground">
          {warning}
        </p>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ScreenshotOpenImport({
  disabled,
  onApply,
}: {
  disabled?: boolean;
  onApply: (values: ParsedOpenValues) => void;
}) {
  return (
    <ScreenshotImport<ParsedOpenValues>
      endpoint="/api/opens/parse-screenshot"
      description="Экран Walt «Лонг открыт» или «Ваша позиция». Поля подставятся в форму — сделка сохранится после проверки."
      disabled={disabled}
      onParsed={(payload) => {
        onApply(payload.values);
        return payload.warnings ?? [];
      }}
    />
  );
}

export function ScreenshotCloseImport({
  disabled,
  openInstrument,
  openEntryPrice,
  onApply,
}: {
  disabled?: boolean;
  openInstrument?: string;
  openEntryPrice?: number;
  onApply: (values: ParsedCloseValues) => void;
}) {
  return (
    <ScreenshotImport<ParsedCloseValues>
      endpoint="/api/closes/parse-screenshot"
      description="Экран результата в Walt: цена при закрытии, комиссия и дата. Поля подставятся в форму — закрытие сохранится после проверки."
      disabled={disabled}
      onParsed={(payload) => {
        onApply(payload.values);
        const warnings = [...(payload.warnings ?? [])];
        if (payload.screen && openInstrument && openEntryPrice != null) {
          warnings.push(
            ...closeMatchWarnings(payload.screen, {
              instrument: openInstrument,
              entryPrice: openEntryPrice,
            })
          );
        }
        return warnings;
      }}
    />
  );
}
