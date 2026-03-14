import fs from 'node:fs'
import { createHmac } from 'node:crypto'
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
  integrity?: string
  previousHash?: string
}

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'key', 'credential']

/** 创世哈希，链的起点 */
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

/** HMAC-SHA256 签名密钥（用于审计日志完整性） */
const AUDIT_HMAC_KEY = 'broker-audit-integrity'

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s)) ? '[REDACTED]' : v,
    ])
  )
}

/**
 * 计算审计条目的 HMAC-SHA256 哈希
 * 输入：previousHash + 条目数据（不含 integrity 和 previousHash 字段）
 */
export function computeEntryHash(entry: Omit<AuditEntry, 'integrity' | 'previousHash'>, previousHash: string): string {
  const payload = previousHash + JSON.stringify(entry)
  return createHmac('sha256', AUDIT_HMAC_KEY).update(payload).digest('hex')
}

/**
 * 验证审计日志链的完整性
 * @returns 验证结果，包含是否有效及错误详情
 */
export function verifyAuditChain(entries: AuditEntry[]): { valid: boolean; error?: string; brokenAt?: number } {
  let previousHash = GENESIS_HASH

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry.integrity || !entry.previousHash) {
      return { valid: false, error: `Entry ${i} missing integrity fields`, brokenAt: i }
    }
    if (entry.previousHash !== previousHash) {
      return { valid: false, error: `Entry ${i} previousHash mismatch`, brokenAt: i }
    }

    const { integrity: _integrity, previousHash: _prevHash, ...data } = entry
    const expectedHash = computeEntryHash(data, previousHash)
    if (entry.integrity !== expectedHash) {
      return { valid: false, error: `Entry ${i} integrity hash mismatch`, brokenAt: i }
    }

    previousHash = entry.integrity
  }

  return { valid: true }
}

/**
 * 本地审计日志记录器
 * 支持输出到 stdout 或文件，带链式哈希防篡改
 */
export class LocalAuditLogger {
  private config: AuditConfig
  private previousHash: string = GENESIS_HASH

  constructor(config: AuditConfig) {
    this.config = config
  }

  log(entry: Omit<AuditEntry, 'timestamp' | 'params' | 'integrity' | 'previousHash'> & { params: Record<string, unknown> }): void {
    if (!this.config.enabled) return

    const record: Omit<AuditEntry, 'integrity' | 'previousHash'> = {
      ...entry,
      timestamp: new Date().toISOString(),
      params: sanitizeParams(entry.params),
    }

    // 计算链式哈希
    const integrity = computeEntryHash(record, this.previousHash)
    const fullRecord: AuditEntry = {
      ...record,
      previousHash: this.previousHash,
      integrity,
    }

    this.previousHash = integrity

    const line = JSON.stringify(fullRecord)

    if (this.config.output === 'file' && this.config.file) {
      fs.appendFileSync(this.config.file, line + '\n', 'utf-8')
    } else {
      console.error(`[broker-audit] ${line}`)
    }
  }
}
