import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin } from '@/lib/auth/require-admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params

  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          eventType: true,
          httpStatus: true,
          error: true,
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  })

  if (!endpoint) {
    return NextResponse.json({ error: 'Webhook 不存在' }, { status: 404 })
  }

  // 不返回 secret 明文（只有创建时返回一次）
  const { secret: _, ...safe } = endpoint
  return NextResponse.json({ success: true, data: safe })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params
  const body = await request.json() as Record<string, unknown>

  const existing = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ error: 'Webhook 不存在' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.url === 'string') data.url = body.url
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (Array.isArray(body.events)) {
    data.events = body.events.filter((e: unknown) => typeof e === 'string')
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data,
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params

  const existing = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ error: 'Webhook 不存在' }, { status: 404 })
  }

  await prisma.webhookEndpoint.delete({ where: { id } })

  return NextResponse.json({ success: true, message: 'Webhook 已删除' })
}
