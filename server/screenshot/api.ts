import type { IncomingMessage, ServerResponse } from 'node:http'
import { getUserFromRequest } from '../auth/session'
import { sendJson } from '../http/util'
import { ScreenshotParseError } from '../../src/lib/screenshot/parse-open'
import { ScreenshotInputError } from './ocr'
import { recognizeCloseScreenshot } from './recognize-close'
import { recognizeOpenScreenshot } from './recognize-open'

const MAX_BYTES = 8 * 1024 * 1024

async function readFormData(req: IncomingMessage): Promise<FormData> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const headers = new Headers()
  const contentType = req.headers['content-type']
  if (typeof contentType === 'string') headers.set('content-type', contentType)
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers,
    body: Buffer.concat(chunks),
  })
  return request.formData()
}

export async function handleScreenshotApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const open = pathname === '/api/opens/parse-screenshot'
  const close = pathname === '/api/closes/parse-screenshot'
  if (!open && !close) return false
  if ((req.method ?? 'GET') !== 'POST') {
    sendJson(res, 404, { error: 'Not found' })
    return true
  }

  const user = await getUserFromRequest(req)
  if (!user) {
    sendJson(res, 401, { error: 'Требуется вход' })
    return true
  }

  let form: FormData
  try {
    form = await readFormData(req)
  } catch {
    sendJson(res, 400, { error: 'Ожидался файл скриншота' })
    return true
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    sendJson(res, 400, { error: 'Приложите изображение' })
    return true
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    sendJson(res, 400, { error: 'Изображение должно быть не пустым и меньше 8 МБ' })
    return true
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const parsed = open ? await recognizeOpenScreenshot(bytes) : await recognizeCloseScreenshot(bytes)
    sendJson(res, 200, parsed)
  } catch (error) {
    if (error instanceof ScreenshotParseError || error instanceof ScreenshotInputError) {
      sendJson(res, 422, { error: error.message })
      return true
    }
    console.error(error)
    sendJson(res, 500, { error: 'Не удалось разобрать скриншот' })
  }
  return true
}
