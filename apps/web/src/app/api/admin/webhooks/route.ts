import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin, parsePagination, paginatedResponse } from '@/lib/auth/require-admin'

const VALID_EVENTS = [
  'tool_call.completed',
  'tool_call.failed',
  'permission.denied',
  'credential.refresh_failed',
  'credential.refreshed',
]

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const { page, pageSize, skip } = parsePagination(params)

  const [endpoints, total] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deliveries: true } },
      },
    }),
    prisma.webhookEndpoint.count(),
  ])

  return paginatedResponse(endpoints, total, page, pageSize)
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await request.json() as Record<string, unknown>
  const url = body.url as string | undefined
  const events = body.events as string[] | undefined

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url 是必填字段' }, { status: 400 })
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'events 至少包含一个事件类型' }, { status: 400 })
  }

  const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e))
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: `无效的事件类型: ${invalidEvents.join(', ')}`, validEvents: VALID_EVENTS },
      { status: 400 }
    )
  }

  const secret = randomBytes(32).toString('hex')

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      ownerId: auth.userId,
      url,
      secret,
      events,
    },
  })

  return NextResponse.json({
    success: true,
    data: { ...endpoint, secret },
  }, { status: 201 })
}
