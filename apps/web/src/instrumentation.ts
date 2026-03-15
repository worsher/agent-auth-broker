export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setCoreLogger } = await import('@broker/core')
    const { logger } = await import('./lib/logger')
    setCoreLogger(logger.child({ module: 'core' }))
  }
}
