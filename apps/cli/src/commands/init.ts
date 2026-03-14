import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import { stringify as stringifyYaml } from 'yaml'
import { resolveConfigPath, getGlobalConfigDir, getGlobalConfigPath, logSuccess, logError, logWarn } from '../utils.js'

const DEFAULT_CONFIG_NAME = 'broker.yaml'

export const initCommand = new Command('init')
  .description('初始化 broker.yaml 配置文件')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-g, --global', '在全局配置目录创建配置文件 (~/.broker/config/)', false)
  .option('--force', '覆盖已存在的配置文件', false)
  .action((opts: { config?: string; global: boolean; force: boolean }) => {
    if (opts.global && opts.config) {
      logError('--global 和 --config 不能同时使用')
      process.exitCode = 1
      return
    }

    let configPath: string

    if (opts.global) {
      const globalDir = getGlobalConfigDir()
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true })
      }
      configPath = getGlobalConfigPath()
    } else if (opts.config) {
      configPath = path.resolve(opts.config)
    } else {
      configPath = path.resolve(DEFAULT_CONFIG_NAME)
    }

    if (fs.existsSync(configPath) && !opts.force) {
      logWarn(`配置文件已存在: ${configPath}`)
      logWarn('使用 --force 覆盖')
      return
    }

    const template = {
      version: '1',
      agents: [
        {
          id: 'my-agent',
          name: 'My AI Agent',
        },
      ],
      credentials: [
        {
          id: 'github-main',
          connector: 'github',
          token: '${GITHUB_TOKEN}',
        },
      ],
      policies: [
        {
          agent: 'my-agent',
          credential: 'github-main',
          actions: ['*'],
        },
      ],
      audit: {
        enabled: true,
        output: 'stdout',
      },
    }

    const yaml = stringifyYaml(template, { lineWidth: 120 })
    fs.writeFileSync(configPath, yaml, 'utf-8')
    logSuccess(`已创建配置文件: ${configPath}`)
    log_hint()
  })

function log_hint(): void {
  console.log(`
下一步：
  1. 设置环境变量: export GITHUB_TOKEN=your_token
  2. 验证配置: broker validate
  3. 诊断连接: broker diagnose
  4. 启动服务: broker serve
`)
}
