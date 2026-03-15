export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setCoreLogger, setWebhookHandler } = await import('@broker/core')
    const { logger } = await import('./lib/logger')
    const { deliverWebhookEvent } = await import('./lib/webhook-deliver')

    setCoreLogger(logger.child({ module: 'core' }))
    setWebhookHandler((type: string, payload: Record<string, unknown>) => {
      deliverWebhookEvent(type, payload).catch(() => {})
    })
  }
}
