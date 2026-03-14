import { Command } from 'commander'
import { listConnectors } from '@broker/connectors'
import { encryptCredential, generateMasterKey } from '@broker/crypto'
import { resolveConfigPath, ensureConfigExists, readRawConfig, writeConfig, log, logSuccess, logError, logWarn } from '../utils.js'

interface RawCredential {
  id: string
  connector: string
  token?: string
  encrypted?: string
}

export const credentialCommand = new Command('credential')
  .description('凭证管理')

credentialCommand
  .command('add')
  .description('添加凭证')
  .argument('<connector>', '服务类型 (如 github)')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('--id <id>', '凭证 ID（默认为 connector 名称）', undefined)
  .option('--env <name>', '环境变量名称（使用 ${ENV_VAR} 引用）', undefined)
  .option('--token <token>', '直接指定 token 值', undefined)
  .action((connector: string, opts: { config?: string; id?: string; env?: string; token?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const credentialId = opts.id ?? `${connector}-main`

    // 验证 connector 是否支持
    const connectors = listConnectors()
    const supported = connectors.find(c => c.info.id === connector)
    if (!supported) {
      logError(`不支持的 connector: "${connector}"`)
      log(`支持的 connector: ${connectors.map(c => c.info.id).join(', ')}`)
      process.exitCode = 1
      return
    }

    // 确定 token 值
    let tokenValue: string
    if (opts.env) {
      tokenValue = `\${${opts.env}}`
    } else if (opts.token) {
      tokenValue = opts.token
      logWarn('直接指定 token 值不安全，建议使用 --env 引用环境变量')
    } else {
      logError('请指定 --env <ENV_VAR> 或 --token <value>')
      process.exitCode = 1
      return
    }

    const config = readRawConfig(configPath)
    const credentials = (config.credentials as RawCredential[] | undefined) ?? []

    // 检查是否已存在
    const existing = credentials.find(c => c.id === credentialId)
    if (existing) {
      logWarn(`凭证 "${credentialId}" 已存在，将被更新`)
      existing.token = tokenValue
      delete existing.encrypted
    } else {
      credentials.push({
        id: credentialId,
        connector,
        token: tokenValue,
      })
    }

    config.credentials = credentials
    writeConfig(configPath, config)
    logSuccess(`已添加凭证 "${credentialId}" (${connector})`)
  })

credentialCommand
  .command('list')
  .description('列出所有凭证')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const config = readRawConfig(configPath)
    const credentials = (config.credentials as RawCredential[] | undefined) ?? []

    if (credentials.length === 0) {
      log('暂无凭证')
      return
    }

    log(`凭证列表 (${credentials.length}):`)
    for (const cred of credentials) {
      const source = cred.token?.startsWith('${')
        ? `env: ${cred.token}`
        : cred.encrypted
          ? 'encrypted'
          : 'plaintext'
      log(`  - ${cred.id} (${cred.connector}) [${source}]`)
    }
  })

credentialCommand
  .command('remove')
  .description('移除凭证')
  .argument('<id>', '凭证 ID')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((id: string, opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    if (!ensureConfigExists(configPath)) {
      process.exitCode = 1
      return
    }
    const config = readRawConfig(configPath)
    const credentials = (config.credentials as RawCredential[] | undefined) ?? []

    const index = credentials.findIndex(c => c.id === id)
    if (index === -1) {
      logError(`凭证 "${id}" 不存在`)
      process.exitCode = 1
      return
    }

    credentials.splice(index, 1)
    config.credentials = credentials
    writeConfig(configPath, config)
    logSuccess(`已移除凭证 "${id}"`)
  })
