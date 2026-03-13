import { Command } from 'commander'
import { resolveConfigPath, readRawConfig, writeConfig, log, logSuccess, logError } from '../utils.js'

interface RawPolicy {
  agent: string
  credential: string
  actions: string[]
  param_constraints?: Record<string, { pattern?: string }>
}

export const policyCommand = new Command('policy')
  .description('策略管理')

policyCommand
  .command('set')
  .description('设置或更新策略')
  .argument('<agent>', 'Agent ID')
  .argument('<credential>', '凭证 ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('--actions <actions>', '允许的操作列表，逗号分隔（"*" 表示全部允许）', '*')
  .action((agentId: string, credentialId: string, opts: { config?: string; actions: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const policies = (config.policies as RawPolicy[] | undefined) ?? []

    const actions = opts.actions === '*' ? ['*'] : opts.actions.split(',').map(a => a.trim())

    // 查找已有策略
    const existing = policies.find(p => p.agent === agentId && p.credential === credentialId)
    if (existing) {
      existing.actions = actions
      logSuccess(`已更新策略: ${agentId} -> ${credentialId}`)
    } else {
      policies.push({
        agent: agentId,
        credential: credentialId,
        actions,
      })
      logSuccess(`已创建策略: ${agentId} -> ${credentialId}`)
    }

    config.policies = policies
    writeConfig(configPath, config)
  })

policyCommand
  .command('list')
  .description('列出所有策略')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const policies = (config.policies as RawPolicy[] | undefined) ?? []

    if (policies.length === 0) {
      log('暂无策略')
      return
    }

    log(`策略列表 (${policies.length}):`)
    for (const policy of policies) {
      const actionsStr = policy.actions.includes('*') ? '所有操作' : policy.actions.join(', ')
      log(`  - ${policy.agent} -> ${policy.credential}: [${actionsStr}]`)
    }
  })

policyCommand
  .command('remove')
  .description('移除策略')
  .argument('<agent>', 'Agent ID')
  .argument('<credential>', '凭证 ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((agentId: string, credentialId: string, opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const policies = (config.policies as RawPolicy[] | undefined) ?? []

    const index = policies.findIndex(p => p.agent === agentId && p.credential === credentialId)
    if (index === -1) {
      logError(`策略 "${agentId} -> ${credentialId}" 不存在`)
      process.exitCode = 1
      return
    }

    policies.splice(index, 1)
    config.policies = policies
    writeConfig(configPath, config)
    logSuccess(`已移除策略: ${agentId} -> ${credentialId}`)
  })
