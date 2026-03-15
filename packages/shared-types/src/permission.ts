export type PermissionResult =
  | 'ALLOWED'
  | 'DENIED_NO_POLICY'
  | 'DENIED_ACTION_NOT_ALLOWED'
  | 'DENIED_PARAM_CONSTRAINT'
  | 'DENIED_CREDENTIAL_EXPIRED'
  | 'DENIED_AGENT_INACTIVE'
  | 'DENIED_TOKEN_EXPIRED'
  | 'DENIED_IP_NOT_ALLOWED'

export interface PermissionCheckResult {
  result: PermissionResult
  credentialId?: string
  message?: string
}

export interface PermissionCheckInput {
  agentId: string
  connectorId: string
  action: string
  params?: Record<string, unknown>
  clientIp?: string
}
