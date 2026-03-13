export type AuthType = 'oauth2' | 'api_key'

export interface ConnectorAction {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ConnectorInfo {
  id: string
  name: string
  description: string
  authType: AuthType
}

export interface ConnectorResult {
  success: boolean
  data?: unknown
  error?: { code: string; message: string }
  httpStatus?: number
}

export interface DecryptedCredential {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  scope?: string
  extraData?: Record<string, unknown>
}
