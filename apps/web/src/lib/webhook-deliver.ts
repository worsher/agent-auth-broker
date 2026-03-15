import { createHmac, randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import { prisma } from './db/prisma'
import { logger } from './logger'

const DELIVERY_TIMEOUT_MS = 10_000

export async function deliverWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const log = logger.child({ module: 'webhook' })

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isActive: true,
      events: { has: eventType },
    },
    select: { id: true, url: true, secret: true },
  })

  if (endpoints.length === 0) return

  const eventId = randomUUID()
  const timestamp = new Date().toISOString()
  const body = JSON.stringify({ id: eventId, eventType, timestamp, data: payload })

  for (const endpoint of endpoints) {
    deliverToEndpoint(endpoint, eventType, body, log).catch(() => {})
  }
}

async function deliverToEndpoint(
  endpoint: { id: string; url: string; secret: string },
  eventType: string,
  body: string,
  log: Logger
): Promise<void> {
  const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex')

  let httpStatus: number | undefined
  let error: string | undefined
  let deliveredAt: Date | undefined

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Broker-Signature': `sha256=${signature}`,
        'X-Broker-Event': eventType,
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

  try {
    await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventType,
        payload: JSON.parse(body),
        httpStatus,
        error,
        deliveredAt,
      },
    })
  } catch (dbErr) {
    log.error({ endpointId: endpoint.id, err: dbErr }, 'failed to record webhook delivery')
  }

  if (error) {
    log.warn({ endpointId: endpoint.id, eventType, error }, 'webhook delivery failed')
  } else {
    log.debug({ endpointId: endpoint.id, eventType, httpStatus }, 'webhook delivered')
  }
}
