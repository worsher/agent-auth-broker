import { Command } from 'commander'
import { generateAgentToken, hashToken } from '@broker/crypto'
import { resolveConfigPath, ensureConfigExists, readRawConfig, writeConfig, log, logSuccess, logError } from '../utils.js'

interface RawAgent {
  id: string
  name: string
  token_hash?: string
  token_prefix?: string
}

export const tokenCommand = new Command('token')
  .description('Agent Token 管理')

tokenCommand
  .command('generate')
  .description('为 Agent 生成认证 Token')
  .argument('<agent>', 'Agent ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-f, --force', '覆盖已有 token', false)
  .action((agentId: string, opts: { config?: string; force: boolean }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    const agent = agents.find(a => a.id === agentId)
    if (!agent) {
      logError(`Agent "${agentId}" 不存在`)
      process.exitCode = 1
      return
    }

    if (agent.token_hash && !opts.force) {
      logError(`Agent "${agentId}" 已有 token（prefix: ${agent.token_prefix}），使用 --force 覆盖`)
      process.exitCode = 1
      return
    }

    const { token, prefix } = generateAgentToken()
    agent.token_hash = hashToken(token)
    agent.token_prefix = prefix

    config.agents = agents
    writeConfig(configPath, config)

    logSuccess(`Token 已生成`)
    log('')
    log(`  Token:  ${token}`)
    log(`  Prefix: ${prefix}`)
    log('')
    log('  请妥善保存此 token，它不会再次显示。')
    log('  在 MCP 配置中设置环境变量：')
    log(`    BROKER_AGENT_TOKEN="${token}"`)
  })

tokenCommand
  .command('revoke')
  .description('撤销 Agent 的 Token')
  .argument('<agent>', 'Agent ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((agentId: string, opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    const agent = agents.find(a => a.id === agentId)
    if (!agent) {
      logError(`Agent "${agentId}" 不存在`)
      process.exitCode = 1
      return
    }

    if (!agent.token_hash) {
      logError(`Agent "${agentId}" 没有 token`)
      process.exitCode = 1
      return
    }

    delete agent.token_hash
    delete agent.token_prefix

    config.agents = agents
    writeConfig(configPath, config)
    logSuccess(`已撤销 Agent "${agentId}" 的 token`)
  })

tokenCommand
  .command('list')
  .description('列出所有 Agent 的 Token 状态')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const config = readRawConfig(configPath)
    const agents = (config.agents as RawAgent[] | undefined) ?? []

    if (agents.length === 0) {
      log('暂无 Agent')
      return
    }

    log(`Agent Token 状态 (${agents.length}):`)
    for (const agent of agents) {
      if (agent.token_hash) {
        log(`  - ${agent.id} (${agent.name}): token set (prefix: ${agent.token_prefix})`)
      } else {
        log(`  - ${agent.id} (${agent.name}): no token`)
      }
    }
  })
