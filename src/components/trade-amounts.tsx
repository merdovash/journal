"use client";

import { StatWidget } from "./ui";
import { calcOpenCost, calcOpenSpread, calcPurchase, formatMoney } from "../lib/journal";

export function TradeAmountSummary({
  price,
  quantity,
  leverage,
  commission,
  cashAmount = null,
  spreadCommission,
}: {
  price: number;
  quantity: number;
  leverage: number;
  commission: number;
  /** Signed cash at open. Empty when the user did not enter it. */
  cashAmount?: number | null;
  /** Commission used for the spread baseline. Defaults to `commission`. */
  spreadCommission?: number;
}) {
  const ready =
    price > 0 &&
    quantity > 0 &&
    leverage > 0 &&
    Number.isFinite(commission) &&
    commission >= 0;
  const purchase = ready ? formatMoney(calcPurchase(price, quantity)) : "—";
  const cost = ready ? formatMoney(calcOpenCost(price, quantity, leverage, commission)) : "—";
  const baselineCommission = spreadCommission ?? commission;
  const spreadReady =
    ready &&
    cashAmount != null &&
    Number.isFinite(cashAmount) &&
    Number.isFinite(baselineCommission) &&
    baselineCommission >= 0;
  const spread = spreadReady
    ? calcOpenSpread(calcOpenCost(price, quantity, leverage, baselineCommission), cashAmount)
    : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatWidget label="Сумма покупки" value={purchase} hint="Цена × количество" />
      <StatWidget label="Сумма затрат" value={cost} hint="Маржа и комиссия" />
      {cashAmount != null && Number.isFinite(cashAmount) ? (
        <StatWidget
          label="Факт"
          value={formatMoney(cashAmount)}
          hint="Списано минусом, получено плюсом"
        />
      ) : null}
      {spread != null ? (
        <StatWidget
          label="Спред"
          value={`${spread > 0 ? "+" : ""}${formatMoney(spread)}`}
          hint="Факт минус ожидаемое списание"
          tone={spread < 0 ? "negative" : spread > 0 ? "positive" : "muted"}
        />
      ) : null}
    </div>
  );
}
