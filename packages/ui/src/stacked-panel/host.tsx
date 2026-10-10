"use client";

import * as React from "react";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../components/button";
import {
  useStackedPanel,
  type PanelEntry,
} from "./context";

export type PanelRenderer = (panel: PanelEntry, index: number) => React.ReactNode;

type StackedPanelHostProps = {
  renderPanel: PanelRenderer;
  className?: string;
  /** Backdrop click pops one level when depth > 0 */
  closeOnBackdrop?: boolean;
};

/**
 * Mobile-wallet style stacked sheets:
 * - overlay dims the base content
 * - each push slides a full-height panel from the right
 * - back / X pops; deeper panels sit slightly offset
 */
export function StackedPanelHost({
  renderPanel,
  className,
  closeOnBackdrop = true,
}: StackedPanelHostProps) {
  const { stack, pop, clear, depth } = useStackedPanel();

  React.useEffect(() => {
    if (!depth) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depth, pop]);

  React.useEffect(() => {
    if (!depth) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [depth]);

  if (!depth) return null;

  return (
    <div
      className={cn("fixed inset-0 z-50 flex justify-end", className)}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Закрыть панели"
        className="absolute inset-0 bg-black/45 transition-opacity animate-in fade-in"
        onClick={() => {
          if (closeOnBackdrop) {
            if (depth === 1) clear();
            else pop();
          }
        }}
      />
      <div className="relative flex h-full w-full max-w-lg items-stretch pointer-events-none">
        {stack.map((panel, index) => {
          const isTop = index === stack.length - 1;
          const offset = (stack.length - 1 - index) * 12;
          return (
            <div
              key={panel.id}
              className={cn(
                "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-card text-card-foreground shadow-2xl pointer-events-auto border-l border-border",
                "transition-transform duration-300 ease-out",
                isTop ? "translate-x-0" : "translate-x-0"
              )}
              style={{
                transform: `translateX(-${offset}px) scale(${1 - (stack.length - 1 - index) * 0.02})`,
                zIndex: 10 + index,
              }}
              role="dialog"
              aria-modal={isTop}
              aria-label={panel.title ?? "Панель"}
            >
              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={index === 0 ? "Закрыть" : "Назад"}
                  onClick={() => (index === 0 && stack.length === 1 ? clear() : pop())}
                >
                  {index === 0 ? <X /> : <ChevronLeft />}
                </Button>
                <h2 className="flex-1 truncate text-base font-semibold tracking-tight">
                  {panel.title ?? "Детали"}
                </h2>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Закрыть все"
                    onClick={() => clear()}
                  >
                    <X />
                  </Button>
                ) : null}
              </header>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {renderPanel(panel, index)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
