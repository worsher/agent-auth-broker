import pino from 'pino'
import type { Logger } from 'pino'

let _logger: Logger = pino({ level: 'silent' })

export function setCoreLogger(logger: Logger): void {
  _logger = logger
}

export function getCoreLogger(): Logger {
  return _logger
}
