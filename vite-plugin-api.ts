import type { Plugin } from 'vite'
import { handleAuthApi } from './server/auth/api'
import { handleCandlesApi } from './server/candles/api'
import { loadEnvFile } from './server/db/pool'
import { handleJournalApi } from './server/journal/api'

function apiMiddleware() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/api/')) {
      next()
      return
    }

    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname
    const method = req.method ?? 'GET'
    loadEnvFile()

    const run = async () => {
      if (pathname.startsWith('/api/auth')) {
        return handleAuthApi(req, res, pathname)
      }
      if (pathname.startsWith('/api/candles')) {
        return handleCandlesApi(req, res, url)
      }
      if (
        pathname.startsWith('/api/registry') ||
        pathname.startsWith('/api/settings') ||
        pathname.startsWith('/api/opens') ||
        pathname.startsWith('/api/closes') ||
        pathname.startsWith('/api/cashflows')
      ) {
        return handleJournalApi(req, res, pathname, url)
      }
      return false
    }

    run()
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Not found' }))
        }
      })
      .catch((err: unknown) => {
        console.error(`[api] ${method} ${pathname}`, err)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal error',
          }),
        )
      })
  }
}

export function apiPlugin(): Plugin {
  return {
    name: 'journal-api',
    configureServer(server) {
      loadEnvFile()
      server.middlewares.use(apiMiddleware())
    },
    configurePreviewServer(server) {
      loadEnvFile()
      server.middlewares.use(apiMiddleware())
    },
  }
}
