import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin } from '@/lib/auth/require-admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params
  const body = await request.json() as Record<string, unknown>

  const policy = await prisma.agentPolicy.findUnique({ where: { id }, select: { id: true } })
  if (!policy) {
    return NextResponse.json({ error: 'Policy 不存在' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (Array.isArray(body.allowedActions)) {
    data.allowedActions = body.allowedActions.filter((a: unknown) => typeof a === 'string')
  }
  if (body.paramConstraints !== undefined) {
    data.paramConstraints = body.paramConstraints === null ? null : body.paramConstraints
  }
  if (body.expiresAt === null) {
    data.expiresAt = null
  } else if (typeof body.expiresAt === 'string') {
    data.expiresAt = new Date(body.expiresAt)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  const updated = await prisma.agentPolicy.update({
    where: { id },
    data,
    include: {
      agent: { select: { id: true, name: true } },
      credential: { select: { id: true, name: true, connectorId: true } },
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await context.params

  const policy = await prisma.agentPolicy.findUnique({ where: { id }, select: { id: true } })
  if (!policy) {
    return NextResponse.json({ error: 'Policy 不存在' }, { status: 404 })
  }

  await prisma.agentPolicy.delete({ where: { id } })

  return NextResponse.json({ success: true, message: 'Policy 已删除' })
}
