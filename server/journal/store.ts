import type { Cashflow, CashflowKind, CloseReason, TradeOpenWithClose } from '../../src/lib/journal'
import { getPool } from '../db/pool'

const DEFAULT_BALANCE = 100000

type OpenRow = {
  id: string
  opened_at: string
  instrument: string
  price: number | string
  commission: number | string
  stop_loss: number | string | null
  take_profit: number | string | null
  leverage: number | string
  quantity: number | string
  open_reason: string
  side: string
  cash_amount: number | string | null
  close_id: string | null
  closed_at: string | null
  close_price: number | string | null
  close_commission: number | string | null
  close_reason: string | null
}

const OPEN_SELECT = `
  SELECT o.id, o.opened_at, o.instrument, o.price, o.commission,
         o.stop_loss, o.take_profit, o.leverage, o.quantity, o.open_reason, o.side, o.cash_amount,
         c.id AS close_id, c.closed_at, c.price AS close_price,
         c.commission AS close_commission, c.close_reason
  FROM journal_opens o
  LEFT JOIN journal_closes c ON c.open_id = o.id
`

function mapOpen(row: OpenRow): TradeOpenWithClose {
  return {
    id: String(row.id),
    openedAt: String(row.opened_at),
    instrument: row.instrument,
    price: row.price,
    commission: row.commission,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    leverage: row.leverage,
    quantity: row.quantity,
    side: row.side === 'short' ? 'short' : 'long',
    cashAmount: row.cash_amount == null ? null : row.cash_amount,
    openReason: row.open_reason,
    close:
      row.close_id && row.closed_at && row.close_price != null && row.close_commission != null && row.close_reason
        ? {
            id: String(row.close_id),
            openId: String(row.id),
            closedAt: String(row.closed_at),
            price: row.close_price,
            commission: row.close_commission,
            closeReason: row.close_reason as CloseReason,
          }
        : null,
  }
}

export async function listOpens(userId: string): Promise<TradeOpenWithClose[]> {
  const pool = getPool()
  const result = await pool.query<OpenRow>(
    `${OPEN_SELECT} WHERE o.user_id = $1 ORDER BY o.opened_at DESC`,
    [userId],
  )
  return result.rows.map(mapOpen)
}

export async function getOpen(userId: string, id: string): Promise<TradeOpenWithClose | null> {
  const pool = getPool()
  const result = await pool.query<OpenRow>(`${OPEN_SELECT} WHERE o.user_id = $1 AND o.id = $2`, [userId, id])
  return result.rows[0] ? mapOpen(result.rows[0]) : null
}

export async function ensureSettings(userId: string): Promise<number> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO journal_settings (user_id, starting_balance)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, DEFAULT_BALANCE],
  )
  const result = await pool.query<{ starting_balance: number | string }>(
    `SELECT starting_balance FROM journal_settings WHERE user_id = $1`,
    [userId],
  )
  return Number(result.rows[0]?.starting_balance ?? DEFAULT_BALANCE)
}

export async function updateSettings(userId: string, startingBalance: number): Promise<number> {
  const pool = getPool()
  const result = await pool.query<{ starting_balance: number | string }>(
    `INSERT INTO journal_settings (user_id, starting_balance, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
       SET starting_balance = EXCLUDED.starting_balance, updated_at = now()
     RETURNING starting_balance`,
    [userId, startingBalance],
  )
  return Number(result.rows[0]?.starting_balance ?? startingBalance)
}

export type OpenInput = {
  openedAt: string
  instrument: string
  price: number
  commission: number
  stopLoss: number | null
  takeProfit: number | null
  leverage: number
  quantity: number
  side: 'long' | 'short'
  cashAmount: number | null
  openReason: string
}

export async function createOpen(userId: string, input: OpenInput): Promise<TradeOpenWithClose> {
  const pool = getPool()
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO journal_opens (
       user_id, opened_at, instrument, price, commission, stop_loss, take_profit,
       leverage, quantity, side, cash_amount, open_reason
     ) VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      userId,
      input.openedAt,
      input.instrument,
      input.price,
      input.commission,
      input.stopLoss,
      input.takeProfit,
      input.leverage,
      input.quantity,
      input.side,
      input.cashAmount,
      input.openReason,
    ],
  )
  const id = String(inserted.rows[0]!.id)
  const open = await getOpen(userId, id)
  if (!open) throw new Error('Не удалось прочитать созданное открытие')
  return open
}

