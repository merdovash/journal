import assert from "node:assert/strict";
import { test } from "vitest";
import {
  findCyrillicVolumeTicker,
  parseOpenScreenshot,
  ScreenshotParseError,
} from "./parse-open";

const WALT_COLUMN = `
11:14 В © и! = Gat
Walt (ранее Кошелёк)
Лонг открыт
4940 $
2х Лонг
Детали сделки
Бонусы
+15 Ф
Объём
98,73 $ = 68,243888 GRAM
Цена входа
1,446 $
Комиссия
0,088 $ = 0.08886 USDT
Дата
9 октября 2026 г. в 23:23
`;

test("parses a Walt long-open screen", () => {
  const parsed = parseOpenScreenshot(WALT_COLUMN);
  assert.deepEqual(parsed.values, {
    openedAt: "2026-10-09T23:23",
    instrument: "GRAM",
    price: "1.446",
    commission: "0.088",
    stopLoss: "",
    takeProfit: "",
    leverage: "2",
    quantity: "68.243888",
    openReason: "",
  });
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /\+15/);
});

test("accepts the approx sign and a cyrillic multiply", () => {
  const parsed = parseOpenScreenshot(
    WALT_COLUMN.replace("=", "≈").replace("2х", "2×")
  );
  assert.equal(parsed.values.instrument, "GRAM");
  assert.equal(parsed.values.leverage, "2");
});

test("rejects a short", () => {
  assert.throws(
    () => parseOpenScreenshot("Шорт открыт\n2х Шорт\nДата\n9 октября 2026 г. в 23:23"),
    (error: unknown) =>
      error instanceof ScreenshotParseError && /шорт/i.test(error.message)
  );
});

test("rejects a close screen", () => {
  assert.throws(
    () => parseOpenScreenshot("Лонг закрыт\n9 октября 2026 г. в 23:23"),
    (error: unknown) =>
      error instanceof ScreenshotParseError && /закрытие/i.test(error.message)
  );
});

const WALT_POSITION = `
Ваша позиция
49,88 $ 2х ЛОНГ
Объём 99,36 $
Цена ликвидации 41 733,11 $
Расчётная цена 82 804,90 $
Цена входа 82 459,70 $
Комиссия за удержание цены -0,00446 $
Продажа 100% тп 1,98 $
Цена: 84 112,60 $
Продажа 100% сл -0,99 $
Цена: 81 638,70 $
Закрыть Лонг
`;

test("parses a Walt live position screen", () => {
  const parsed = parseOpenScreenshot(WALT_POSITION);
  assert.deepEqual(parsed.values, {
    openedAt: "",
    instrument: "",
    price: "82459.7",
    commission: "0",
    stopLoss: "81638.7",
    takeProfit: "84112.6",
    leverage: "2",
    quantity: "0.00119993",
    openReason: "",
  });
  const notes = parsed.warnings.join("\n");
  assert.match(notes, /тикер/);
  assert.match(notes, /дат/);
  assert.match(notes, /0\.00119993/);
  assert.match(notes, /-0\.00446/);
});

test("rejects a live short position", () => {
  assert.throws(
    () => parseOpenScreenshot(WALT_POSITION.replace("ЛОНГ", "ШОРТ")),
    (error: unknown) => error instanceof ScreenshotParseError && /шорт/i.test(error.message)
  );
});

test("finds a cyrillic ticker word after the quantity", () => {
  const words = [
    { text: "98,73" },
    { text: "$" },
    { text: "=" },
    { text: "68,243888" },
    { text: "СВАМ" },
    { text: "0,08886" },
    { text: "USDT" },
  ];
  assert.equal(findCyrillicVolumeTicker(words)?.text, "СВАМ");
});

test("does not invent a ticker from cyrillic lookalikes", () => {
  assert.throws(
    () =>
      parseOpenScreenshot(
        WALT_COLUMN.replace("GRAM", "СВАМ")
      ),
    ScreenshotParseError
  );
});
