import { Command } from 'commander'
import { resolveConfigPath } from '../utils.js'
import { startServer } from '../ui/server.js'

export const uiCommand = new Command('ui')
  .description('启动 File Mode Web UI，可视化管理 broker.yaml')
  .option('-c, --config <path>', '配置文件路径', undefined)
  .option('-p, --port <port>', '服务端口', '3200')
  .action((opts: { config?: string; port: string }) => {
    const configPath = resolveConfigPath(opts.config)
    const port = parseInt(opts.port, 10)

    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('Invalid port number')
      process.exitCode = 1
      return
    }

    startServer(configPath, port)
  })
