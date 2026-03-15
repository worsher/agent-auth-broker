import type { PrismaClient } from '@prisma/client'
import { encryptCredential, decryptCredential } from '@broker/crypto'
import { getConnector } from '@broker/connectors'
import type { DecryptedCredential } from '@broker/shared-types'

// 进程内去重：防止同一凭证的并发刷新风暴
const refreshInFlight = new Map<string, Promise<DecryptedCredential>>()

interface OAuth2TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

/**
 * 调用 OAuth2 Token Endpoint 刷新 access_token
 */
async function fetchNewTokens(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  authStyle: 'body' | 'basic' = 'body'
): Promise<OAuth2TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'User-Agent': 'agent-auth-broker/1.0',
  }

  if (authStyle === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  } else {
    body.set('client_id', clientId)
    body.set('client_secret', clientSecret)
  }

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  const json = (await res.json().catch(() => ({}))) as OAuth2TokenResponse
  if (!res.ok || json.error) {
    throw new Error(`Token refresh failed: ${json.error_description ?? json.error ?? res.statusText}`)
  }
  return json
}

/**
 * 尝试自动刷新过期的 OAuth2 凭证
 *
 * 流程：
 * 1. 从 connector 注册表获取 oauth2RefreshConfig
 * 2. 解密当前凭证，取出 refreshToken
 * 3. POST token endpoint 获取新 access_token
 * 4. 重新加密并写回数据库，恢复 ACTIVE 状态
 *
 * 去重机制：同一 credentialId 的并发调用共享同一个 Promise
 */
export async function attemptTokenRefresh(
  credentialId: string,
  connectorId: string,
  currentEncryptedData: string,
  currentEncryptionKeyId: string,
  prisma: PrismaClient
): Promise<DecryptedCredential> {
  // 去重：如果同一凭证正在刷新中，直接等待
  const existing = refreshInFlight.get(credentialId)
  if (existing) return existing

  const promise = (async (): Promise<DecryptedCredential> => {
    // 1. 获取 connector 的 OAuth2 刷新配置
    const connector = getConnector(connectorId)
    if (!connector?.oauth2RefreshConfig) {
      throw new Error(`Connector "${connectorId}" does not support OAuth2 token refresh`)
    }
    const { tokenEndpoint, clientIdEnvVar, clientSecretEnvVar, authStyle } =
      connector.oauth2RefreshConfig

    const clientId = process.env[clientIdEnvVar]
    const clientSecret = process.env[clientSecretEnvVar]
    if (!clientId || !clientSecret) {
      throw new Error(
        `OAuth2 client credentials not configured: set ${clientIdEnvVar} and ${clientSecretEnvVar}`
      )
    }

    // 2. 解密当前凭证，取出 refreshToken
    const currentData = decryptCredential({
      encryptedData: currentEncryptedData,
      encryptionKeyId: currentEncryptionKeyId,
    }) as Record<string, unknown>

    const refreshToken = currentData.refreshToken as string | undefined
    if (!refreshToken) {
      throw new Error(`Credential "${credentialId}" has no refresh token`)
    }

    // 3. 调用 token endpoint
    const tokenResponse = await fetchNewTokens(
      tokenEndpoint,
      clientId,
      clientSecret,
      refreshToken,
      authStyle
    )

    // 4. 构造更新后的凭证数据，保留 extraData 等原始字段
    const updatedData: Record<string, unknown> = {
      ...currentData,
      accessToken: tokenResponse.access_token,
      // 部分提供商会轮换 refresh_token；未返回新的则保留旧的
      refreshToken: tokenResponse.refresh_token ?? refreshToken,
    }
    if (tokenResponse.token_type) updatedData.tokenType = tokenResponse.token_type
    if (tokenResponse.scope) updatedData.scope = tokenResponse.scope

    // 5. 用新的 DEK 重新加密
    const { encryptedData, encryptionKeyId } = encryptCredential(updatedData)

    // 6. 计算新的过期时间
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null

    // 7. 原子写回数据库，恢复 ACTIVE 状态
    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        encryptedData,
        encryptionKeyId,
        status: 'ACTIVE',
        ...(expiresAt ? { expiresAt } : {}),
      },
    })

    return updatedData as unknown as DecryptedCredential
  })().finally(() => {
    refreshInFlight.delete(credentialId)
  })

  refreshInFlight.set(credentialId, promise)
  return promise
}
