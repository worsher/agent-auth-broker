import { Command } from 'commander'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { loadConfig, LocalStore, LocalBroker, authenticateByToken, ConfigWatcher } from '@broker/local-runtime'
import { resolveConfigPath, ensureConfigExists, logError } from '../utils.js'

export const serveCommand = new Command('serve')
  .description('启动 MCP Server（stdio 模式）')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-a, --agent <id>', 'Agent ID（默认使用配置中的第一个 agent）', undefined)
  .action(async (opts: { config?: string; agent?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }

    let config
    try {
      config = loadConfig(configPath)
    } catch (err) {
      logError(`配置加载失败: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
      return
    }

    const store = new LocalStore(config)
    const broker = new LocalBroker(store)

    // Token 认证：优先使用 BROKER_AGENT_TOKEN 环境变量
    let agentId: string
    const envToken = process.env.BROKER_AGENT_TOKEN
    if (envToken) {
      const matched = authenticateByToken(envToken, store)
      if (!matched) {
        logError('BROKER_AGENT_TOKEN 认证失败：token 不匹配任何 agent')
        process.exitCode = 1
        return
      }
      agentId = matched.id
      console.error(`[broker-cli] Token 认证成功: ${matched.name} (${agentId})`)
    } else {
      agentId = opts.agent ?? config.agents[0].id
    }

    const agent = store.getAgent(agentId)
    if (!agent) {
      logError(`Agent "${agentId}" 不存在`)
      process.exitCode = 1
      return
    }

    console.error(`[broker-cli] 使用配置: ${configPath}`)
    console.error(`[broker-cli] Agent: ${agent.name} (${agentId})`)

    const server = new Server(
      { name: 'agent-auth-broker', version: '0.1.0' },
      { capabilities: { tools: {} } }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = broker.listTools(agentId)

      const mcpTools: Tool[] = [
        {
          name: 'broker_call',
          description: '通过 Auth Broker 调用第三方服务（GitHub、飞书等），凭证由 Broker 安全管理',
          inputSchema: {
            type: 'object',
            required: ['connector', 'action', 'params'],
            properties: {
              connector: { type: 'string', description: '目标服务名称，如 "github"' },
              action: { type: 'string', description: '操作名称，如 "create_issue"' },
              params: { type: 'object', description: '操作参数' },
            },
          },
        },
        {
          name: 'broker_list_tools',
          description: '列出当前 Agent 被授权的所有工具',
          inputSchema: {
            type: 'object',
            properties: {
              connector: { type: 'string', description: '可选，过滤特定 connector 的工具' },
            },
          },
        },
      ]

      const toolMap = new Map<string, Tool>()
      for (const t of tools) {
        const toolName = `${t.connector}_${t.action}`
        if (toolMap.has(toolName)) continue

        toolMap.set(toolName, {
          name: toolName,
          description: `[${t.connectorName}] ${t.description}（凭证：${t.credentialName}）`,
          inputSchema: {
            type: 'object',
            description: `调用 ${t.connectorName} 的 ${t.actionName} 操作`,
          },
        })
      }

      return { tools: [...mcpTools, ...toolMap.values()] }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params
      const params = args as Record<string, unknown>

      try {
        if (name === 'broker_list_tools') {
          const tools = broker.listTools(agentId, params.connector as string | undefined)
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
          const allTools = broker.listTools(agentId)
          const matched = allTools.find(t => `${t.connector}_${t.action}` === name)
          if (!matched) {
            return {
              content: [{ type: 'text', text: `No permission for tool: ${name}` }],
              isError: true,
            }
          }
          connector = matched.connector
          action = matched.action
          callParams = params
        }

        const result = await broker.callTool(agentId, connector, action, callParams)

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

    // 启动配置文件热重载
    const watcher = new ConfigWatcher(configPath, store)
    watcher.start()
    console.error('[broker-cli] 配置热重载已启用')

    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('[broker-cli] MCP Server started (stdio mode)')

    // 进程退出时停止 watcher
    process.on('SIGINT', () => { watcher.stop(); process.exit(0) })
    process.on('SIGTERM', () => { watcher.stop(); process.exit(0) })
  })
