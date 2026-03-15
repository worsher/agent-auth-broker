type WebhookEventHandler = (eventType: string, payload: Record<string, unknown>) => void

let _handler: WebhookEventHandler | null = null

export function setWebhookHandler(handler: WebhookEventHandler): void {
  _handler = handler
}

export function emitWebhookEvent(eventType: string, payload: Record<string, unknown>): void {
  if (_handler) {
    try {
      _handler(eventType, payload)
    } catch {
      // fire-and-forget: never let webhook emission break the caller
    }
  }
}
