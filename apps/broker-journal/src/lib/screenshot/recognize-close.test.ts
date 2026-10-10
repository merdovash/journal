import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { shutdownOcr } from "./ocr";
import { recognizeCloseScreenshot } from "./recognize-close";

test(
  "reads the Walt close fixture with the local OCR model",
  { timeout: 60_000 },
  async () => {
    const imagePath = path.join(process.cwd(), "fixtures", "walt-close-short.jpg");
    const image = fs.readFileSync(imagePath);
    try {
      const parsed = await recognizeCloseScreenshot(image);
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
    } finally {
      await shutdownOcr();
    }
  }
);
