import pino from 'pino'

export const logger = pino({
  name: 'broker-web',
  level: process.env.BROKER_LOG_LEVEL ?? 'info',
})
