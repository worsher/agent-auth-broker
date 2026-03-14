import type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential } from '@broker/shared-types'

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
}

export type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential }
