import assert from "node:assert/strict";
import test from "node:test";
import {
  closeMatchWarnings,
  parseCloseScreenshot,
} from "./parse-close";
import { ScreenshotParseError } from "./parse-open";

/** Text Tesseract produced for the Walt short-close fixture (uniform block). */
const WALT_CLOSE = `
11:34
Walt (ранее Кошелёк)
Прибыль
+436 %
2х Шорт
Детали сделки
Прибыль
+2,23 $
Объём
96,52 $ = 0,0012 ВТС
Цена входа
82 301,80 $
Цена при закрытии
80 437,10 $
Комиссия
0,08 $ = 0,086873 USDT
Дата
8 октября 2026 г. в 20:26
`;

test("parses a Walt short-close screen", () => {
  const parsed = parseCloseScreenshot(WALT_CLOSE);
  assert.deepEqual(parsed.values, {
    closedAt: "2026-10-08T20:26",
    price: "80437.1",
    commission: "0.08",
    closeReason: "manual",
  });
  assert.equal(parsed.screen.instrument, "BTC");
  assert.equal(parsed.screen.side, "short");
  assert.equal(parsed.screen.entryPrice, "82301.8");
  assert.equal(parsed.screen.quantity, "0.0012");
  assert.equal(parsed.screen.leverage, "2");
  assert.equal(parsed.screen.profitUsd, "+2.23");
  assert.match(parsed.warnings.join("\n"), /шорт/);
  assert.match(parsed.warnings.join("\n"), /BTC/);
  assert.equal(
    parsed.warnings.some((warning) => warning.startsWith("Объём")),
    false
  );
});

test("reads a latin ticker and a take-profit label", () => {
  const parsed = parseCloseScreenshot(
    WALT_CLOSE.replace("ВТС", "BTC").replace("Прибыль", "Тейк-профит").replace("Шорт", "Лонг")
  );
  assert.equal(parsed.screen.instrument, "BTC");
  assert.equal(parsed.screen.side, "long");
  assert.equal(parsed.values.closeReason, "take_profit");
});

test("rejects an open screen", () => {
  assert.throws(
    () =>
      parseCloseScreenshot(
        "Лонг открыт\n2х Лонг\nОбъём\n98,73 $ = 68,243888 GRAM\nЦена входа\n1,446 $"
      ),
    (error: unknown) =>
      error instanceof ScreenshotParseError && /открытие/i.test(error.message)
  );
});

test("warns when the screenshot is a different position", () => {
  const parsed = parseCloseScreenshot(WALT_CLOSE);
  const warnings = closeMatchWarnings(parsed.screen, {
    instrument: "CL=F",
    entryPrice: 72.15,
  });
  assert.match(warnings.join("\n"), /BTC/);
  assert.match(warnings.join("\n"), /CL=F/);
  assert.match(warnings.join("\n"), /82301\.8/);
});

test("stays quiet when the open matches the screenshot", () => {
  const parsed = parseCloseScreenshot(WALT_CLOSE);
  const warnings = closeMatchWarnings(parsed.screen, {
    instrument: "btc",
    entryPrice: 82301.8,
  });
  assert.deepEqual(warnings, []);
});
