import type { IncomingMessage, ServerResponse } from 'node:http'

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  let raw = ''
  for await (const chunk of req) {
    raw += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
  }
  return JSON.parse(raw || '{}') as T
}

export function matchPath(
  pathname: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = pathname.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  if (pathParts.length !== patternParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const pp = patternParts[i]!
    const vp = pathParts[i]!
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(vp)
    } else if (pp !== vp) {
      return null
    }
  }
  return params
}
