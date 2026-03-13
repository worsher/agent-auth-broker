import { hashToken } from '@broker/crypto'
import type { LocalStore } from './local-store.js'
import type { AgentConfig } from './config-loader.js'

/**
 * 通过 token 认证并返回匹配的 agent
 * @returns 匹配的 agent 配置，未匹配返回 null
 */
export function authenticateByToken(token: string, store: LocalStore): AgentConfig | null {
  const hash = hashToken(token)
  return store.findAgentByTokenHash(hash) ?? null
}
