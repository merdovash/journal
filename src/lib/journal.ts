export type CloseReason = "manual" | "take_profit" | "stop_loss";

export type TradeClose = {
  id: string;
  openId: string;
  closedAt: string;
  price: number | string;
  commission: number | string;
  closeReason: CloseReason;
};

export type TradeSide = "long" | "short";

export type TradeOpen = {
  id: string;
  openedAt: string;
  instrument: string;
  price: number | string;
  commission: number | string;
  stopLoss: number | string | null;
  takeProfit: number | string | null;
  leverage: number | string;
  quantity: number | string;
  side: TradeSide;
  /** Signed cash at open: negative if debited, positive if received. */
  cashAmount: number | string | null;
  openReason: string;
};

export type TradeOpenWithClose = TradeOpen & { close: TradeClose | null };

export function d(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function iso(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Long: (close − open) × qty. Short: (open − close) × qty. Both commissions are subtracted. */
export function calcNetPnl(
  openPrice: number,
  closePrice: number,
  quantity: number,
  openCommission: number,
  closeCommission: number,
  side: TradeSide = "long"
): number {
  const move = side === "short" ? openPrice - closePrice : closePrice - openPrice;
  return move * quantity - openCommission - closeCommission;
}

export function calcMargin(
  price: number,
  quantity: number,
  leverage: number
): number {
  if (!leverage) return price * quantity;
  return (price * quantity) / leverage;
}

/** Notional: what was bought, at the entry price. */
export function calcPurchase(price: number, quantity: number): number {
  return round6(price * quantity);
}

/** Cash committed: margin plus commissions already paid. */
export function calcOpenCost(
  price: number,
  quantity: number,
  leverage: number,
  commission: number
): number {
  return round6(calcMargin(price, quantity, leverage) + commission);
}

/**
 * Spread versus the calculated debit.
 * cashAmount is signed (minus = written off, plus = received).
 * Expected cash change is −cost, so spread = cashAmount − (−cost).
 * Zero means the cash matched the model. Negative means more was written off.
 */
export function calcOpenSpread(cost: number, cashAmount: number): number {
  return round6(cashAmount + cost);
}

export type CashflowKind = "deposit" | "withdrawal";

export type Cashflow = {
  id: string;
  kind: CashflowKind;
  amount: number | string;
  occurredAt: string;
  note: string;
};

export type JournalStats = {
  startingBalance: number;
  balance: number;
  invested: number;
  earned: number;
  commissions: number;
  deposited: number;
  withdrawn: number;
};

export function computeStats(
  startingBalance: number,
  opens: TradeOpenWithClose[],
  cashflows: Cashflow[] = []
): JournalStats {
  let commissions = 0;
  let earned = 0;
  let invested = 0;
  let deposited = 0;
  let withdrawn = 0;

  for (const flow of cashflows) {
    const amount = d(flow.amount);
    if (flow.kind === "deposit") deposited += amount;
    else withdrawn += amount;
  }

  for (const open of opens) {
    const openComm = d(open.commission);
    commissions += openComm;

    if (open.close) {
      const closeComm = d(open.close.commission);
      commissions += closeComm;
      earned += calcNetPnl(
        d(open.price),
        d(open.close.price),
        d(open.quantity),
        openComm,
        closeComm,
        open.side
      );
    } else {
      invested += calcMargin(d(open.price), d(open.quantity), d(open.leverage));
    }
  }

  const balance = startingBalance + deposited - withdrawn + earned - invested;

  return {
    startingBalance: round6(startingBalance),
    balance: round6(balance),
    invested: round6(invested),
    earned: round6(earned),
    commissions: round6(commissions),
    deposited: round6(deposited),
    withdrawn: round6(withdrawn),
  };
}

export type RegistryItem =
  | {
      kind: "open";
      id: string;
      at: string;
      instrument: string;
      price: number;
      commission: number;
      quantity: number;
      leverage: number;
      side: TradeSide;
      cashAmount: number | null;
      spread: number | null;
      openReason: string;
      stopLoss: number | null;
      takeProfit: number | null;
      closed: boolean;
      closeId: string | null;
      purchase: number;
      cost: number;
    }
  | {
      kind: "close";
      id: string;
      openId: string;
      at: string;
      instrument: string;
      price: number;
      commission: number;
      closeReason: CloseReason;
      openPrice: number;
      openCommission: number;
      quantity: number;
      side: TradeSide;
      pnl: number;
    }
  | {
      kind: "deposit";
      id: string;
      at: string;
      amount: number;
      note: string;
    }
  | {
      kind: "withdrawal";
      id: string;
      at: string;
      amount: number;
      note: string;
    };

export function toRegistryItems(
  opens: TradeOpenWithClose[],
  cashflows: Cashflow[] = []
): RegistryItem[] {
  const items: RegistryItem[] = [];

  for (const open of opens) {
    const openCost = calcOpenCost(
      d(open.price),
      d(open.quantity),
      d(open.leverage),
      d(open.commission)
    );
    const cashAmount = open.cashAmount == null ? null : d(open.cashAmount);
    items.push({
      kind: "open",
      id: open.id,
      at: iso(open.openedAt),
      instrument: open.instrument,
      price: d(open.price),
      commission: d(open.commission),
      quantity: d(open.quantity),
      leverage: d(open.leverage),
      side: open.side,
      cashAmount,
      spread: cashAmount == null ? null : calcOpenSpread(openCost, cashAmount),
      openReason: open.openReason,
      stopLoss: open.stopLoss == null ? null : d(open.stopLoss),
      takeProfit: open.takeProfit == null ? null : d(open.takeProfit),
      closed: open.close != null,
      closeId: open.close?.id ?? null,
      purchase: calcPurchase(d(open.price), d(open.quantity)),
      cost: calcOpenCost(
        d(open.price),
        d(open.quantity),
        d(open.leverage),
        d(open.commission) + (open.close ? d(open.close.commission) : 0)
      ),
    });

    if (open.close) {
      const pnl = calcNetPnl(
        d(open.price),
        d(open.close.price),
        d(open.quantity),
        d(open.commission),
        d(open.close.commission),
        open.side
      );
      items.push({
        kind: "close",
        id: open.close.id,
        openId: open.id,
        at: iso(open.close.closedAt),
        instrument: open.instrument,
        price: d(open.close.price),
        commission: d(open.close.commission),
        closeReason: open.close.closeReason,
        openPrice: d(open.price),
        openCommission: d(open.commission),
        quantity: d(open.quantity),
        side: open.side,
        pnl,
      });
    }
  }

  for (const flow of cashflows) {
    items.push({
      kind: flow.kind,
      id: flow.id,
      at: iso(flow.occurredAt),
      amount: d(flow.amount),
      note: flow.note,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}

export function serializeOpen(open: TradeOpenWithClose) {
  return {
    id: open.id,
    openedAt: iso(open.openedAt),
    instrument: open.instrument,
    price: d(open.price),
    commission: d(open.commission),
    stopLoss: open.stopLoss == null ? null : d(open.stopLoss),
    takeProfit: open.takeProfit == null ? null : d(open.takeProfit),
    leverage: d(open.leverage),
    quantity: d(open.quantity),
    side: open.side,
    cashAmount: open.cashAmount == null ? null : d(open.cashAmount),
    openReason: open.openReason,
    close: open.close
      ? {
          id: open.close.id,
          closedAt: iso(open.close.closedAt),
          price: d(open.close.price),
          commission: d(open.close.commission),
          closeReason: open.close.closeReason,
          pnl: calcNetPnl(
            d(open.price),
            d(open.close.price),
            d(open.quantity),
            d(open.commission),
            d(open.close.commission),
            open.side
          ),
        }
      : null,
  };
}

export function formatMoney(value: number, digits = 2): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const SIDE_LABELS: Record<TradeSide, string> = {
  long: "Лонг",
  short: "Шорт",
};

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  manual: "Вручную",
  take_profit: "Тейк-профит",
  stop_loss: "Стоп-лосс",
};
