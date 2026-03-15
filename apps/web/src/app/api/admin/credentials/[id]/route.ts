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

  const credential = await prisma.credential.findUnique({
    where: { id, ownerId: auth.userId },
    select: { id: true, status: true },
  })
  if (!credential) {
    return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
  }

  const allowedStatuses = ['ACTIVE', 'REVOKED', 'REFRESH_REQUIRED']
  if (typeof body.status !== 'string' || !allowedStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: `status 必须是 ${allowedStatuses.join(' | ')}` },
      { status: 400 }
    )
  }

  const updated = await prisma.credential.update({
    where: { id },
    data: { status: body.status as any },
    select: {
      id: true,
      name: true,
      connectorId: true,
      status: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}
