"use client";

import { StatWidget } from "./ui";
import {
  calcOpenCost,
  calcOpenSpread,
  calcPurchase,
  formatMoney,
  signedOpenCash,
  type TradeSide,
} from "../lib/journal";

export function TradeAmountSummary({
  price,
  quantity,
  leverage,
  commission,
  cashAmount = null,
  spreadCommission,
  side = "long",
}: {
  price: number;
  quantity: number;
  leverage: number;
  commission: number;
  /** Account movement. A positive value is debited, a negative value is received. */
  cashAmount?: number | null;
  /** Commission used for the spread baseline. Defaults to `commission`. */
  spreadCommission?: number;
  side?: TradeSide;
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
  const signedCash =
    cashAmount != null && Number.isFinite(cashAmount) ? signedOpenCash(cashAmount, side) : null;
  const spreadReady =
    ready &&
    signedCash != null &&
    Number.isFinite(baselineCommission) &&
    baselineCommission >= 0;
  const spread = spreadReady
    ? calcOpenSpread(calcOpenCost(price, quantity, leverage, baselineCommission), signedCash)
    : null;
  const received = side === "short";
  const favorable = spread != null && (received ? spread > 0 : spread < 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatWidget
        label={received ? "Сумма продажи" : "Сумма покупки"}
        value={purchase}
        hint="Цена × количество"
      />
      <StatWidget
        label={received ? "Сумма поступления" : "Сумма затрат"}
        value={cost}
        hint="Маржа и комиссия, плечо платит платформа"
      />
      {signedCash != null ? (
        <StatWidget
          label={received ? "Получено" : "Списано"}
          value={formatMoney(signedCash)}
          hint={received ? "Зачисление на ваш счёт" : "Списание с вашего счёта"}
        />
      ) : null}
      {spread != null ? (
        <StatWidget
          label="Спред"
          value={`${spread > 0 ? "+" : ""}${formatMoney(spread)}`}
          hint="На сколько движение отличается от маржи и комиссии"
          tone={spread === 0 ? "muted" : favorable ? "positive" : "negative"}
        />
      ) : null}
    </div>
  );
}
