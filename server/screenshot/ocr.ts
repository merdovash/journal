import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";

export class ScreenshotInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenshotInputError";
  }
}

type OcrGlobal = typeof globalThis & {
  __journalOcrWorker?: Promise<Worker>;
};

const g = globalThis as OcrGlobal;

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** tessdata_fast LSTM weights vendored in the repo. */
export function tessdataDir(): string {
  const candidates = [
    path.join(process.cwd(), "models", "tessdata"),
    path.join(process.cwd(), "apps", "broker-journal", "models", "tessdata"),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "eng.traineddata")) &&
      fs.existsSync(path.join(dir, "rus.traineddata"))
    ) {
      return dir;
    }
  }
  throw new Error(
    "Не найдены веса OCR в models/tessdata (eng.traineddata и rus.traineddata)."
  );
}

async function getWorker(): Promise<Worker> {
  if (!g.__journalOcrWorker) {
    const langPath = tessdataDir();
    g.__journalOcrWorker = createWorker("rus+eng", 1, {
      langPath,
      cachePath: langPath,
      gzip: false,
    }).catch((error: unknown) => {
      g.__journalOcrWorker = undefined;
      throw error;
    });
  }
  return g.__journalOcrWorker;
}

export async function preprocessScreenshot(
  image: Buffer,
  invert: boolean
): Promise<Buffer> {
  try {
    let pipeline = sharp(image, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, kernel: "lanczos3" })
      .grayscale();
    if (invert) pipeline = pipeline.negate();
    return await pipeline.normalise().png().toBuffer();
  } catch {
    throw new ScreenshotInputError("Файл не похож на изображение.");
  }
}

export type OcrBox = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; bbox: OcrBox };

type OcrTreeWord = { text?: string; bbox?: OcrBox };
type OcrTreeLine = { words?: OcrTreeWord[] };
type OcrTreeParagraph = { lines?: OcrTreeLine[] };
type OcrTreeBlock = { paragraphs?: OcrTreeParagraph[] };

export function recognizeText(image: Buffer, psm: PSM): Promise<string> {
  return recognizePage(image, psm).then((page) => page.text);
}

export function recognizePage(
  image: Buffer,
  psm: PSM
): Promise<{ text: string; words: OcrWord[] }> {
  return enqueue(async () => {
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      tessedit_char_whitelist: "",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(image, {}, { text: true, blocks: true });
    const words: OcrWord[] = [];
    for (const block of (result.data.blocks ?? []) as OcrTreeBlock[]) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            if (!word.text || !word.bbox) continue;
            words.push({ text: word.text, bbox: word.bbox });
          }
        }
      }
    }
    return { text: result.data.text ?? "", words };
  });
}

/** One word, Latin letters only. Used when rus+eng reads GRAM as СВАМ. */
export function recognizeLatinWord(image: Buffer, bbox: OcrBox): Promise<string> {
  return enqueue(async () => {
    const worker = await getWorker();
    try {
      const crop = await cropBox(image, bbox);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(crop);
      return (result.data.text ?? "").trim().split(/\s+/)[0] ?? "";
    } finally {
      await worker.setParameters({ tessedit_char_whitelist: "" });
    }
  });
}

async function cropBox(image: Buffer, bbox: OcrBox): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  const pad = 8;
  const left = clamp(Math.floor(bbox.x0) - pad, 0, Math.max(0, imageWidth - 2));
  const top = clamp(Math.floor(bbox.y0) - pad, 0, Math.max(0, imageHeight - 2));
  const right = clamp(Math.ceil(bbox.x1) + pad, left + 1, imageWidth);
  const bottom = clamp(Math.ceil(bbox.y1) + pad, top + 1, imageHeight);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return sharp(image)
    .extract({ left, top, width, height })
    .resize({ width: width * 3, kernel: "lanczos3" })
    .png()
    .toBuffer();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function shutdownOcr(): Promise<void> {
  return enqueue(async () => {
    const pending = g.__journalOcrWorker;
    g.__journalOcrWorker = undefined;
    if (!pending) return;
    const worker = await pending;
    await worker.terminate();
  });
}
