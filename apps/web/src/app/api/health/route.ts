import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const startTime = Date.now()

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'error'
  let dbError: string | undefined

  try {
    await prisma.$queryRaw`SELECT 1`
    dbStatus = 'ok'
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  const status = dbStatus === 'ok' && process.env.BROKER_MASTER_KEY ? 'healthy' : 'degraded'

  return NextResponse.json(
    {
      status,
      version: process.env.npm_package_version ?? '0.0.1',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: dbStatus,
      ...(dbError && { dbError }),
      masterKeyConfigured: !!process.env.BROKER_MASTER_KEY,
    },
    { status: status === 'healthy' ? 200 : 503 },
  )
}
