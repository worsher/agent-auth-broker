import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getMetrics } from '@broker/core'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const metrics = getMetrics()
  const mem = process.memoryUsage()

  return NextResponse.json({
    success: true,
    data: {
      ...metrics,
      process: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        nodeVersion: process.version,
      },
    },
  })
}
