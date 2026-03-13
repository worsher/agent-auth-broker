import fs from 'node:fs'
import type { AuditConfig } from './config-loader.js'

export interface AuditEntry {
  timestamp: string
  agentId: string
  connectorId: string
  action: string
  params: Record<string, unknown>
  permissionResult: string
  responseStatus?: number
  errorMessage?: string
}

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'key', 'credential']

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s)) ? '[REDACTED]' : v,
    ])
  )
}

/**
 * 本地审计日志记录器
 * 支持输出到 stdout 或文件
 */
export class LocalAuditLogger {
  private config: AuditConfig

  constructor(config: AuditConfig) {
    this.config = config
  }

  log(entry: Omit<AuditEntry, 'timestamp' | 'params'> & { params: Record<string, unknown> }): void {
    if (!this.config.enabled) return

    const record: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      params: sanitizeParams(entry.params),
    }

    const line = JSON.stringify(record)

    if (this.config.output === 'file' && this.config.file) {
      fs.appendFileSync(this.config.file, line + '\n', 'utf-8')
    } else {
      console.error(`[broker-audit] ${line}`)
    }
  }
}
