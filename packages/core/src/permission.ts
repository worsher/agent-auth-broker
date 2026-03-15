import type { PrismaClient } from '@prisma/client'
import type { PermissionCheckInput, PermissionCheckResult } from '@broker/shared-types'
import safe from 'safe-regex2'
import { getPrisma } from './db.js'
import { isIpAllowed } from '@broker/shared-utils'
import { getCoreLogger } from './logger.js'
import { incrementCounter, METRIC } from './metrics.js'
import { emitWebhookEvent } from './events.js'

/**
 * 数据库模式的权限检查
 * @param input 权限检查输入
 * @param prismaClient 可选的 Prisma 实例，不传则使用 core 内部的全局实例
 */
export async function checkPermission(input: PermissionCheckInput, prismaClient?: PrismaClient): Promise<PermissionCheckResult> {
  const log = getCoreLogger()
  const prisma = prismaClient ?? getPrisma()
  const { agentId, connectorId, action } = input
  const fullAction = `${connectorId}:${action}`

  // 1. 检查 Agent 状态
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { isActive: true, tokenExpiresAt: true, allowedIps: true, ownerId: true },
  })

  if (!agent || !agent.isActive) {
    incrementCounter(METRIC.PERMISSION_DENIED)
    emitWebhookEvent('permission.denied', { agentId, action: fullAction, reason: 'DENIED_AGENT_INACTIVE', ownerId: agent?.ownerId })
    log.info({ agentId, action: fullAction }, 'permission denied: agent inactive')
    return { result: 'DENIED_AGENT_INACTIVE', message: 'Agent is inactive or not found' }
  }

  // 1.5 Token TTL 检查
  if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
    incrementCounter(METRIC.PERMISSION_DENIED)
    log.info({ agentId, action: fullAction }, 'permission denied: token expired')
    return { result: 'DENIED_TOKEN_EXPIRED', message: 'Agent token has expired' }
  }

  // 1.6 IP 白名单检查
  if (agent.allowedIps.length > 0 && input.clientIp) {
    if (!isIpAllowed(input.clientIp, agent.allowedIps)) {
      incrementCounter(METRIC.PERMISSION_DENIED)
      emitWebhookEvent('permission.denied', { agentId, action: fullAction, reason: 'DENIED_IP_NOT_ALLOWED', clientIp: input.clientIp, ownerId: agent.ownerId })
      log.warn({ agentId, clientIp: input.clientIp, action: fullAction }, 'permission denied: IP not allowed')
      return { result: 'DENIED_IP_NOT_ALLOWED', message: `Client IP "${input.clientIp}" is not in the allowed list` }
    }
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
        // 不限制 status：允许 ACTIVE 和可刷新状态的凭证通过，由 vault.ts 处理过期刷新
        // 仅排除已撤销的凭证
        status: { not: 'REVOKED' },
      },
    },
    include: {
      credential: {
        select: { id: true, status: true, expiresAt: true },
      },
    },
  })

  if (!policy) {
    incrementCounter(METRIC.PERMISSION_DENIED)
    log.info({ agentId, connectorId, action: fullAction }, 'permission denied: no policy')
    return { result: 'DENIED_NO_POLICY', message: `No active policy found for connector: ${connectorId}` }
  }

  // 3. 凭证状态检查（仅拒绝已撤销；过期/刷新由 vault.ts 处理）
  if (policy.credential.status === 'REVOKED') {
    incrementCounter(METRIC.PERMISSION_DENIED)
    log.info({ agentId, connectorId, action: fullAction }, 'permission denied: credential revoked')
    return { result: 'DENIED_CREDENTIAL_EXPIRED', message: 'Credential has been revoked' }
  }

  // 4. 检查 allowedActions（空数组 = 允许所有）
  if (policy.allowedActions.length > 0 && !policy.allowedActions.includes(fullAction)) {
    incrementCounter(METRIC.PERMISSION_DENIED)
    log.info({ agentId, action: fullAction }, 'permission denied: action not allowed')
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
        if (!safe(constraint.pattern)) {
          return {
            result: 'DENIED_PARAM_CONSTRAINT',
            message: `Parameter constraint "${key}" has an unsafe regex pattern (potential ReDoS): "${constraint.pattern}"`,
          }
        }
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

  incrementCounter(METRIC.PERMISSION_ALLOWED)
  log.debug({ agentId, connectorId, action: fullAction, credentialId: policy.credentialId }, 'permission allowed')
  return { result: 'ALLOWED', credentialId: policy.credentialId, ownerId: agent.ownerId }
}
