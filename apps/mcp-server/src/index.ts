#!/usr/bin/env node
/**
 * Agent Auth Broker MCP Server
 *
 * 支持三种运行模式 + 两种传输方式：
 *
 * 运行模式：
 * - FILE MODE（推荐个人开发者）：BROKER_CONFIG 指向 broker.yaml，无需数据库
 * - LOCAL MODE（小团队开发）：DATABASE_URL + BROKER_MASTER_KEY，直连数据库
 * - REMOTE MODE（生产/多用户）：BROKER_URL，HTTP 调用 Web Server
 *
 * 传输方式：
 * - stdio（默认）：标准 MCP stdio 传输
 * - http：MCP_TRANSPORT=http MCP_PORT=3200，Streamable HTTP 传输
 *   可选 MCP_AUTH_TOKEN 启用 Bearer Token 认证
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

// 模式检测优先级：BROKER_URL > DATABASE_URL > BROKER_CONFIG
const mode = process.env.BROKER_URL
  ? 'REMOTE'
  : process.env.DATABASE_URL
    ? 'LOCAL'
    : process.env.BROKER_CONFIG
      ? 'FILE'
      : null

if (!mode) {
  console.error('[broker-mcp] 错误：请设置以下环境变量之一：')
  console.error('  BROKER_URL     — Remote Mode（HTTP 调用 Web Server）')
  console.error('  DATABASE_URL   — Local Mode（直连数据库）')
  console.error('  BROKER_CONFIG  — File Mode（纯本地，基于 broker.yaml）')
  process.exit(1)
}

const { listTools, callTool } = mode === 'REMOTE'
  ? await import('./broker-client.js')
  : mode === 'LOCAL'
    ? await import('./local-broker.js')
    : await import('./file-broker.js')

console.error(`[broker-mcp] Running in ${mode} mode`)

/**
 * 创建一个配置好 request handler 的 MCP Server 实例
 * HTTP 模式下每个 session 需要独立实例
 */
function createMcpServer(): Server {
  const server = new Server(
    { name: 'agent-auth-broker', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // 列出所有可用工具
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await listTools()

    const mcpTools: Tool[] = [
      {
        name: 'broker_call',
        description: '通过 Auth Broker 调用第三方服务（GitHub、飞书等），凭证由 Broker 安全管理，当前 Agent 不持有实际凭证',
        inputSchema: {
          type: 'object',
          required: ['connector', 'action', 'params'],
          properties: {
            connector: {
              type: 'string',
              description: '目标服务名称，如 "github"、"feishu"',
            },
            action: {
              type: 'string',
              description: '操作名称，如 "create_issue"、"list_repos"',
            },
            params: {
              type: 'object',
              description: '操作参数，具体字段依 connector 和 action 而定',
            },
          },
        },
      },
      {
        name: 'broker_list_tools',
        description: '列出当前 Agent 被授权可以使用的所有工具（connector + action 组合）',
        inputSchema: {
          type: 'object',
          properties: {
            connector: {
              type: 'string',
              description: '可选，过滤特定 connector 的工具',
            },
          },
        },
      },
    ]

    // 为每个被授权的工具自动生成命名工具（如 github_create_issue）
    const toolMap = new Map<string, Tool>()
    for (const t of tools) {
      const toolName = `${t.connector}_${t.action}`
      if (toolMap.has(toolName)) continue

      toolMap.set(toolName, {
        name: toolName,
        description: `[${t.connectorName}] ${t.description}（凭证：${t.credentialName}）`,
        inputSchema: {
          type: 'object',
          description: `调用 ${t.connectorName} 的 ${t.actionName} 操作，参数请参考 broker_list_tools`,
        },
      })
    }

    return { tools: [...mcpTools, ...toolMap.values()] }
  })

  // 处理工具调用
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const params = args as Record<string, unknown>

    try {
      if (name === 'broker_list_tools') {
        const tools = await listTools(params.connector as string | undefined)
        return {
          content: [{ type: 'text', text: JSON.stringify(tools, null, 2) }],
        }
      }

      let connector: string
      let action: string
      let callParams: Record<string, unknown>

      if (name === 'broker_call') {
        connector = params.connector as string
        action = params.action as string
        callParams = (params.params as Record<string, unknown>) ?? {}
      } else {
        const underscoreIdx = name.indexOf('_')
        if (underscoreIdx === -1) {
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
        }
        const allTools = await listTools()
        const matched = allTools.find(t => `${t.connector}_${t.action}` === name)
        if (!matched) {
          return {
            content: [{ type: 'text', text: `No permission for tool: ${name}. Use broker_list_tools to see available tools.` }],
            isError: true,
          }
        }
        connector = matched.connector
        action = matched.action
        callParams = params
      }

      const result = await callTool(connector, action, callParams)

      if (!result.success) {
        const errorText = result.permissionResult
          ? `Permission denied (${result.permissionResult}): ${result.error}`
          : `Error: ${result.error}`
        return { content: [{ type: 'text', text: errorText }], isError: true }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Internal error: ${message}` }], isError: true }
    }
  })

  return server
}

// 传输方式选择
const transport = process.env.MCP_TRANSPORT?.toLowerCase()

async function main() {
  if (transport === 'http') {
    const port = parseInt(process.env.MCP_PORT ?? '3200', 10)
    const { startHttpTransport } = await import('./http-transport.js')
    await startHttpTransport(createMcpServer, port)
  } else {
    const server = createMcpServer()
    const stdioTransport = new StdioServerTransport()
    await server.connect(stdioTransport)
    console.error('[broker-mcp] MCP Server started (stdio mode)')
  }
}

main().catch((err) => {
  console.error('[broker-mcp] Fatal error:', err)
  process.exit(1)
})
