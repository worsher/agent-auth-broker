import pino from 'pino'

export const logger = pino({
  name: 'broker',
  level: process.env.BROKER_LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 2 } } // stderr
    : undefined,
})
