import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'
import { createAgentToken } from '@/lib/auth/agent-token'

// 生成（或重新生成）Agent Token
// Token 只返回一次，之后无法查看明文
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: { id: true, ownerId: true },
  })

  if (!agent) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
  if (agent.ownerId !== session.user.id) return NextResponse.json({ error: '无权操作' }, { status: 403 })

  const token = await createAgentToken(agent.id)

  return NextResponse.json({
    success: true,
    data: {
      token,
      warning: '请立即保存此 Token，它只会显示一次',
    },
  })
}
