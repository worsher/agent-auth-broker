export interface AgentTokenPayload {
  agentId: string
  prefix: string
}

export interface BrokerCallInput {
  connector: string
  action: string
  params: Record<string, unknown>
}

export interface BrokerCallResult {
  success: boolean
  data?: unknown
  error?: string
  permissionResult?: string
}
