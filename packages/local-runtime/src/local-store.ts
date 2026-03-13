import type { BrokerConfig, AgentConfig, CredentialConfig, PolicyConfig, AuditConfig } from './config-loader.js'

/**
 * 内存数据存储，从 broker.yaml 配置加载
 * 替代数据库模式下的 Prisma ORM
 */
export class LocalStore {
  private agents: Map<string, AgentConfig>
  private credentials: Map<string, CredentialConfig>
  private policies: PolicyConfig[]
  readonly audit: AuditConfig
  readonly encryptionKey: string | undefined

  constructor(config: BrokerConfig) {
    this.agents = new Map(config.agents.map(a => [a.id, a]))
    this.credentials = new Map(config.credentials.map(c => [c.id, c]))
    this.policies = config.policies
    this.audit = config.audit
    this.encryptionKey = config.encryption_key
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id)
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  getCredential(id: string): CredentialConfig | undefined {
    return this.credentials.get(id)
  }

  listCredentials(): CredentialConfig[] {
    return Array.from(this.credentials.values())
  }

  /**
   * 查找 agent 对 connector 的策略
   */
  findPolicy(agentId: string, connectorId: string): PolicyConfig | undefined {
    return this.policies.find(p => {
      if (p.agent !== agentId) return false
      const cred = this.credentials.get(p.credential)
      if (!cred || cred.connector !== connectorId) return false
      if (p.expires_at && new Date(p.expires_at) < new Date()) return false
      return true
    })
  }

  /**
   * 获取 agent 的所有活跃策略
   */
  getAgentPolicies(agentId: string): Array<PolicyConfig & { credentialConfig: CredentialConfig }> {
    const result: Array<PolicyConfig & { credentialConfig: CredentialConfig }> = []

    for (const policy of this.policies) {
      if (policy.agent !== agentId) continue
      if (policy.expires_at && new Date(policy.expires_at) < new Date()) continue

      const cred = this.credentials.get(policy.credential)
      if (!cred) continue

      result.push({ ...policy, credentialConfig: cred })
    }

    return result
  }
}