export async function updateOpen(
  userId: string,
  id: string,
  patch: Partial<OpenInput>,
): Promise<TradeOpenWithClose | null> {
  const existing = await getOpen(userId, id)
  if (!existing) return null
  const next: OpenInput = {
    openedAt: patch.openedAt ?? existing.openedAt,
    instrument: patch.instrument ?? existing.instrument,
    price: patch.price ?? Number(existing.price),
    commission: patch.commission ?? Number(existing.commission),
    stopLoss: patch.stopLoss !== undefined ? patch.stopLoss : existing.stopLoss == null ? null : Number(existing.stopLoss),
    takeProfit:
      patch.takeProfit !== undefined
        ? patch.takeProfit
        : existing.takeProfit == null
          ? null
          : Number(existing.takeProfit),
    leverage: patch.leverage ?? Number(existing.leverage),
    quantity: patch.quantity ?? Number(existing.quantity),
    side: patch.side ?? existing.side,
    cashAmount: patch.cashAmount !== undefined ? patch.cashAmount : existing.cashAmount == null ? null : Number(existing.cashAmount),
    openReason: patch.openReason ?? existing.openReason,
  }
  const pool = getPool()
  await pool.query(
    `UPDATE journal_opens SET
       opened_at = $3::timestamptz,
       instrument = $4,
       price = $5,
       commission = $6,
       stop_loss = $7,
       take_profit = $8,
       leverage = $9,
       quantity = $10,
       side = $11,
       cash_amount = $12,
       open_reason = $13,
       updated_at = now()
     WHERE user_id = $1 AND id = $2`,
    [
      userId,
      id,
      next.openedAt,
      next.instrument,
      next.price,
      next.commission,
      next.stopLoss,
      next.takeProfit,
      next.leverage,
      next.quantity,
      next.side,
      next.cashAmount,
      next.openReason,
    ],
  )
  return getOpen(userId, id)
}

export type CloseInput = {
  openId: string
  closedAt: string
  price: number
  commission: number
  closeReason: CloseReason
}

export async function createClose(userId: string, input: CloseInput): Promise<TradeOpenWithClose> {
  const open = await getOpen(userId, input.openId)
  if (!open) {
    const error = new Error('Открытие не найдено')
    ;(error as Error & { status: number }).status = 404
    throw error
  }
  if (open.close) {
    const error = new Error('Это открытие уже закрыто')
    ;(error as Error & { status: number }).status = 409
    throw error
  }
  if (new Date(input.closedAt) < new Date(open.openedAt)) {
    const error = new Error('Дата закрытия раньше открытия')
    ;(error as Error & { status: number }).status = 400
    throw error
  }
  const pool = getPool()
  await pool.query(
    `INSERT INTO journal_closes (user_id, open_id, closed_at, price, commission, close_reason)
     VALUES ($1, $2, $3::timestamptz, $4, $5, $6)`,
    [userId, input.openId, input.closedAt, input.price, input.commission, input.closeReason],
  )
  const saved = await getOpen(userId, input.openId)
  if (!saved?.close) throw new Error('Не удалось прочитать закрытие')
  return saved
}

export async function updateClose(
  userId: string,
  id: string,
  patch: Partial<Omit<CloseInput, 'openId'>>,
): Promise<TradeOpenWithClose | null> {
  const pool = getPool()
  const found = await pool.query<{ open_id: string }>(
    `SELECT open_id FROM journal_closes WHERE user_id = $1 AND id = $2`,
    [userId, id],
  )
  const openId = found.rows[0]?.open_id
  if (!openId) return null
  const open = await getOpen(userId, String(openId))
  if (!open?.close) return null
  const closedAt = patch.closedAt ?? open.close.closedAt
  if (new Date(closedAt) < new Date(open.openedAt)) {
    const error = new Error('Дата закрытия раньше открытия')
    ;(error as Error & { status: number }).status = 400
    throw error
  }
  await pool.query(
    `UPDATE journal_closes SET
       closed_at = $3::timestamptz,
       price = $4,
       commission = $5,
       close_reason = $6,
       updated_at = now()
     WHERE user_id = $1 AND id = $2`,
    [
      userId,
      id,
      closedAt,
      patch.price ?? Number(open.close.price),
      patch.commission ?? Number(open.close.commission),
      patch.closeReason ?? open.close.closeReason,
    ],
  )
  return getOpen(userId, String(openId))
}

export function httpStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return null
}

type CashflowRow = {
  id: string
  kind: string
  amount: number | string
  occurred_at: string
  note: string
}

export async function listCashflows(userId: string): Promise<Cashflow[]> {
  const pool = getPool()
  const result = await pool.query<CashflowRow>(
    `SELECT id, kind, amount, occurred_at, note
     FROM journal_cashflows
     WHERE user_id = $1
     ORDER BY occurred_at DESC`,
    [userId],
  )
  return result.rows.map((row) => ({
    id: String(row.id),
    kind: row.kind as CashflowKind,
    amount: row.amount,
    occurredAt: String(row.occurred_at),
    note: row.note ?? '',
  }))
}

export async function createCashflow(
  userId: string,
  input: { kind: CashflowKind; amount: number; occurredAt: string; note: string },
): Promise<Cashflow> {
  const pool = getPool()
  const inserted = await pool.query<CashflowRow>(
    `INSERT INTO journal_cashflows (user_id, kind, amount, occurred_at, note)
     VALUES ($1, $2, $3, $4::timestamptz, $5)
     RETURNING id, kind, amount, occurred_at, note`,
    [userId, input.kind, input.amount, input.occurredAt, input.note],
  )
  const row = inserted.rows[0]
  if (!row) throw new Error('Не удалось записать движение средств')
  return {
    id: String(row.id),
    kind: row.kind as CashflowKind,
    amount: row.amount,
    occurredAt: String(row.occurred_at),
    note: row.note ?? '',
  }
}

export async function deleteCashflow(userId: string, id: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM journal_cashflows WHERE user_id = $1 AND id = $2`, [userId, id])
  return (result.rowCount ?? 0) > 0
}
