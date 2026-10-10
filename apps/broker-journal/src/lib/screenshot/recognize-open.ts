import { PSM } from "tesseract.js";
import {
  preprocessScreenshot,
  recognizeLatinWord,
  recognizePage,
} from "./ocr";
import {
  findCyrillicVolumeTicker,
  parseOpenScreenshot,
  ScreenshotParseError,
  type ParsedOpenScreenshot,
} from "./parse-open";

/**
 * Dark Walt screens read best inverted, as a single column:
 * that pass keeps the Latin ticker (GRAM). A uniform block sometimes
 * turns it into Cyrillic lookalikes, so it is only a fallback.
 */
const ATTEMPTS: { invert: boolean; psm: PSM }[] = [
  { invert: true, psm: PSM.SINGLE_COLUMN },
  { invert: true, psm: PSM.SINGLE_BLOCK },
  { invert: false, psm: PSM.SINGLE_COLUMN },
];

export async function recognizeOpenScreenshot(
  image: Buffer
): Promise<ParsedOpenScreenshot> {
  let lastError: ScreenshotParseError | null = null;

  for (const attempt of ATTEMPTS) {
    const prepared = await preprocessScreenshot(image, attempt.invert);
    const page = await recognizePage(prepared, attempt.psm);
    try {
      return await parseOpenPage(prepared, page.text, page.words);
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
    new ScreenshotParseError("Не удалось разобрать скриншот открытия.")
  );
}

async function parseOpenPage(
  image: Buffer,
  text: string,
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[]
): Promise<ParsedOpenScreenshot> {
  try {
    return parseOpenScreenshot(text);
  } catch (error) {
    if (!(error instanceof ScreenshotParseError) || !/объём и тикер/i.test(error.message)) {
      throw error;
    }
    const tickerWord = findCyrillicVolumeTicker(words);
    if (!tickerWord) throw error;
    const latin = (await recognizeLatinWord(image, tickerWord.bbox)).toUpperCase();
    if (!/^[A-Z]{2,16}$/.test(latin)) throw error;
    return parseOpenScreenshot(text.replace(tickerWord.text, latin));
  }
}
