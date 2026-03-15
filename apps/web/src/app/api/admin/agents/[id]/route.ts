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

  const agent = await prisma.agent.findUnique({
    where: { id, ownerId: auth.userId },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      policies: {
        include: {
          credential: { select: { id: true, name: true, connectorId: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
  }

  // 不返回 tokenHash
  const { tokenHash: _, ...safeAgent } = agent

  return NextResponse.json({ success: true, data: safeAgent })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params
  const body = await request.json() as Record<string, unknown>

  const agent = await prisma.agent.findUnique({ where: { id, ownerId: auth.userId }, select: { id: true } })
  if (!agent) {
    return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
  }

  // 只允许更新指定字段
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.description === 'string') data.description = body.description.trim()
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (body.tokenExpiresAt === null) {
    data.tokenExpiresAt = null
  } else if (typeof body.tokenExpiresAt === 'string') {
    data.tokenExpiresAt = new Date(body.tokenExpiresAt)
  }
  if (Array.isArray(body.allowedIps)) {
    data.allowedIps = body.allowedIps.filter((ip: unknown) => typeof ip === 'string')
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  const updated = await prisma.agent.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      tokenExpiresAt: true,
      allowedIps: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params

  const agent = await prisma.agent.findUnique({ where: { id, ownerId: auth.userId }, select: { id: true } })
  if (!agent) {
    return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
  }

  await prisma.agent.delete({ where: { id } })

  return NextResponse.json({ success: true, message: 'Agent 已删除' })
}
