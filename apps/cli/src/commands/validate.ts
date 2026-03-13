import { Command } from 'commander'
import { validateConfigFile } from '@broker/local-runtime'
import { resolveConfigPath, logSuccess, logError } from '../utils.js'

export const validateCommand = new Command('validate')
  .description('验证 broker.yaml 配置文件格式')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .action((opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config)
    console.log(`验证配置文件: ${configPath}`)

    const { valid, errors } = validateConfigFile(configPath)

    if (valid) {
      logSuccess('配置文件格式正确')
    } else {
      logError('配置文件存在以下问题:')
      for (const err of errors) {
        console.log(`  - ${err}`)
      }
      process.exitCode = 1
    }
  })
