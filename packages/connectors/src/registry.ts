import type { ConnectorAdapter } from './types'
import { githubConnector } from './github/index'

const connectors = new Map<string, ConnectorAdapter>([
  ['github', githubConnector],
])

export function getConnector(id: string): ConnectorAdapter | undefined {
  return connectors.get(id)
}

export function listConnectors(): ConnectorAdapter[] {
  return Array.from(connectors.values())
}

export function registerConnector(adapter: ConnectorAdapter): void {
  connectors.set(adapter.info.id, adapter)
}
