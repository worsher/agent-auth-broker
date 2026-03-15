import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BrokerClient, ConnectorProxy } from '../client'
import {
  AuthenticationError,
  PermissionDeniedError,
  BrokerApiError,
  NetworkError,
} from '../errors'

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  })
}

describe('BrokerClient', () => {
  let client: BrokerClient

  beforeEach(() => {
    client = new BrokerClient({
      baseUrl: 'http://localhost:3100',
      token: 'agnt_test1234',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw if baseUrl is missing', () => {
    expect(() => new BrokerClient({ baseUrl: '', token: 'tok' })).toThrow('baseUrl is required')
  })

  it('should throw if token is missing', () => {
    expect(() => new BrokerClient({ baseUrl: 'http://localhost', token: '' })).toThrow('token is required')
  })

  it('should strip trailing slashes from baseUrl', async () => {
    const c = new BrokerClient({ baseUrl: 'http://localhost:3100///', token: 'agnt_test' })
    const mock = mockFetchResponse(200, { success: true, data: [] })
    vi.stubGlobal('fetch', mock)

    await c.listTools()

    expect(mock.mock.calls[0][0]).toBe('http://localhost:3100/api/broker/list-tools')
  })

  // === listTools ===

  describe('listTools', () => {
    it('should list all tools', async () => {
      const tools = [
        { connector: 'github', connectorName: 'GitHub', credentialName: 'main', action: 'list_repos', actionName: 'List Repos', description: 'List repos' },
      ]
      vi.stubGlobal('fetch', mockFetchResponse(200, { success: true, data: tools }))

      const result = await client.listTools()

      expect(result).toEqual(tools)
    })

    it('should filter by connector', async () => {
      const mock = mockFetchResponse(200, { success: true, data: [] })
      vi.stubGlobal('fetch', mock)

      await client.listTools('github')

      expect(mock.mock.calls[0][0]).toContain('?connector=github')
    })

    it('should throw BrokerApiError when success is false', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(200, { success: false, error: 'Internal error' }))

      await expect(client.listTools()).rejects.toThrow(BrokerApiError)
      await expect(client.listTools()).rejects.toThrow('Internal error')
    })

    it('should return empty array when data is undefined', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(200, { success: true }))

      const result = await client.listTools()
      expect(result).toEqual([])
    })
  })

  // === callTool ===

  describe('callTool', () => {
    it('should call tool successfully', async () => {
      const responseBody = { success: true, data: { id: 123, title: 'Issue' } }
      vi.stubGlobal('fetch', mockFetchResponse(200, responseBody))

      const result = await client.callTool('github', 'create_issue', { repo: 'org/repo', title: 'Bug' })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ id: 123, title: 'Issue' })
    })

    it('should send correct request body', async () => {
      const mock = mockFetchResponse(200, { success: true })
      vi.stubGlobal('fetch', mock)

      await client.callTool('slack', 'send_message', { channel: '#general', text: 'hello' })

      const [url, opts] = mock.mock.calls[0]
      expect(url).toBe('http://localhost:3100/api/broker/call')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({
        connector: 'slack',
        action: 'send_message',
        params: { channel: '#general', text: 'hello' },
      })
    })

    it('should default params to empty object', async () => {
      const mock = mockFetchResponse(200, { success: true })
      vi.stubGlobal('fetch', mock)

      await client.callTool('github', 'list_repos')

      const body = JSON.parse(mock.mock.calls[0][1].body)
      expect(body.params).toEqual({})
    })
  })

  // === Authentication ===

  describe('authentication', () => {
    it('should send Bearer token in Authorization header', async () => {
      const mock = mockFetchResponse(200, { success: true, data: [] })
      vi.stubGlobal('fetch', mock)

      await client.listTools()

      const headers = mock.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer agnt_test1234')
    })

    it('should throw AuthenticationError on 401', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(401, { error: 'Invalid token' }))

      await expect(client.listTools()).rejects.toThrow(AuthenticationError)
      try {
        await client.listTools()
      } catch (err) {
        expect((err as AuthenticationError).status).toBe(401)
        expect((err as AuthenticationError).message).toBe('Invalid token')
      }
    })
  })

  // === Permission Denied ===

  describe('permission denied', () => {
    it('should throw PermissionDeniedError on 403', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(403, {
        success: false,
        error: 'Action not allowed',
        permissionResult: 'DENIED_ACTION_NOT_ALLOWED',
      }))

      try {
        await client.callTool('github', 'delete_repo', { repo: 'org/repo' })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(PermissionDeniedError)
        const e = err as PermissionDeniedError
        expect(e.status).toBe(403)
        expect(e.message).toBe('Action not allowed')
        expect(e.permissionResult).toBe('DENIED_ACTION_NOT_ALLOWED')
      }
    })
  })

  // === API Errors ===

  describe('API errors', () => {
    it('should throw BrokerApiError on 500', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(500, { error: 'Server error' }))

      await expect(client.callTool('github', 'list_repos')).rejects.toThrow(BrokerApiError)
    })

    it('should throw BrokerApiError on 400', async () => {
      vi.stubGlobal('fetch', mockFetchResponse(400, { error: 'Missing connector' }))

      try {
        await client.callTool('', 'list_repos')
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(BrokerApiError)
        expect((err as BrokerApiError).status).toBe(400)
      }
    })
  })

  // === Timeout ===

  describe('timeout', () => {
    it('should throw NetworkError on timeout', async () => {
      const c = new BrokerClient({
        baseUrl: 'http://localhost:3100',
        token: 'agnt_test',
        timeout: 1, // 1ms timeout — will abort immediately
      })

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        // Wait longer than timeout
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000)
          opts.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        })
      }))

      await expect(c.listTools()).rejects.toThrow(NetworkError)
    })
  })

  // === onError callback ===

  describe('onError callback', () => {
    it('should call onError on authentication error', async () => {
      const onError = vi.fn()
      const c = new BrokerClient({
        baseUrl: 'http://localhost:3100',
        token: 'agnt_bad',
        onError,
      })

      vi.stubGlobal('fetch', mockFetchResponse(401, { error: 'Bad token' }))

      await expect(c.listTools()).rejects.toThrow()
      expect(onError).toHaveBeenCalledWith(expect.any(AuthenticationError))
    })
  })

  // === ConnectorProxy ===

  describe('ConnectorProxy', () => {
    it('should create proxy via client.connector()', () => {
      const proxy = client.connector('github')
      expect(proxy).toBeInstanceOf(ConnectorProxy)
    })

    it('should call tool through proxy', async () => {
      const mock = mockFetchResponse(200, { success: true, data: { id: 1 } })
      vi.stubGlobal('fetch', mock)

      const github = client.connector('github')
      const result = await github.call('create_issue', { title: 'Bug' })

      expect(result.success).toBe(true)
      const body = JSON.parse(mock.mock.calls[0][1].body)
      expect(body.connector).toBe('github')
      expect(body.action).toBe('create_issue')
    })

    it('should list actions through proxy', async () => {
      const tools = [
        { connector: 'github', connectorName: 'GitHub', credentialName: 'main', action: 'list_repos', actionName: 'List Repos', description: 'List repos' },
      ]
      const mock = mockFetchResponse(200, { success: true, data: tools })
      vi.stubGlobal('fetch', mock)

      const github = client.connector('github')
      const result = await github.listActions()

      expect(result).toEqual(tools)
      expect(mock.mock.calls[0][0]).toContain('?connector=github')
    })
  })
})
