import type { PermissionCheckInput, PermissionCheckResult } from '@broker/shared-types'
import { expandScopes } from '@broker/connectors'
import type { LocalStore } from './local-store.js'
import { RateLimiter } from './rate-limiter.js'

// 全局速率限制器实例（跨调用保持状态）
const globalRateLimiter = new RateLimiter()

/**
 * 基于内存配置的权限检查
 * 逻辑与 @broker/core 的 checkPermission 一致，但数据源为 LocalStore
 */
export function checkLocalPermission(
  input: PermissionCheckInput,
  store: LocalStore
): PermissionCheckResult {
  const { agentId, connectorId, action } = input
  const fullAction = `${connectorId}:${action}`

  // 1. 检查 Agent 是否存在
  const agent = store.getAgent(agentId)
  if (!agent) {
    return { result: 'DENIED_AGENT_INACTIVE', message: 'Agent 不存在' }
  }

  // 2. 查找匹配的策略（findPolicy 已含过期检查）
  const policy = store.findPolicy(agentId, connectorId)
  if (!policy) {
    return { result: 'DENIED_NO_POLICY', message: `未找到 agent "${agentId}" 对 connector "${connectorId}" 的策略` }
  }

  // 3. 二次过期检查（防止 findPolicy 和 permission 逻辑分离导致遗漏）
  if (policy.expires_at && new Date(policy.expires_at) < new Date()) {
    return { result: 'DENIED_NO_POLICY', message: `策略已过期（${policy.expires_at}）` }
  }

  // 4. 检查 allowedActions（["*"] 或空数组 = 允许所有），支持 scope 展开
  const expandedActions = expandScopes(policy.actions)
  const actionsAllowAll = expandedActions.length === 0
    || (expandedActions.length === 1 && expandedActions[0] === '*')

  if (!actionsAllowAll && !expandedActions.includes(fullAction)) {
    return {
      result: 'DENIED_ACTION_NOT_ALLOWED',
      message: `操作 "${fullAction}" 不在允许列表中`,
    }
  }

  // 5. 检查参数约束
  if (policy.param_constraints && input.params) {
    for (const [key, constraint] of Object.entries(policy.param_constraints)) {
      const paramValue = input.params[key]
      if (constraint.pattern && typeof paramValue === 'string') {
        const regex = new RegExp(constraint.pattern)
        if (!regex.test(paramValue)) {
          return {
            result: 'DENIED_PARAM_CONSTRAINT',
            message: `参数 "${key}" 的值 "${paramValue}" 不匹配模式 "${constraint.pattern}"`,
          }
        }
      }
    }
  }

  // 6. 速率限制检查
  if (policy.rate_limit) {
    const rateCheck = globalRateLimiter.check(agentId, policy.credential, policy.rate_limit)
    if (!rateCheck.allowed) {
      const retrySeconds = Math.ceil(rateCheck.retryAfterMs / 1000)
      return {
        result: 'DENIED_ACTION_NOT_ALLOWED',
        message: `速率限制：超过 ${policy.rate_limit.max_calls} 次/${policy.rate_limit.window_seconds}秒，请 ${retrySeconds} 秒后重试`,
      }
    }
  }

  // 7. 确定凭证 ID
  const credentialId = policy.credential

  return { result: 'ALLOWED', credentialId }
}
