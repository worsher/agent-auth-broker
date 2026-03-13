import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerToken } from '@/lib/auth/agent-token'
import { prisma } from '@/lib/db/prisma'
import { getConnector } from '@broker/connectors'

export async function GET(request: NextRequest) {
  const agentId = await verifyBearerToken(request.headers.get('authorization'))
  if (!agentId) {
    return NextResponse.json({ error: '无效的 Agent Token' }, { status: 401 })
  }

  const connectorFilter = request.nextUrl.searchParams.get('connector')

  // 查询该 Agent 被授权的所有策略
  const policies = await prisma.agentPolicy.findMany({
    where: {
      agentId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      credential: { status: 'ACTIVE' },
    },
    include: {
      credential: { select: { connectorId: true, name: true } },
    },
  })

  const tools: Array<{
    connector: string
    connectorName: string
    credentialName: string
    action: string
    actionName: string
    description: string
  }> = []

  for (const policy of policies) {
    const connectorId = policy.credential.connectorId
    if (connectorFilter && connectorId !== connectorFilter) continue

    const connector = getConnector(connectorId)
    if (!connector) continue

    const actions = connector.getActions()
    for (const action of actions) {
      const fullAction = `${connectorId}:${action.id}`
      // 如果 allowedActions 为空，表示允许所有
      if (policy.allowedActions.length > 0 && !policy.allowedActions.includes(fullAction)) continue

      tools.push({
        connector: connectorId,
        connectorName: connector.info.name,
        credentialName: policy.credential.name,
        action: action.id,
        actionName: action.name,
        description: action.description,
      })
    }
  }

  return NextResponse.json({ success: true, data: tools })
}
