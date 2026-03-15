import type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential } from '@broker/shared-types'

export interface OAuth2RefreshConfig {
  /** Token endpoint URL, e.g. 'https://oauth2.googleapis.com/token' */
  tokenEndpoint: string
  /** 环境变量名，存放 OAuth2 client_id */
  clientIdEnvVar: string
  /** 环境变量名，存放 OAuth2 client_secret */
  clientSecretEnvVar: string
  /** 认证方式：body = 参数放 body（默认），basic = HTTP Basic Auth */
  authStyle?: 'body' | 'basic'
}

export interface ConnectorAdapter {
  readonly info: ConnectorInfo
  getActions(): ConnectorAction[]
  execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult>
  /** 验证凭证是否有效（可选） */
  validateCredential?(credential: DecryptedCredential): Promise<{ valid: boolean; error?: string }>
  /** OAuth2 刷新配置（仅 OAuth2 类型的 connector 需要） */
  oauth2RefreshConfig?: OAuth2RefreshConfig
}

export type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential }
