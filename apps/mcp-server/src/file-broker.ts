/**
 * File Mode Broker
 *
 * 从 broker.yaml 加载配置，纯本地运行，无需数据库
 * 触发条件：BROKER_CONFIG 环境变量指向 broker.yaml 路径
 */

import { loadConfig, LocalStore, LocalBroker } from '@broker/local-runtime'
import type { ToolEntry } from '@broker/local-runtime'
import type { BrokerCallResult } from '@broker/shared-types'

let broker: LocalBroker | undefined
let agentId: string | undefined

function getBroker(): { broker: LocalBroker; agentId: string } {
  if (!broker || !agentId) {
    const configPath = process.env.BROKER_CONFIG!
    const tokenOrAgent = process.env.BROKER_AGENT_ID ?? process.env.BROKER_AGENT_TOKEN

    const config = loadConfig(configPath)

    // 确定 agent ID：优先使用 BROKER_AGENT_ID，否则使用配置中的第一个
    agentId = tokenOrAgent ?? config.agents[0]?.id
    if (!agentId) {
      throw new Error('未找到 Agent，请在 broker.yaml 中配置或设置 BROKER_AGENT_ID 环境变量')
    }

    const store = new LocalStore(config)
    broker = new LocalBroker(store)

    console.error(`[broker-mcp] File mode: config=${configPath}, agent=${agentId}`)
  }

  return { broker, agentId }
}

export async function listTools(connector?: string): Promise<ToolEntry[]> {
  const { broker: b, agentId: id } = getBroker()
  return b.listTools(id, connector)
}

export async function callTool(
  connector: string,
  action: string,
  params: Record<string, unknown>
): Promise<BrokerCallResult> {
  const { broker: b, agentId: id } = getBroker()
  return b.callTool(id, connector, action, params)
}
