"use client";

import * as React from "react";

export type PanelId = string;

export type PanelEntry = {
  id: PanelId;
  title?: string;
  /** Arbitrary payload for the panel content renderer */
  data?: unknown;
  /** Optional type key so consumers can switch on panel kind */
  type?: string;
};

type StackedPanelContextValue = {
  stack: PanelEntry[];
  push: (panel: Omit<PanelEntry, "id"> & { id?: PanelId }) => PanelId;
  pop: () => void;
  popTo: (id: PanelId) => void;
  replace: (panel: Omit<PanelEntry, "id"> & { id?: PanelId }) => PanelId;
  clear: () => void;
  depth: number;
};

const StackedPanelContext = React.createContext<StackedPanelContextValue | null>(
  null
);

function createId() {
  return `panel_${Math.random().toString(36).slice(2, 10)}`;
}

export function StackedPanelProvider({
  children,
  initialStack = [],
}: {
  children: React.ReactNode;
  initialStack?: PanelEntry[];
}) {
  const [stack, setStack] = React.useState<PanelEntry[]>(initialStack);

  const push = React.useCallback(
    (panel: Omit<PanelEntry, "id"> & { id?: PanelId }) => {
      const id = panel.id ?? createId();
      setStack((prev) => [...prev, { ...panel, id }]);
      return id;
    },
    []
  );

  const pop = React.useCallback(() => {
    setStack((prev) => (prev.length ? prev.slice(0, -1) : prev));
  }, []);

  const popTo = React.useCallback((id: PanelId) => {
    setStack((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      return prev.slice(0, idx + 1);
    });
  }, []);

  const replace = React.useCallback(
    (panel: Omit<PanelEntry, "id"> & { id?: PanelId }) => {
      const id = panel.id ?? createId();
      setStack((prev) => {
        if (!prev.length) return [{ ...panel, id }];
        return [...prev.slice(0, -1), { ...panel, id }];
      });
      return id;
    },
    []
  );

  const clear = React.useCallback(() => setStack([]), []);

  const value = React.useMemo(
    () => ({
      stack,
      push,
      pop,
      popTo,
      replace,
      clear,
      depth: stack.length,
    }),
    [stack, push, pop, popTo, replace, clear]
  );

  return (
    <StackedPanelContext.Provider value={value}>
      {children}
    </StackedPanelContext.Provider>
  );
}

export function useStackedPanel() {
  const ctx = React.useContext(StackedPanelContext);
  if (!ctx) {
    throw new Error("useStackedPanel must be used within StackedPanelProvider");
  }
  return ctx;
}

export function useStackedPanelOptional() {
  return React.useContext(StackedPanelContext);
}
