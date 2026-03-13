import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'

// 列出当前用户的所有 Agent
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const agents = await prisma.agent.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
      tokenPrefix: true,
      _count: { select: { policies: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ success: true, data: agents })
}

// 创建新 Agent（不立即生成 token，需通过 /api/agents/[id]/token 单独获取）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json() as { name?: string; description?: string }
  const { name, description } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: '请提供 Agent 名称' }, { status: 400 })
  }

  // 创建 Agent，tokenHash/tokenPrefix 使用占位符，稍后通过 generate-token 填充
  const agent = await prisma.agent.create({
    data: {
      name: name.trim(),
      description: description?.trim(),
      ownerId: session.user.id,
      tokenHash: 'pending',
      tokenPrefix: `pending_${Date.now()}`,
    },
    select: { id: true, name: true, description: true, isActive: true, createdAt: true },
  })

  return NextResponse.json({ success: true, data: agent }, { status: 201 })
}
