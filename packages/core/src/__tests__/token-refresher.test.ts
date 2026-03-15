import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attemptTokenRefresh } from '../token-refresher.js'

// Mock @broker/connectors
vi.mock('@broker/connectors', () => ({
  getConnector: vi.fn(),
}))

// Mock @broker/crypto
vi.mock('@broker/crypto', () => ({
  decryptCredential: vi.fn(),
  encryptCredential: vi.fn(),
}))

import { getConnector } from '@broker/connectors'
import { decryptCredential, encryptCredential } from '@broker/crypto'

const mockGetConnector = vi.mocked(getConnector)
const mockDecrypt = vi.mocked(decryptCredential)
const mockEncrypt = vi.mocked(encryptCredential)

function createMockPrisma() {
  return {
    credential: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any
}

const MOCK_CONNECTOR_WITH_REFRESH = {
  oauth2RefreshConfig: {
    tokenEndpoint: 'https://oauth2.example.com/token',
    clientIdEnvVar: 'TEST_CLIENT_ID',
    clientSecretEnvVar: 'TEST_CLIENT_SECRET',
  },
}

const MOCK_CONNECTOR_BASIC_AUTH = {
  oauth2RefreshConfig: {
    tokenEndpoint: 'https://api.notion.com/v1/oauth/token',
    clientIdEnvVar: 'TEST_CLIENT_ID',
    clientSecretEnvVar: 'TEST_CLIENT_SECRET',
    authStyle: 'basic' as const,
  },
}

describe('attemptTokenRefresh', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>

  beforeEach(() => {
    mockPrisma = createMockPrisma()
    process.env.TEST_CLIENT_ID = 'my-client-id'
    process.env.TEST_CLIENT_SECRET = 'my-client-secret'

    mockDecrypt.mockReturnValue({
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
    })

    mockEncrypt.mockReturnValue({
      encryptedData: 'new-encrypted-data',
      encryptionKeyId: 'new-encryption-key-id',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TEST_CLIENT_ID
    delete process.env.TEST_CLIENT_SECRET
  })

  it('should refresh token successfully', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await attemptTokenRefresh(
      'cred-1', 'google', 'enc-data', 'enc-key', mockPrisma
    )

    expect(result.accessToken).toBe('new-access-token')
    expect(result.refreshToken).toBe('new-refresh-token')

    // Should re-encrypt and save to DB
    expect(mockEncrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })
    )
    expect(mockPrisma.credential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: expect.objectContaining({
        encryptedData: 'new-encrypted-data',
        encryptionKeyId: 'new-encryption-key-id',
        status: 'ACTIVE',
      }),
    })

    // Should set expiresAt when expires_in is provided
    const updateData = mockPrisma.credential.update.mock.calls[0][0].data
    expect(updateData.expiresAt).toBeInstanceOf(Date)
  })

  it('should preserve old refresh token when provider does not rotate', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        // No refresh_token in response
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await attemptTokenRefresh(
      'cred-2', 'github', 'enc-data', 'enc-key', mockPrisma
    )

    expect(result.refreshToken).toBe('old-refresh-token')
  })

  it('should throw when credential has no refresh token', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)
    mockDecrypt.mockReturnValue({ accessToken: 'tok' }) // no refreshToken

    await expect(
      attemptTokenRefresh('cred-3', 'google', 'enc-data', 'enc-key', mockPrisma)
    ).rejects.toThrow('has no refresh token')
  })

  it('should throw when connector does not support refresh', async () => {
    mockGetConnector.mockReturnValue({ info: { id: 'telegram' } } as any) // no oauth2RefreshConfig

    await expect(
      attemptTokenRefresh('cred-4', 'telegram', 'enc-data', 'enc-key', mockPrisma)
    ).rejects.toThrow('does not support OAuth2 token refresh')
  })

  it('should throw when client env vars are missing', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)
    delete process.env.TEST_CLIENT_ID

    await expect(
      attemptTokenRefresh('cred-5', 'google', 'enc-data', 'enc-key', mockPrisma)
    ).rejects.toThrow('TEST_CLIENT_ID')
  })

  it('should throw on HTTP error from token endpoint', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Token has been revoked',
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      attemptTokenRefresh('cred-6', 'google', 'enc-data', 'enc-key', mockPrisma)
    ).rejects.toThrow('Token has been revoked')
  })

  it('should use basic auth style when configured', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_BASIC_AUTH as any)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-token' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await attemptTokenRefresh('cred-7', 'notion', 'enc-data', 'enc-key', mockPrisma)

    const fetchCall = mockFetch.mock.calls[0]
    const headers = fetchCall[1].headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
    // Body should NOT contain client_id/client_secret
    const body = fetchCall[1].body as string
    expect(body).not.toContain('client_id')
  })

  it('should deduplicate concurrent refresh calls for same credential', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)

    let resolveCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      resolveCount++
      // Simulate network delay
      await new Promise(r => setTimeout(r, 10))
      return {
        ok: true,
        json: async () => ({ access_token: `token-${resolveCount}` }),
      }
    })
    vi.stubGlobal('fetch', mockFetch)

    // Fire two concurrent refreshes for the same credential
    const [result1, result2] = await Promise.all([
      attemptTokenRefresh('cred-dedup', 'google', 'enc-data', 'enc-key', mockPrisma),
      attemptTokenRefresh('cred-dedup', 'google', 'enc-data', 'enc-key', mockPrisma),
    ])

    // Both should get the same result
    expect(result1.accessToken).toBe(result2.accessToken)
    // fetch should only be called once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should allow retry after failed refresh (dedup map cleaned up)', async () => {
    mockGetConnector.mockReturnValue(MOCK_CONNECTOR_WITH_REFRESH as any)

    // First call: fail
    const mockFetchFail = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Server Error',
      json: async () => ({ error: 'server_error' }),
    })
    vi.stubGlobal('fetch', mockFetchFail)

    await expect(
      attemptTokenRefresh('cred-retry', 'google', 'enc-data', 'enc-key', mockPrisma)
    ).rejects.toThrow()

    // Second call: succeed (new fetch mock)
    const mockFetchOk = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'recovered-token' }),
    })
    vi.stubGlobal('fetch', mockFetchOk)

    const result = await attemptTokenRefresh(
      'cred-retry', 'google', 'enc-data', 'enc-key', mockPrisma
    )

    expect(result.accessToken).toBe('recovered-token')
    expect(mockFetchOk).toHaveBeenCalledTimes(1)
  })
})
