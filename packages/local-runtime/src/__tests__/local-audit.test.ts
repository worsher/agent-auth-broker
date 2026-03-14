import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { LocalAuditLogger, computeEntryHash, verifyAuditChain, type AuditEntry } from '../local-audit.js'

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

function makeEntry(overrides: Partial<AuditEntry> = {}): Omit<AuditEntry, 'timestamp' | 'params' | 'integrity' | 'previousHash'> & { params: Record<string, unknown> } {
  return {
    agentId: 'agent-1',
    connectorId: 'github',
    action: 'list_repos',
    params: {},
    permissionResult: 'ALLOWED',
    ...overrides,
  }
}

describe('computeEntryHash', () => {
  it('应该生成确定性哈希', () => {
    const entry = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const h1 = computeEntryHash(entry, GENESIS_HASH)
    const h2 = computeEntryHash(entry, GENESIS_HASH)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('不同 previousHash 应产生不同哈希', () => {
    const entry = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const h1 = computeEntryHash(entry, GENESIS_HASH)
    const h2 = computeEntryHash(entry, 'aaaa')
    expect(h1).not.toBe(h2)
  })

  it('不同数据应产生不同哈希', () => {
    const e1 = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act1', params: {}, permissionResult: 'ALLOWED' }
    const e2 = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act2', params: {}, permissionResult: 'ALLOWED' }
    expect(computeEntryHash(e1, GENESIS_HASH)).not.toBe(computeEntryHash(e2, GENESIS_HASH))
  })
})

describe('verifyAuditChain', () => {
  it('空链应验证通过', () => {
    expect(verifyAuditChain([])).toEqual({ valid: true })
  })

  it('正确的链应验证通过', () => {
    const data1 = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const hash1 = computeEntryHash(data1, GENESIS_HASH)
    const entry1: AuditEntry = { ...data1, previousHash: GENESIS_HASH, integrity: hash1 }

    const data2 = { timestamp: '2026-01-01T00:01:00.000Z', agentId: 'a', connectorId: 'c', action: 'act2', params: {}, permissionResult: 'DENIED' }
    const hash2 = computeEntryHash(data2, hash1)
    const entry2: AuditEntry = { ...data2, previousHash: hash1, integrity: hash2 }

    expect(verifyAuditChain([entry1, entry2])).toEqual({ valid: true })
  })

  it('篡改的条目应验证失败', () => {
    const data1 = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const hash1 = computeEntryHash(data1, GENESIS_HASH)
    const entry1: AuditEntry = { ...data1, previousHash: GENESIS_HASH, integrity: hash1 }

    // 篡改 permissionResult
    const tampered: AuditEntry = { ...entry1, permissionResult: 'DENIED' }
    const result = verifyAuditChain([tampered])
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(0)
  })

  it('缺少 integrity 字段应验证失败', () => {
    const entry: AuditEntry = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const result = verifyAuditChain([entry])
    expect(result.valid).toBe(false)
    expect(result.error).toContain('missing integrity fields')
  })

  it('断裂的链（previousHash 不匹配）应验证失败', () => {
    const data1 = { timestamp: '2026-01-01T00:00:00.000Z', agentId: 'a', connectorId: 'c', action: 'act', params: {}, permissionResult: 'ALLOWED' }
    const hash1 = computeEntryHash(data1, GENESIS_HASH)
    const entry1: AuditEntry = { ...data1, previousHash: GENESIS_HASH, integrity: hash1 }

    const data2 = { timestamp: '2026-01-01T00:01:00.000Z', agentId: 'a', connectorId: 'c', action: 'act2', params: {}, permissionResult: 'ALLOWED' }
    // 使用错误的 previousHash
    const wrongPrev = 'wrong_hash'
    const hash2 = computeEntryHash(data2, wrongPrev)
    const entry2: AuditEntry = { ...data2, previousHash: wrongPrev, integrity: hash2 }

    const result = verifyAuditChain([entry1, entry2])
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(1)
    expect(result.error).toContain('previousHash mismatch')
  })
})

describe('LocalAuditLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('日志输出应包含 integrity 和 previousHash', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new LocalAuditLogger({ enabled: true, output: 'stdout' })

    logger.log(makeEntry())

    expect(stderr).toHaveBeenCalledOnce()
    const output = stderr.mock.calls[0][0] as string
    const json = JSON.parse(output.replace('[broker-audit] ', ''))
    expect(json.integrity).toMatch(/^[0-9a-f]{64}$/)
    expect(json.previousHash).toBe(GENESIS_HASH)
  })

  it('多条日志应形成链式哈希', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new LocalAuditLogger({ enabled: true, output: 'stdout' })

    logger.log(makeEntry({ action: 'list_repos' }))
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'))
    logger.log(makeEntry({ action: 'create_issue' }))

    const entries: AuditEntry[] = stderr.mock.calls.map(call => {
      const line = (call[0] as string).replace('[broker-audit] ', '')
      return JSON.parse(line)
    })

    expect(entries).toHaveLength(2)
    expect(entries[0].previousHash).toBe(GENESIS_HASH)
    expect(entries[1].previousHash).toBe(entries[0].integrity)

    // 验证整条链
    expect(verifyAuditChain(entries)).toEqual({ valid: true })
  })

  it('文件输出应包含 integrity 字段', () => {
    const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {})
    const logger = new LocalAuditLogger({ enabled: true, output: 'file', file: '/tmp/audit.log' })

    logger.log(makeEntry())

    expect(appendSpy).toHaveBeenCalledOnce()
    const line = (appendSpy.mock.calls[0][1] as string).trim()
    const json = JSON.parse(line)
    expect(json.integrity).toMatch(/^[0-9a-f]{64}$/)
    expect(json.previousHash).toBe(GENESIS_HASH)
  })

  it('disabled 时不应输出', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new LocalAuditLogger({ enabled: false, output: 'stdout' })

    logger.log(makeEntry())

    expect(stderr).not.toHaveBeenCalled()
  })

  it('敏感参数应被脱敏', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new LocalAuditLogger({ enabled: true, output: 'stdout' })

    logger.log(makeEntry({ params: { repo: 'org/repo', token: 'ghp_secret123' } } as any))

    const output = stderr.mock.calls[0][0] as string
    const json = JSON.parse(output.replace('[broker-audit] ', ''))
    expect(json.params.repo).toBe('org/repo')
    expect(json.params.token).toBe('[REDACTED]')
  })
})
