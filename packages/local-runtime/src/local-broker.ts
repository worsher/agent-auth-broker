import { getConnector, listConnectors } from '@broker/connectors'
import type { BrokerCallResult } from '@broker/shared-types'
import type { LocalStore } from './local-store.js'
import { checkLocalPermission } from './local-permission.js'
import { loadLocalCredential } from './local-vault.js'
import { LocalAuditLogger } from './local-audit.js'

export interface ToolEntry {
  connector: string
  connectorName: string
  credentialName: string
  action: string
  actionName: string
  description: string
}

/**
 * 本地 Broker 实例，基于 YAML 配置运行
 * 替代数据库模式下的 @broker/core broker
 */
export class LocalBroker {
  private store: LocalStore
  private audit: LocalAuditLogger

  constructor(store: LocalStore) {
    this.store = store
    this.audit = new LocalAuditLogger(store.audit)
  }

  /**
   * 列出 agent 被授权的所有工具
   */
  listTools(agentId: string, connectorFilter?: string): ToolEntry[] {
    const policies = this.store.getAgentPolicies(agentId)
    const tools: ToolEntry[] = []

    for (const policy of policies) {
      const connectorId = policy.credentialConfig.connector
      if (connectorFilter && connectorId !== connectorFilter) continue

      const conn = getConnector(connectorId)
      if (!conn) continue

      const actions = conn.getActions()
      const actionsAllowAll = policy.actions.length === 0
        || (policy.actions.length === 1 && policy.actions[0] === '*')

      for (const action of actions) {
        const fullAction = `${connectorId}:${action.id}`
        if (!actionsAllowAll && !policy.actions.includes(fullAction)) continue

        tools.push({
          connector: connectorId,
          connectorName: conn.info.name,
          credentialName: policy.credentialConfig.id,
          action: action.id,
          actionName: action.name,
          description: action.description,
        })
      }
    }

    return tools
  }

  /**
   * 调用工具
   */
  async callTool(
    agentId: string,
    connectorId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<BrokerCallResult> {
    // 1. 权限检查
    const permCheck = checkLocalPermission(
      { agentId, connectorId, action, params },
      this.store
    )

    if (permCheck.result !== 'ALLOWED' || !permCheck.credentialId) {
      this.audit.log({
        agentId,
        connectorId,
        action: `${connectorId}:${action}`,
        params,
        permissionResult: permCheck.result,
        responseStatus: 403,
      })
      return {
        success: false,
        error: permCheck.message,
        permissionResult: permCheck.result,
      }
    }

    // 2. 获取 Connector
    const connector = getConnector(connectorId)
    if (!connector) {
      return { success: false, error: `未知的 connector: ${connectorId}` }
    }

    // 3. 加载凭证并执行
    try {
      const credential = loadLocalCredential(permCheck.credentialId, this.store)
      const result = await connector.execute(action, params, credential)

      this.audit.log({
        agentId,
        connectorId,
        action: `${connectorId}:${action}`,
        params,
        permissionResult: 'ALLOWED',
        responseStatus: result.httpStatus ?? (result.success ? 200 : 500),
        errorMessage: result.success ? undefined : result.error?.message,
      })

      return {
        success: result.success,
        data: result.data,
        error: result.error?.message,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      this.audit.log({
        agentId,
        connectorId,
        action: `${connectorId}:${action}`,
        params,
        permissionResult: 'ALLOWED',
        responseStatus: 500,
        errorMessage: message,
      })
      return { success: false, error: message }
    }
  }
}
