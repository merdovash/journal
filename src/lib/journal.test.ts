import assert from "node:assert/strict";
import { test } from "vitest";
import { calcNetPnl, calcOpenCost, calcOpenSpread, calcPurchase, computeStats, type TradeOpenWithClose } from "./journal";

test("purchase is entry price times quantity", () => {
  assert.equal(calcPurchase(1.446, 68.243888), 98.680662);
  assert.equal(calcPurchase(82459.7, 0.00119993), 98.945868);
});

test("balance adds deposits and subtracts withdrawals and open margin", () => {
  const open: TradeOpenWithClose = {
    id: "o",
    openedAt: "2026-01-01T00:00:00.000Z",
    instrument: "GC=F",
    price: 100,
    commission: 1,
    stopLoss: null,
    takeProfit: null,
    leverage: 10,
    quantity: 2,
    side: "long",
    cashAmount: null,
    openReason: "",
    close: null,
  };
  const stats = computeStats(1000, [open], [
    { id: "d", kind: "deposit", amount: 500, occurredAt: "2026-01-02T00:00:00.000Z", note: "" },
    { id: "w", kind: "withdrawal", amount: 200, occurredAt: "2026-01-03T00:00:00.000Z", note: "" },
  ]);
  assert.equal(stats.deposited, 500);
  assert.equal(stats.withdrawn, 200);
  assert.equal(stats.invested, 20);
  assert.equal(stats.balance, 1280);
});

test("short pnl is the opposite of a long", () => {
  assert.equal(calcNetPnl(10, 12, 2, 1, 1, "long"), 2);
  assert.equal(calcNetPnl(10, 12, 2, 1, 1, "short"), -6);
});

test("spread is actual cash minus the expected debit", () => {
  const cost = calcOpenCost(1.446, 68.243888, 2, 0.088);
  assert.equal(calcOpenSpread(cost, -cost), 0);
  assert.equal(calcOpenSpread(cost, -50), -0.571669);
  assert.equal(calcOpenSpread(10, 2), 12);
});

test("cost is margin plus commission", () => {
  assert.equal(calcOpenCost(1.446, 68.243888, 2, 0.088), 49.428331);
  assert.equal(calcOpenCost(72.15, 1, 8, 2), 11.01875);
  assert.equal(calcOpenCost(82459.7, 0.00119993, 2, 0), 49.472934);
});
