"use client";

import { StatWidget } from "./ui";
import { calcOpenCost, calcPurchase, formatMoney } from "../lib/journal";

export function TradeAmountSummary({
  price,
  quantity,
  leverage,
  commission,
}: {
  price: number;
  quantity: number;
  leverage: number;
  commission: number;
}) {
  const ready =
    price > 0 &&
    quantity > 0 &&
    leverage > 0 &&
    Number.isFinite(commission) &&
    commission >= 0;
  const purchase = ready ? formatMoney(calcPurchase(price, quantity)) : "—";
  const cost = ready ? formatMoney(calcOpenCost(price, quantity, leverage, commission)) : "—";

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatWidget label="Сумма покупки" value={purchase} hint="Цена × количество" />
      <StatWidget label="Сумма затрат" value={cost} hint="Маржа и комиссия" />
    </div>
  );
}
