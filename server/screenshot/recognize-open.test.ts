import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { PSM } from "tesseract.js";
import { preprocessScreenshot, recognizePage, recognizeLatinWord, shutdownOcr } from "./ocr";
import { findCyrillicVolumeTicker, parseOpenScreenshot } from "../../src/lib/screenshot/parse-open";
import { recognizeOpenScreenshot } from "./recognize-open";

test(
  "reads the Walt open fixture with the local OCR model",
  { timeout: 60_000 },
  async () => {
    const imagePath = path.join(process.cwd(), "fixtures", "walt-open-long.jpg");
    const image = fs.readFileSync(imagePath);
    try {
      const parsed = await recognizeOpenScreenshot(image);
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
      assert.match(parsed.warnings.join("\n"), /\+15/);
    } finally {
      await shutdownOcr();
    }
  }
);

test(
  "reads the Walt live-position fixture",
  { timeout: 60_000 },
  async () => {
    const imagePath = path.join(process.cwd(), "fixtures", "walt-open-position.jpg");
    const image = fs.readFileSync(imagePath);
    try {
      const parsed = await recognizeOpenScreenshot(image);
      assert.equal(parsed.values.price, "82459.7");
      assert.equal(parsed.values.leverage, "2");
      assert.equal(parsed.values.quantity, "0.00119993");
      assert.equal(parsed.values.takeProfit, "84112.6");
      assert.equal(parsed.values.stopLoss, "81638.7");
      assert.equal(parsed.values.commission, "0");
      assert.equal(parsed.values.instrument, "");
      assert.equal(parsed.values.openedAt, "");
    } finally {
      await shutdownOcr();
    }
  }
);

test(
  "recovers GRAM when page OCR writes the ticker in Cyrillic",
  { timeout: 60_000 },
  async () => {
    const imagePath = path.join(process.cwd(), "fixtures", "walt-open-long.jpg");
    const prepared = await preprocessScreenshot(fs.readFileSync(imagePath), true);
    try {
      const page = await recognizePage(prepared, PSM.SINGLE_BLOCK);
      const tickerWord = findCyrillicVolumeTicker(page.words);
      assert.ok(tickerWord, page.text);
      const latin = (await recognizeLatinWord(prepared, tickerWord.bbox)).toUpperCase();
      assert.equal(latin, "GRAM");
      const parsed = parseOpenScreenshot(page.text.replace(tickerWord.text, latin));
      assert.equal(parsed.values.instrument, "GRAM");
      assert.equal(parsed.values.quantity, "68.243888");
    } finally {
      await shutdownOcr();
    }
  }
);
