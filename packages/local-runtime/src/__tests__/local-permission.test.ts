import { describe, it, expect, vi } from 'vitest'
import { checkLocalPermission } from '../local-permission'
import { LocalStore } from '../local-store'
import type { BrokerConfig } from '../config-loader'

function createStore(overrides: Partial<BrokerConfig> = {}): LocalStore {
  const config: BrokerConfig = {
    version: '1',
    agents: [{ id: 'agent1', name: 'Agent 1' }],
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
})
