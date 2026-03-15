import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { logger } from './logger'
import { incrementCounter, recordHistogram, METRIC } from '@broker/core'

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse>

export function withLogging(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    const requestId = randomUUID()
    const start = Date.now()
    const method = request.method
    const path = request.nextUrl.pathname

    const log = logger.child({ requestId, method, path })

    incrementCounter(METRIC.REQUEST_TOTAL)

    try {
      const response = await handler(request, context)
      const durationMs = Date.now() - start
      const status = response.status

      recordHistogram(METRIC.REQUEST_DURATION_MS, durationMs)
      if (status >= 400) {
        incrementCounter(METRIC.REQUEST_ERROR)
      }

      log.info({ status, durationMs }, 'request completed')

      response.headers.set('X-Request-Id', requestId)
      return response
    } catch (err) {
      const durationMs = Date.now() - start
      incrementCounter(METRIC.REQUEST_ERROR)
      recordHistogram(METRIC.REQUEST_DURATION_MS, durationMs)

      log.error({ err, durationMs }, 'request failed')

      return NextResponse.json(
        { error: 'Internal server error', requestId },
        { status: 500 }
      )
    }
  }
}
