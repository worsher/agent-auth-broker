/**
 * Local Mode Broker
 * DATABASE_URL + BROKER_MASTER_KEY 설정 시 DB에 직접 접근
 * broker-client.ts와 동일한 인터페이스 제공
 */

import { verifyAgentToken, listTools as coreListTools, callTool as coreCallTool } from '@broker/core'
import type { ToolEntry } from '@broker/core'
import { logger } from './logger.js'

export type { ToolEntry }

const AGENT_TOKEN = process.env.BROKER_AGENT_TOKEN

if (!AGENT_TOKEN) {
  logger.fatal('BROKER_AGENT_TOKEN is not set')
  process.exit(1)
}

// 启动时验证 Token 并缓存 agentId
let _agentId: string | null = null

async function getAgentId(): Promise<string> {
  if (_agentId) return _agentId

  const agentId = await verifyAgentToken(AGENT_TOKEN!)
  if (!agentId) {
    logger.fatal('Invalid BROKER_AGENT_TOKEN')
    process.exit(1)
  }

  _agentId = agentId
  return agentId
}

export async function listTools(connector?: string): Promise<ToolEntry[]> {
  const agentId = await getAgentId()
  return coreListTools(agentId, connector)
}

export async function callTool(
  connector: string,
  action: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string; permissionResult?: string }> {
  const agentId = await getAgentId()
  return coreCallTool(agentId, connector, action, params)
}
