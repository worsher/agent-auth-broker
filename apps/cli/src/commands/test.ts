import { Command } from 'commander'
import { loadConfig, LocalStore, LocalBroker, authenticateByToken, checkLocalPermission } from '@broker/local-runtime'
import { resolveConfigPath, log, logError, logSuccess } from '../utils.js'

export const testCommand = new Command('test')
  .description('测试调用 connector 操作')
  .argument('<connector>', 'Connector 名称，如 "github"')
  .argument('<action>', '操作名称，如 "list_repos"')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-a, --agent <id>', 'Agent ID', undefined)
  .option('-p, --params <json>', '操作参数（JSON 格式）', '{}')
  .option('--dry-run', '仅执行权限检查，不实际调用 API', false)
  .action(async (
    connector: string,
    action: string,
    opts: { config?: string; agent?: string; params: string; dryRun: boolean }
  ) => {
    const configPath = resolveConfigPath(opts.config)

    let config
    try {
      config = loadConfig(configPath)
    } catch (err) {
      logError(`配置加载失败: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
      return
    }

    const store = new LocalStore(config)

    // 确定 agent
    let agentId: string
    const envToken = process.env.BROKER_AGENT_TOKEN
    if (envToken) {
      const matched = authenticateByToken(envToken, store)
      if (!matched) {
        logError('BROKER_AGENT_TOKEN 认证失败')
        process.exitCode = 1
        return
      }
      agentId = matched.id
    } else {
      agentId = opts.agent ?? config.agents[0].id
    }

    // 解析参数
    let params: Record<string, unknown>
    try {
      params = JSON.parse(opts.params)
    } catch {
      logError('参数格式错误，请提供有效的 JSON')
      process.exitCode = 1
      return
    }

    log(`Agent:     ${agentId}`)
    log(`Connector: ${connector}`)
    log(`Action:    ${action}`)
    log(`Params:    ${JSON.stringify(params)}`)
    log('')

    // 权限检查
    const permResult = checkLocalPermission(
      { agentId, connectorId: connector, action, params },
      store
    )

    if (permResult.result !== 'ALLOWED') {
      logError(`权限检查失败: ${permResult.result}`)
      log(`  ${permResult.message ?? ''}`)
      process.exitCode = 1
      return
    }

    logSuccess('权限检查通过')

    if (opts.dryRun) {
      log('(dry-run 模式，跳过实际调用)')
      return
    }

    // 实际调用
    log('')
    log('执行中...')
    const broker = new LocalBroker(store)
    const result = await broker.callTool(agentId, connector, action, params)

    if (result.success) {
      logSuccess('调用成功')
      log(JSON.stringify(result.data, null, 2))
    } else {
      logError(`调用失败: ${result.error}`)
      process.exitCode = 1
    }
  })
