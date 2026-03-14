import pino from 'pino'

export const logger = pino({
  name: 'broker-mcp',
  level: process.env.BROKER_LOG_LEVEL ?? 'info',
  // MCP stdio 模式使用 stdout 传输协议数据，日志必须走 stderr
  transport: { target: 'pino/file', options: { destination: 2 } },
})
