import fs from 'node:fs'
import { Command } from 'commander'
import { stringify as stringifyYaml } from 'yaml'
import { resolveConfigPath, logSuccess, logError, logWarn } from '../utils.js'

export const initCommand = new Command('init')
  .description('初始化 broker.yaml 配置文件')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('--force', '覆盖已存在的配置文件', false)
  .action((opts: { config?: string; force: boolean }) => {
    const configPath = resolveConfigPath(opts.config)

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
