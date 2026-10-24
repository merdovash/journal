export class ScreenshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenshotParseError";
  }
}

/** Same shape as the open-trade form. User confirms before anything is saved. */
export type ParsedOpenValues = {
  openedAt: string;
  instrument: string;
  price: string;
  commission: string;
  stopLoss: string;
  takeProfit: string;
  leverage: string;
  quantity: string;
  openReason: string;
};

export type ParsedOpenScreenshot = {
  values: ParsedOpenValues;
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

const VOLUME_RE =
  /(\d[\d\s]*[.,]\d+)\s*\$\s*[=≈~]\s*(\d[\d\s]*[.,]\d+)\s+([A-Za-z]{2,16})/g;

/**
 * Walt (Кошелёк) open-position screen → journal open fields.
 * Commission is the dollar amount: PnL is in the same units as price × quantity.
 */
export function parseOpenScreenshot(text: string): ParsedOpenScreenshot {
  const source = text.replace(/\u00a0/g, " ");

  if (/ваша\s+позиция/i.test(source) && /цена\s+входа/i.test(source)) {
    return parseLivePosition(source);
  }

  // "закрыть" is the button on an open position; "закрыт" / "закрытии" is a closed trade.
  if (/закрыт(?!ь)/i.test(source) && !/открыт/i.test(source)) {
    throw new ScreenshotParseError(
      "Это похоже на закрытие. Заполните его на форме закрытия."
    );
  }

  const shortTitle = /шорт\s+открыт/i.test(source);
  const longTitle = /лонг\s+открыт/i.test(source);
  if (shortTitle || (/шорт/i.test(source) && !/лонг/i.test(source))) {
    throw new ScreenshotParseError(
      "На скриншоте шорт. Журнал пока считает результат только для лонга, поэтому поля не заполнены."
    );
  }
  if (!longTitle && !(/лонг/i.test(source) && /открыт/i.test(source))) {
    throw new ScreenshotParseError("Не похоже на экран открытия лонга в Walt.");
  }

  const volume = readVolume(source);
  const price = readLabeledDecimal(source, /цена\s+входа/i, "цену входа");
  const commission = readLabeledDecimal(source, /комисси/i, "комиссию");
  const leverage = readLeverage(source);
  const openedAt = readOpenedAt(source);

  const priceN = Number(price);
  const qtyN = Number(volume.quantity);
  const notionalN = Number(volume.notional);
  if (!(priceN > 0) || !(qtyN > 0) || !(notionalN > 0)) {
    throw new ScreenshotParseError("Цена, количество или объём получились некорректными.");
  }

  const warnings: string[] = [];
  const implied = priceN * qtyN;
  const gap = Math.abs(implied - notionalN) / notionalN;
  if (gap > 0.01) {
    warnings.push(
      "Объём в долларах не сходится с ценой × количество. Проверьте цифры."
    );
  }

  const bonuses = readBonuses(source);
  if (bonuses != null) {
    warnings.push(
      `На скриншоте бонусы +${bonuses}. В сделку они не записываются.`
    );
  }

  return {
    values: {
      openedAt,
      instrument: volume.instrument,
      price,
      commission,
      stopLoss: "",
      takeProfit: "",
      leverage,
      quantity: volume.quantity,
      openReason: "",
    },
    warnings,
  };
}

/**
 * Walt "Ваша позиция": the position is still open.
 * The screen has no ticker and no open time. Quantity is volume ÷ mark price,
 * because the dollar volume matches the mark, not the entry.
 */
function parseLivePosition(source: string): ParsedOpenScreenshot {
  const side = readPositionSide(source);
  if (side === "short") {
    throw new ScreenshotParseError(
      "На скриншоте шорт. Журнал пока считает результат только для лонга, поэтому поля не заполнены."
    );
  }
  if (side !== "long") {
    throw new ScreenshotParseError("Не удалось понять, лонг это или шорт.");
  }

  const price = readLabeledDecimal(source, /цена\s+входа/i, "цену входа");
  const notional = readLabeledDecimal(source, /объ[её]м/i, "объём");
  const leverage = readLeverage(source);
  const mark = readOptionalDecimal(source, /расч[её]тная\s+цена/i);
  const quantity = divideDecimal(notional, mark ?? price);
  const takeProfit = readOrderPrice(source, /тп|тейк/);
  const stopLoss = readOrderPrice(source, /сл|стоп/);
  const funding = readFunding(source);

  const warnings = [
    "На экране нет тикера — впишите его.",
    "На экране нет даты открытия — укажите её.",
    mark
      ? `Количество ${quantity} посчитано как объём / расчётная цена.`
      : `Количество ${quantity} посчитано как объём / цена входа.`,
  ];
  if (funding) {
    warnings.push(
      `Плата за удержание ${funding} $ на экране есть, в комиссию открытия она не записана.`
    );
  }

  return {
    values: {
      openedAt: "",
      instrument: "",
      price,
      commission: "0",
      stopLoss: stopLoss ?? "",
      takeProfit: takeProfit ?? "",
      leverage,
      quantity,
      openReason: "",
    },
    warnings,
  };
}

function readPositionSide(text: string): "long" | "short" | null {
  const badge = text.match(/[xх×]\s*(шорт|лонг)/i);
  if (badge) return /шорт/i.test(badge[1]) ? "short" : "long";
  if (/шорт/i.test(text) && !/лонг/i.test(text)) return "short";
  if (/лонг/i.test(text)) return "long";
  return null;
}

function readOptionalDecimal(text: string, label: RegExp): string | null {
  const re = new RegExp(`${label.source}[^0-9]{0,40}(\\d[\\d\\s]*[.,]\\d+)`, "i");
  const match = text.match(re);
  return match ? normalizeDecimal(match[1]) : null;
}

function readOrderPrice(text: string, marker: RegExp): string | null {
  const re = new RegExp(
    `(?<![\\p{L}])(?:${marker.source})(?![\\p{L}])[\\s\\S]{0,120}?цена:?[^0-9]{0,20}(\\d[\\d\\s]*[.,]\\d+)`,
    "iu"
  );
  const match = text.match(re);
  return match ? normalizeDecimal(match[1]) : null;
}

function readFunding(text: string): string | null {
  const match = text.match(/удержан\p{L}*[^0-9+-]{0,30}([+-]?\d[\d\s]*[.,]\d+)/iu);
  if (!match) return null;
  const negative = /^\s*-/.test(match[1]);
  const abs = normalizeDecimal(match[1].replace(/^[+-]/, ""));
  return negative ? `-${abs}` : abs;
}

function divideDecimal(numerator: string, denominator: string): string {
  const value = Number(numerator) / Number(denominator);
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new ScreenshotParseError("Не удалось посчитать количество из объёма и цены.");
  }
  const [whole, frac = ""] = value.toFixed(8).split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${Number(whole)}.${trimmed}` : String(Number(whole));
}

/** Word after a long decimal on the volume line, when OCR wrote it in Cyrillic. */
export function findCyrillicVolumeTicker<T extends { text: string }>(words: T[]): T | null {
  for (let i = 0; i < words.length - 1; i++) {
    const token = words[i].text.replace(/\s/g, "");
    if (!/^\d+[,.]\d{4,}$/.test(token)) continue;
    const next = words[i + 1];
    if (!/^[\p{L}]{2,16}$/u.test(next.text)) continue;
    if (/^[A-Za-z]{2,16}$/.test(next.text)) continue;
    return next;
  }
  return null;
}

function readVolume(text: string): {
  notional: string;
  quantity: string;
  instrument: string;
} {
  for (const match of text.matchAll(VOLUME_RE)) {
    const instrument = match[3].toUpperCase();
    if (STABLE_TICKERS.has(instrument)) continue;
    return {
      notional: normalizeDecimal(match[1]),
      quantity: normalizeDecimal(match[2]),
      instrument,
    };
  }
  throw new ScreenshotParseError(
    "Не удалось прочитать объём и тикер. Нужна строка вида «98,73 $ ≈ 68,24 GRAM»."
  );
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

function readOpenedAt(text: string): string {
  const match = text.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\s*г?\.?\s*(?:в\s*)?(\d{1,2})\s*[:.]\s*(\d{2})/i
  );
  if (!match) {
    throw new ScreenshotParseError("Не удалось прочитать дату открытия.");
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

function readBonuses(text: string): string | null {
  const match = text.match(/бонус\p{L}*[^+\d]{0,40}\+\s*(\d+)/iu);
  return match ? match[1] : null;
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
