import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'

// 获取 Agent 的权限策略
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const agent = await prisma.agent.findUnique({
    where: { id: params.id, ownerId: session.user.id },
    include: {
      policies: {
        include: {
          credential: { select: { id: true, name: true, connectorId: true } },
        },
      },
    },
  })

  if (!agent) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })

  return NextResponse.json({ success: true, data: agent.policies })
}

// 创建权限策略
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const agent = await prisma.agent.findUnique({
    where: { id: params.id, ownerId: session.user.id },
    select: { id: true },
  })
  if (!agent) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })

  const body = await request.json() as {
    credentialId?: string
    allowedActions?: string[]
    paramConstraints?: Record<string, unknown>
    expiresAt?: string
  }

  const { credentialId, allowedActions = [], paramConstraints, expiresAt } = body

  if (!credentialId) return NextResponse.json({ error: '请提供 credentialId' }, { status: 400 })

  // 验证 credential 归属
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId, ownerId: session.user.id },
    select: { id: true },
  })
  if (!credential) return NextResponse.json({ error: 'Credential 不存在或无权访问' }, { status: 404 })

  const policy = await prisma.agentPolicy.upsert({
    where: { agentId_credentialId: { agentId: params.id, credentialId } },
    create: {
      agentId: params.id,
      credentialId,
      allowedActions,
      paramConstraints: (paramConstraints as Prisma.InputJsonValue) ?? undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
    update: {
      allowedActions,
      paramConstraints: (paramConstraints as Prisma.InputJsonValue) ?? undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isActive: true,
    },
  })

  return NextResponse.json({ success: true, data: policy }, { status: 201 })
}
