import { describe, it, expect, vi } from 'vitest'
import { checkLocalPermission } from '../local-permission'
import { LocalStore } from '../local-store'
import type { BrokerConfig } from '../config-loader'

function createStore(overrides: Partial<BrokerConfig> = {}): LocalStore {
  const config: BrokerConfig = {
    version: '1',
    agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: [] }],
    credentials: [{ id: 'cred1', connector: 'github', token: 'tok' }],
    policies: [{
      agent: 'agent1',
      credential: 'cred1',
      actions: ['*'],
    }],
    audit: { enabled: true, output: 'stdout' },
    ...overrides,
  }
  return new LocalStore(config)
}

describe('checkLocalPermission', () => {
  it('should ALLOW when wildcard policy exists', () => {
    const store = createStore()
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
    expect(result.credentialId).toBe('cred1')
  })

  it('should DENY nonexistent agent', () => {
    const store = createStore()
    const result = checkLocalPermission(
      { agentId: 'ghost', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('DENIED_AGENT_INACTIVE')
  })

  it('should DENY when no matching policy', () => {
    const store = createStore()
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'slack', action: 'send_message' },
      store
    )
    expect(result.result).toBe('DENIED_NO_POLICY')
  })

  it('should DENY action not in allowed list', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['github:list_repos'],
      }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'create_issue' },
      store
    )
    expect(result.result).toBe('DENIED_ACTION_NOT_ALLOWED')
  })

  it('should ALLOW action in explicit list', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['github:list_repos', 'github:create_issue'],
      }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should expand scope groups and check action', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['github:read'],
      }],
    })

    // list_repos is in github:read scope
    const allowed = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(allowed.result).toBe('ALLOWED')

    // create_issue is NOT in github:read scope
    const denied = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'create_issue' },
      store
    )
    expect(denied.result).toBe('DENIED_ACTION_NOT_ALLOWED')
  })

  it('should DENY when param constraint is violated', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['*'],
        param_constraints: { repo: { pattern: '^myorg/.*' } },
      }],
    })

    const denied = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_issues', params: { repo: 'other/repo' } },
      store
    )
    expect(denied.result).toBe('DENIED_PARAM_CONSTRAINT')

    const allowed = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_issues', params: { repo: 'myorg/app' } },
      store
    )
    expect(allowed.result).toBe('ALLOWED')
  })

  it('should DENY expired policy', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['*'],
        expires_at: '2020-01-01T00:00:00Z',
      }],
    })

    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    // Expired policy should not be found or denied
    expect(result.result).not.toBe('ALLOWED')
  })

  it('should ALLOW non-expired policy', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['*'],
        expires_at: '2099-12-31T23:59:59Z',
      }],
    })

    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should DENY when rate limit is exceeded', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['*'],
        rate_limit: { max_calls: 2, window_seconds: 60 },
      }],
    })

    checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )

    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('DENIED_ACTION_NOT_ALLOWED')
    expect(result.message).toContain('速率限制')
  })

  it('should DENY unsafe regex pattern (ReDoS protection)', () => {
    const store = createStore({
      policies: [{
        agent: 'agent1',
        credential: 'cred1',
        actions: ['*'],
        param_constraints: { repo: { pattern: '(a+)+$' } }, // classic ReDoS pattern
      }],
    })

    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_issues', params: { repo: 'test' } },
      store
    )
    expect(result.result).toBe('DENIED_PARAM_CONSTRAINT')
    expect(result.message).toContain('ReDoS')
  })

  // === Token TTL tests ===

  it('should DENY when agent token has expired', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', token_expires_at: '2020-01-01T00:00:00Z', allowed_ips: [] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('DENIED_TOKEN_EXPIRED')
  })

  it('should ALLOW when agent token has not expired', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', token_expires_at: '2099-12-31T23:59:59Z', allowed_ips: [] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should ALLOW when token_expires_at is not set', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: [] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  // === IP whitelist tests ===

  it('should DENY when client IP is not in allowed list', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: ['10.0.0.0/8'] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos', clientIp: '192.168.1.1' },
      store
    )
    expect(result.result).toBe('DENIED_IP_NOT_ALLOWED')
  })

  it('should ALLOW when client IP is in allowed CIDR range', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: ['10.0.0.0/8'] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos', clientIp: '10.1.2.3' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should ALLOW when client IP matches exact allowed IP', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: ['192.168.1.100'] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos', clientIp: '192.168.1.100' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should ALLOW when allowed_ips is empty (no restriction)', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: [] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos', clientIp: '1.2.3.4' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })

  it('should ALLOW when no clientIp is provided (skip IP check)', () => {
    const store = createStore({
      agents: [{ id: 'agent1', name: 'Agent 1', allowed_ips: ['10.0.0.0/8'] }],
    })
    const result = checkLocalPermission(
      { agentId: 'agent1', connectorId: 'github', action: 'list_repos' },
      store
    )
    expect(result.result).toBe('ALLOWED')
  })
})
