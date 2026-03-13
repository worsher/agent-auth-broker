/**
 * Broker API 客户端
 * MCP Server 通过此客户端与 Broker Core (Next.js) 通信
 */

const BROKER_URL = process.env.BROKER_URL ?? 'http://localhost:3100'
const AGENT_TOKEN = process.env.BROKER_AGENT_TOKEN

if (!AGENT_TOKEN) {
  console.error('[broker-mcp] BROKER_AGENT_TOKEN is not set')
  process.exit(1)
}

async function brokerFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AGENT_TOKEN}`,
      ...options.headers,
    },
  })
  return res.json()
}

export interface ToolEntry {
  connector: string
  connectorName: string
  credentialName: string
  action: string
  actionName: string
  description: string
}

export async function listTools(connector?: string): Promise<ToolEntry[]> {
  const query = connector ? `?connector=${encodeURIComponent(connector)}` : ''
  const res = await brokerFetch(`/api/broker/list-tools${query}`) as {
    success: boolean
    data?: ToolEntry[]
    error?: string
  }
  if (!res.success) throw new Error(res.error ?? 'Failed to list tools')
  return res.data ?? []
}

export async function callTool(
  connector: string,
  action: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string; permissionResult?: string }> {
  return brokerFetch('/api/broker/call', {
    method: 'POST',
    body: JSON.stringify({ connector, action, params }),
  }) as Promise<{ success: boolean; data?: unknown; error?: string; permissionResult?: string }>
}
