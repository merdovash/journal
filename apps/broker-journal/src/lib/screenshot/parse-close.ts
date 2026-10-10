import { ScreenshotParseError } from "./parse-open";

export type CloseReasonValue = "manual" | "take_profit" | "stop_loss";

/** Fields the close form can store. The user confirms before saving. */
export type ParsedCloseValues = {
  closedAt: string;
  price: string;
  commission: string;
  closeReason: CloseReasonValue;
};

export type CloseScreen = {
  side: "long" | "short";
  instrument: string;
  entryPrice: string;
  quantity: string;
  leverage: string;
  profitUsd: string | null;
};

export type ParsedCloseScreenshot = {
  values: ParsedCloseValues;
  screen: CloseScreen;
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

const STABLE_TICKERS = new Set(["USDT", "USD", "USDC", "DAI", "RUB"]);

/** Cyrillic letters that OCR uses in place of Latin twins (ВТС → BTC). */
const HOMOGLYPH: Record<string, string> = {
  А: "A",
  а: "A",
  В: "B",
  в: "B",
  Е: "E",
  е: "E",
  К: "K",
  к: "K",
  М: "M",
  м: "M",
  Н: "H",
  н: "H",
  О: "O",
  о: "O",
  Р: "P",
  р: "P",
  С: "C",
  с: "C",
  Т: "T",
  т: "T",
  У: "Y",
  у: "Y",
  Х: "X",
  х: "X",
};

const VOLUME_RE =
  /(\d[\d\s]*[.,]\d+)\s*\$\s*[=≈~]\s*(\d[\d\s]*[.,]\d+)\s+([A-Za-zА-Яа-яЁё]{2,16})/g;

/**
 * Walt result screen → close form.
 * The dollar commission is the one subtracted in PnL, same as on the open screen.
 * Notional on this screen is exit price × quantity, not the entry notional.
 */
export function parseCloseScreenshot(text: string): ParsedCloseScreenshot {
  const source = text.replace(/\u00a0/g, " ");

  if (/лонг\s+открыт|шорт\s+открыт/i.test(source) && !/цена\s+при\s+закрытии/i.test(source)) {
    throw new ScreenshotParseError(
      "Это похоже на открытие. Заполните его на форме открытия."
    );
  }
  if (!/цена\s+при\s+закрытии/i.test(source)) {
    throw new ScreenshotParseError("Не похоже на экран закрытия в Walt.");
  }

  const side = readSide(source);
  const volume = readVolume(source);
  const entryPrice = readLabeledDecimal(source, /цена\s+входа/i, "цену входа");
  const price = readLabeledDecimal(source, /цена\s+при\s+закрытии/i, "цену при закрытии");
  const commission = readLabeledDecimal(source, /комисси/i, "комиссию");
  const leverage = readLeverage(source);
  const closedAt = readClosedAt(source);
  const profitUsd = readProfit(source);
  const closeReason = readCloseReason(source);

  const exitN = Number(price);
  const qtyN = Number(volume.quantity);
  const notionalN = Number(volume.notional);
  if (!(exitN > 0) || !(qtyN > 0) || !(Number(entryPrice) > 0)) {
    throw new ScreenshotParseError("Цена или количество получились некорректными.");
  }

  const warnings: string[] = [];
  if (side === "short") {
    warnings.push(
      `Скриншот: шорт ${volume.instrument}, вход ${entryPrice}, количество ${volume.quantity}. Журнал считает PnL как для лонга — знак результата будет противоположным.`
    );
  } else {
    warnings.push(
      `Скриншот: лонг ${volume.instrument}, вход ${entryPrice}, количество ${volume.quantity}.`
    );
  }

  if (notionalN > 0) {
    const gap = Math.abs(exitN * qtyN - notionalN) / notionalN;
    if (gap > 0.05) {
      warnings.push(
        "Объём в долларах не сходится с ценой закрытия × количество. Проверьте цифры."
      );
    }
  }

  if (profitUsd) {
    warnings.push(`На экране результат ${profitUsd} $.`);
  }

  return {
    values: {
      closedAt,
      price,
      commission,
      closeReason,
    },
    screen: {
      side,
      instrument: volume.instrument,
      entryPrice,
      quantity: volume.quantity,
      leverage,
      profitUsd,
    },
    warnings,
  };
}

export function closeMatchWarnings(
  screen: Pick<CloseScreen, "instrument" | "entryPrice">,
  open: { instrument: string; entryPrice: number }
): string[] {
  const warnings: string[] = [];
  if (screen.instrument.toUpperCase() !== open.instrument.trim().toUpperCase()) {
    warnings.push(
      `На скриншоте ${screen.instrument}, а закрывается ${open.instrument.trim().toUpperCase()}.`
    );
  }
  if (open.entryPrice > 0) {
    const entry = Number(screen.entryPrice);
    const gap = Math.abs(entry - open.entryPrice) / open.entryPrice;
    if (gap > 0.005) {
      warnings.push(
        `Цена входа на скриншоте ${screen.entryPrice}, у этой позиции ${open.entryPrice}.`
      );
    }
  }
  return warnings;
}

function readSide(text: string): "long" | "short" {
  const badge = text.match(/[xх×]\s*(шорт|лонг)/i);
  if (badge) return /шорт/i.test(badge[1]) ? "short" : "long";
  if (/шорт/i.test(text) && !/лонг/i.test(text)) return "short";
  if (/лонг/i.test(text) && !/шорт/i.test(text)) return "long";
  throw new ScreenshotParseError("Не удалось понять, лонг это или шорт.");
}

function readVolume(text: string): {
  notional: string;
  quantity: string;
  instrument: string;
} {
  for (const match of text.matchAll(VOLUME_RE)) {
    const instrument = readTicker(match[3]);
    if (STABLE_TICKERS.has(instrument)) continue;
    return {
      notional: normalizeDecimal(match[1]),
      quantity: normalizeDecimal(match[2]),
      instrument,
    };
  }
  throw new ScreenshotParseError(
    "Не удалось прочитать объём и тикер. Нужна строка вида «96,52 $ ≈ 0,0012 BTC»."
  );
}

function readTicker(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (/[A-Za-z0-9]/.test(ch)) {
      out += ch.toUpperCase();
      continue;
    }
    const folded = HOMOGLYPH[ch];
    if (!folded) {
      throw new ScreenshotParseError("Не удалось прочитать тикер инструмента.");
    }
    out += folded;
  }
  if (!/^[A-Z][A-Z0-9]{1,15}$/.test(out)) {
    throw new ScreenshotParseError("Не удалось прочитать тикер инструмента.");
  }
  return out;
}

