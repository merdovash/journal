import { PSM } from "tesseract.js";
import { preprocessScreenshot, recognizeText } from "./ocr";
import { parseCloseScreenshot, type ParsedCloseScreenshot } from "./parse-close";
import { ScreenshotParseError } from "./parse-open";

/**
 * A uniform block keeps the signed profit (`+2,23 $`) on the Walt result screen.
 * Single column still has the prices, so it is the fallback.
 */
const ATTEMPTS: { invert: boolean; psm: PSM }[] = [
  { invert: true, psm: PSM.SINGLE_BLOCK },
  { invert: true, psm: PSM.SINGLE_COLUMN },
  { invert: false, psm: PSM.SINGLE_BLOCK },
];

export async function recognizeCloseScreenshot(
  image: Buffer
): Promise<ParsedCloseScreenshot> {
  let lastError: ScreenshotParseError | null = null;

  for (const attempt of ATTEMPTS) {
    const prepared = await preprocessScreenshot(image, attempt.invert);
    const text = await recognizeText(prepared, attempt.psm);
    try {
      return parseCloseScreenshot(text);
    } catch (error) {
      if (error instanceof ScreenshotParseError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new ScreenshotParseError("Не удалось разобрать скриншот закрытия.")
  );
}
