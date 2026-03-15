import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMetrics } from '@broker/core'

const startTime = Date.now()

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'error'
  let dbError: string | undefined
  let dbLatencyMs: number | undefined

  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - dbStart
    dbStatus = 'ok'
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  const status = dbStatus === 'ok' && process.env.BROKER_MASTER_KEY ? 'healthy' : 'degraded'
  const mem = process.memoryUsage()
  const metrics = getMetrics()

  return NextResponse.json(
    {
      status,
      version: process.env.npm_package_version ?? '0.0.1',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        ...(dbError && { error: dbError }),
      },
      masterKeyConfigured: !!process.env.BROKER_MASTER_KEY,
      memory: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      },
      requests: {
        total: metrics.counters['request.total'] ?? 0,
        errors: metrics.counters['request.error'] ?? 0,
      },
    },
    { status: status === 'healthy' ? 200 : 503 },
  )
}
