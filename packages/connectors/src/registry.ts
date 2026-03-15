import type { ConnectorAdapter } from './types'
import { githubConnector } from './github/index'
import { slackConnector } from './slack/index'
import { notionConnector } from './notion/index'
import { jiraConnector } from './jira/index'
import { linearConnector } from './linear/index'
import { googleConnector } from './google/index'
import { discordConnector } from './discord/index'
import { telegramConnector } from './telegram/index'
import { feishuConnector } from './feishu/index'

const connectors = new Map<string, ConnectorAdapter>([
  ['github', githubConnector],
  ['slack', slackConnector],
  ['notion', notionConnector],
  ['jira', jiraConnector],
  ['linear', linearConnector],
  ['google', googleConnector],
  ['discord', discordConnector],
  ['telegram', telegramConnector],
  ['feishu', feishuConnector],
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

/**
 * 从 npm 包或本地路径动态加载 connector
 * 模块必须 default export 或 named export 一个 ConnectorAdapter
 *
 * @param source npm 包名（如 "broker-connector-slack"）或本地路径（如 "./my-connector"）
 */
export async function loadConnectorPlugin(source: string): Promise<ConnectorAdapter> {
  const mod = await import(source)
  const adapter: ConnectorAdapter = mod.default ?? mod.connector

  if (!adapter?.info?.id || typeof adapter.getActions !== 'function' || typeof adapter.execute !== 'function') {
    throw new Error(`Invalid connector plugin "${source}": must export a ConnectorAdapter with info, getActions, and execute`)
  }

  registerConnector(adapter)
  return adapter
}

/**
 * 批量加载 connector 插件
 * 加载失败不中断，返回错误列表
 */
export async function loadConnectorPlugins(sources: string[]): Promise<{ loaded: string[]; errors: Array<{ source: string; error: string }> }> {
  const loaded: string[] = []
  const errors: Array<{ source: string; error: string }> = []

  for (const source of sources) {
    try {
      const adapter = await loadConnectorPlugin(source)
      loaded.push(adapter.info.id)
    } catch (err) {
      errors.push({ source, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { loaded, errors }
}
