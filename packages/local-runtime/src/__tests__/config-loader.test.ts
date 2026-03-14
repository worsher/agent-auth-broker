import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig, validateConfigFile } from '../config-loader'

function createTempConfig(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-test-'))
  const file = path.join(dir, 'broker.yaml')
  fs.writeFileSync(file, yaml, 'utf-8')
  return file
}

function cleanupTempConfig(filePath: string): void {
  const dir = path.dirname(filePath)
  fs.rmSync(dir, { recursive: true, force: true })
}

const VALID_YAML = `
version: "1"
agents:
  - id: test-agent
    name: Test Agent
credentials:
  - id: github-main
    connector: github
    token: test-token-123
policies:
  - agent: test-agent
    credential: github-main
    actions:
      - "*"
audit:
  enabled: true
  output: stdout
`

describe('loadConfig', () => {
  it('should load a valid config file', () => {
    const file = createTempConfig(VALID_YAML)
    try {
      const config = loadConfig(file)
      expect(config.version).toBe('1')
      expect(config.agents).toHaveLength(1)
      expect(config.agents[0].id).toBe('test-agent')
      expect(config.credentials).toHaveLength(1)
      expect(config.credentials[0].connector).toBe('github')
      expect(config.policies).toHaveLength(1)
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should resolve environment variables in token', () => {
    process.env.TEST_GH_TOKEN = 'resolved-token-value'
    const yaml = VALID_YAML.replace('test-token-123', '${TEST_GH_TOKEN}')
    const file = createTempConfig(yaml)
    try {
      const config = loadConfig(file)
      expect(config.credentials[0].token).toBe('resolved-token-value')
    } finally {
      delete process.env.TEST_GH_TOKEN
      cleanupTempConfig(file)
    }
  })

  it('should throw if referenced env var is not set', () => {
    delete process.env.NONEXISTENT_VAR
    const yaml = VALID_YAML.replace('test-token-123', '${NONEXISTENT_VAR}')
    const file = createTempConfig(yaml)
    try {
      expect(() => loadConfig(file)).toThrow('NONEXISTENT_VAR')
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should throw if config file does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/broker.yaml')).toThrow('配置文件不存在')
  })

  it('should throw if credential has neither token nor encrypted', () => {
    const yaml = `
version: "1"
agents:
  - id: a
    name: A
credentials:
  - id: c
    connector: github
policies:
  - agent: a
    credential: c
    actions: ["*"]
`
    const file = createTempConfig(yaml)
    try {
      expect(() => loadConfig(file)).toThrow('token 或 encrypted')
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should throw if policy references nonexistent agent', () => {
    const yaml = `
version: "1"
agents:
  - id: real-agent
    name: Real
credentials:
  - id: cred1
    connector: github
    token: tok
policies:
  - agent: ghost-agent
    credential: cred1
    actions: ["*"]
`
    const file = createTempConfig(yaml)
    try {
      expect(() => loadConfig(file)).toThrow('ghost-agent')
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should throw if policy references nonexistent credential', () => {
    const yaml = `
version: "1"
agents:
  - id: a
    name: A
credentials:
  - id: real-cred
    connector: github
    token: tok
policies:
  - agent: a
    credential: ghost-cred
    actions: ["*"]
`
    const file = createTempConfig(yaml)
    try {
      expect(() => loadConfig(file)).toThrow('ghost-cred')
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should load config with token_hash and token_prefix', () => {
    const yaml = `
version: "1"
agents:
  - id: a
    name: A
    token_hash: abc123
    token_prefix: agnt_abc
credentials:
  - id: c
    connector: github
    token: tok
policies:
  - agent: a
    credential: c
    actions: ["*"]
`
    const file = createTempConfig(yaml)
    try {
      const config = loadConfig(file)
      expect(config.agents[0].token_hash).toBe('abc123')
      expect(config.agents[0].token_prefix).toBe('agnt_abc')
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should load config with rate_limit and expires_at', () => {
    const yaml = `
version: "1"
agents:
  - id: a
    name: A
credentials:
  - id: c
    connector: github
    token: tok
policies:
  - agent: a
    credential: c
    actions: ["github:read"]
    rate_limit:
      max_calls: 100
      window_seconds: 3600
    expires_at: "2030-12-31T23:59:59Z"
`
    const file = createTempConfig(yaml)
    try {
      const config = loadConfig(file)
      expect(config.policies[0].rate_limit).toEqual({ max_calls: 100, window_seconds: 3600 })
      expect(config.policies[0].expires_at).toBe('2030-12-31T23:59:59Z')
    } finally {
      cleanupTempConfig(file)
    }
  })
})

describe('validateConfigFile', () => {
  it('should return valid for correct config', () => {
    const file = createTempConfig(VALID_YAML)
    try {
      const result = validateConfigFile(file)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should return errors for missing required fields', () => {
    const yaml = `
version: "1"
agents: []
`
    const file = createTempConfig(yaml)
    try {
      const result = validateConfigFile(file)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    } finally {
      cleanupTempConfig(file)
    }
  })

  it('should return error for nonexistent file', () => {
    const result = validateConfigFile('/nonexistent/broker.yaml')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('不存在')
  })
})