function readLabeledDecimal(text: string, label: RegExp, name: string): string {
  const re = new RegExp(`${label.source}[^0-9]{0,80}(\\d[\\d\\s]*[.,]\\d+)`, "i");
  const match = text.match(re);
  if (!match) {
    throw new ScreenshotParseError(`Не удалось прочитать ${name}.`);
  }
  return normalizeDecimal(match[1]);
}

function readLeverage(text: string): string {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*[xх×]/i);
  if (!match) {
    throw new ScreenshotParseError("Не удалось прочитать плечо (например, 2×).");
  }
  const leverage = normalizeDecimal(match[1]);
  if (!(Number(leverage) > 0)) {
    throw new ScreenshotParseError("Плечо получилось некорректным.");
  }
  return leverage;
}

function readClosedAt(text: string): string {
  const match = text.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\s*г?\.?\s*(?:в\s*)?(\d{1,2})\s*[:.]\s*(\d{2})/i
  );
  if (!match) {
    throw new ScreenshotParseError("Не удалось прочитать дату закрытия.");
  }
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    !month ||
    year < 2000 ||
    year > 2100 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    throw new ScreenshotParseError("Дата на скриншоте получилась некорректной.");
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function readProfit(text: string): string | null {
  const match = text.match(/прибыл\p{L}*[\s\S]{0,80}?([+-]\s*\d[\d\s]*[.,]\d+)\s*\$/iu);
  if (!match) return null;
  return normalizeSigned(match[1]);
}

function readCloseReason(text: string): CloseReasonValue {
  if (/стоп[-\s]?лосс|stop\s*loss/i.test(text)) return "stop_loss";
  if (/тейк[-\s]?профит|take\s*profit/i.test(text)) return "take_profit";
  return "manual";
}

function normalizeSigned(raw: string): string {
  const negative = /^\s*-/.test(raw);
  const abs = normalizeDecimal(raw.replace(/^[+-]\s*/, ""));
  return negative ? `-${abs}` : `+${abs}`;
}

function normalizeDecimal(raw: string): string {
  const compact = raw.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(compact)) {
    throw new ScreenshotParseError("Некорректное число на скриншоте.");
  }
  const [whole, frac] = compact.split(".");
  const wholeNorm = String(Number(whole));
  if (!frac) return wholeNorm;
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${wholeNorm}.${trimmed}` : wholeNorm;
}
