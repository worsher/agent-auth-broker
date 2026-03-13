import type { PermissionCheckInput, PermissionCheckResult } from '@broker/shared-types'
import type { LocalStore } from './local-store.js'

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

  // 2. 查找匹配的策略
  const policy = store.findPolicy(agentId, connectorId)
  if (!policy) {
    return { result: 'DENIED_NO_POLICY', message: `未找到 agent "${agentId}" 对 connector "${connectorId}" 的策略` }
  }

  // 3. 检查 allowedActions（["*"] 或空数组 = 允许所有）
  const actionsAllowAll = policy.actions.length === 0
    || (policy.actions.length === 1 && policy.actions[0] === '*')

  if (!actionsAllowAll && !policy.actions.includes(fullAction)) {
    return {
      result: 'DENIED_ACTION_NOT_ALLOWED',
      message: `操作 "${fullAction}" 不在允许列表中`,
    }
  }

  // 4. 检查参数约束
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

  // 5. 确定凭证 ID
  const credentialId = policy.credential

  return { result: 'ALLOWED', credentialId }
}
