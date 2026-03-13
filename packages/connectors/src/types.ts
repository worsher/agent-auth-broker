import type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential } from '@broker/shared-types'

export interface ConnectorAdapter {
  readonly info: ConnectorInfo
  getActions(): ConnectorAction[]
  execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult>
}

export type { ConnectorAction, ConnectorInfo, ConnectorResult, DecryptedCredential }
