import { Command } from 'commander'
import { loadConfig, LocalStore, LocalBroker } from '@broker/local-runtime'
import { listConnectors } from '@broker/connectors'
import { resolveConfigPath, logSuccess, logError, logWarn, log } from '../utils.js'

export const diagnoseCommand = new Command('diagnose')
  .description('诊断配置和凭证连接状态')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action(async (opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)

    // 1. 加载配置
    log('1. 加载配置...')
    let config
    try {
      config = loadConfig(configPath)
      logSuccess(`配置加载成功 (${config.agents.length} agents, ${config.credentials.length} credentials, ${config.policies.length} policies)`)
    } catch (err) {
      logError(`配置加载失败: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
      return
    }

    // 2. 检查 Connector 可用性
    log('\n2. 检查 Connector...')
    const connectors = listConnectors()
    const registeredIds = new Set(connectors.map(c => c.info.id))
    for (const cred of config.credentials) {
      if (registeredIds.has(cred.connector)) {
        logSuccess(`Connector "${cred.connector}" 已注册`)
      } else {
        logError(`Connector "${cred.connector}" 未注册`)
      }
    }

    // 3. 检查凭证有效性（尝试调用简单 API）
    log('\n3. 测试凭证...')
    const store = new LocalStore(config)
    const broker = new LocalBroker(store)

    for (const cred of config.credentials) {
      const testAction = getTestAction(cred.connector)
      if (!testAction) {
        logWarn(`凭证 "${cred.id}" (${cred.connector}): 无测试操作`)
        continue
      }

      // 找到使用此凭证的 agent
      const policy = config.policies.find(p => p.credential === cred.id)
      if (!policy) {
        logWarn(`凭证 "${cred.id}": 无关联策略，跳过测试`)
        continue
      }

      try {
        const result = await broker.callTool(policy.agent, cred.connector, testAction, {})
        if (result.success) {
          logSuccess(`凭证 "${cred.id}" (${cred.connector}): 连接正常`)
        } else {
          logError(`凭证 "${cred.id}" (${cred.connector}): ${result.error}`)
        }
      } catch (err) {
        logError(`凭证 "${cred.id}" (${cred.connector}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    log('\n诊断完成')
  })

function getTestAction(connector: string): string | undefined {
  const testActions: Record<string, string> = {
    github: 'list_repos',
    feishu: 'get_user_info',
  }
  return testActions[connector]
}
