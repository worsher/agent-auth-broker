import { Command } from 'commander'
import { resolveConfigPath, readRawConfig, writeConfig, log, logSuccess, logError } from '../utils.js'

interface RawAgent {
  id: string
  name: string
}

export const agentCommand = new Command('agent')
  .description('Agent 管理')

agentCommand
  .command('create')
  .description('创建 Agent')
  .argument('<id>', 'Agent ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-n, --name <name>', 'Agent 名称', undefined)
  .action((id: string, opts: { config?: string; name?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    if (agents.find(a => a.id === id)) {
      logError(`Agent "${id}" 已存在`)
      process.exitCode = 1
      return
    }

    agents.push({
      id,
      name: opts.name ?? id,
    })

    config.agents = agents
    writeConfig(configPath, config)
    logSuccess(`已创建 Agent "${id}"`)
  })

agentCommand
  .command('list')
  .description('列出所有 Agent')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    if (agents.length === 0) {
      log('暂无 Agent')
      return
    }

    log(`Agent 列表 (${agents.length}):`)
    for (const agent of agents) {
      log(`  - ${agent.id} (${agent.name})`)
    }
  })

agentCommand
  .command('remove')
  .description('移除 Agent')
  .argument('<id>', 'Agent ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((id: string, opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    const index = agents.findIndex(a => a.id === id)
    if (index === -1) {
      logError(`Agent "${id}" 不存在`)
      process.exitCode = 1
      return
    }

    agents.splice(index, 1)
    config.agents = agents
    writeConfig(configPath, config)
    logSuccess(`已移除 Agent "${id}"`)
  })
