export type CloseReason = "manual" | "take_profit" | "stop_loss";

export type TradeClose = {
  id: string;
  openId: string;
  closedAt: string;
  price: number | string;
  commission: number | string;
  closeReason: CloseReason;
};

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

/** Long PnL: (close - open) * qty - both commissions */
export function calcNetPnl(
  openPrice: number,
  closePrice: number,
  quantity: number,
  openCommission: number,
  closeCommission: number
): number {
  return (closePrice - openPrice) * quantity - openCommission - closeCommission;
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

export type JournalStats = {
  startingBalance: number;
  balance: number;
  invested: number;
  earned: number;
  commissions: number;
};

export function computeStats(
  startingBalance: number,
  opens: TradeOpenWithClose[]
): JournalStats {
  let commissions = 0;
  let earned = 0;
  let invested = 0;

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
        closeComm
      );
    } else {
      invested += calcMargin(d(open.price), d(open.quantity), d(open.leverage));
    }
  }

  const balance = startingBalance + earned - invested;

  return {
    startingBalance: round6(startingBalance),
    balance: round6(balance),
    invested: round6(invested),
    earned: round6(earned),
    commissions: round6(commissions),
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
      pnl: number;
    };

export function toRegistryItems(opens: TradeOpenWithClose[]): RegistryItem[] {
  const items: RegistryItem[] = [];

  for (const open of opens) {
    items.push({
      kind: "open",
      id: open.id,
      at: iso(open.openedAt),
      instrument: open.instrument,
      price: d(open.price),
      commission: d(open.commission),
      quantity: d(open.quantity),
      leverage: d(open.leverage),
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
        d(open.close.commission)
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
        pnl,
      });
    }
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
            d(open.close.commission)
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

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  manual: "Вручную",
  take_profit: "Тейк-профит",
  stop_loss: "Стоп-лосс",
};
