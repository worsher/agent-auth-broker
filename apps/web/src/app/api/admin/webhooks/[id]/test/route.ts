import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin } from '@/lib/auth/require-admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id },
    select: { id: true, url: true, secret: true },
  })

  if (!endpoint) {
    return NextResponse.json({ error: 'Webhook 不存在' }, { status: 404 })
  }

  const eventId = randomUUID()
  const timestamp = new Date().toISOString()
  const body = JSON.stringify({
    id: eventId,
    eventType: 'test.ping',
    timestamp,
    data: { message: 'This is a test webhook delivery from Agent Auth Broker' },
  })

  const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex')

  let httpStatus: number | undefined
  let error: string | undefined
  let deliveredAt: Date | undefined

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Broker-Signature': `sha256=${signature}`,
        'X-Broker-Event': 'test.ping',
        'User-Agent': 'agent-auth-broker/1.0',
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timer)
    httpStatus = res.status
    if (res.ok) {
      deliveredAt = new Date()
    } else {
      error = `HTTP ${res.status}: ${res.statusText}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventType: 'test.ping',
      payload: JSON.parse(body),
      httpStatus,
      error,
      deliveredAt,
    },
  })

  return NextResponse.json({
    success: !error,
    data: {
      deliveryId: delivery.id,
      httpStatus,
      error,
      deliveredAt,
    },
  })
}
