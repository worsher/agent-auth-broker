import type { PermissionCheckInput, PermissionCheckResult } from '@broker/shared-types'
import { prisma } from '../db/prisma'

export async function checkPermission(input: PermissionCheckInput): Promise<PermissionCheckResult> {
  const { agentId, connectorId, action } = input
  const fullAction = `${connectorId}:${action}`

  // 1. 检查 Agent 状态
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { isActive: true },
  })

  if (!agent || !agent.isActive) {
    return { result: 'DENIED_AGENT_INACTIVE', message: 'Agent is inactive or not found' }
  }

  // 2. 查找匹配的 AgentPolicy
  const now = new Date()
  const policy = await prisma.agentPolicy.findFirst({
    where: {
      agentId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      credential: {
        connectorId,
        status: 'ACTIVE',
      },
    },
    include: {
      credential: {
        select: { id: true, status: true, expiresAt: true },
      },
    },
  })

  if (!policy) {
    return { result: 'DENIED_NO_POLICY', message: `No active policy found for connector: ${connectorId}` }
  }

  // 3. 检查凭证过期
  if (policy.credential.status !== 'ACTIVE') {
    return { result: 'DENIED_CREDENTIAL_EXPIRED', message: 'Credential is not active' }
  }
  if (policy.credential.expiresAt && policy.credential.expiresAt < now) {
    return { result: 'DENIED_CREDENTIAL_EXPIRED', message: 'Credential has expired' }
  }

  // 4. 检查 allowedActions（空数组 = 允许所有）
  if (policy.allowedActions.length > 0 && !policy.allowedActions.includes(fullAction)) {
    return {
      result: 'DENIED_ACTION_NOT_ALLOWED',
      message: `Action "${fullAction}" is not in the allowed list`,
    }
  }

  // 5. 检查参数约束（简单实现：仅检查 pattern 约束）
  if (policy.paramConstraints && input.params) {
    const constraints = policy.paramConstraints as Record<string, { pattern?: string }>
    for (const [key, constraint] of Object.entries(constraints)) {
      const paramValue = input.params[key]
      if (constraint.pattern && typeof paramValue === 'string') {
        const regex = new RegExp(constraint.pattern)
        if (!regex.test(paramValue)) {
          return {
            result: 'DENIED_PARAM_CONSTRAINT',
            message: `Parameter "${key}" value "${paramValue}" does not match pattern "${constraint.pattern}"`,
          }
        }
      }
    }
  }

  return { result: 'ALLOWED', credentialId: policy.credentialId }
}
