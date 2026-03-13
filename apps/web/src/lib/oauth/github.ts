import { storeCredential } from '../vault/index'

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'

const DEFAULT_SCOPES = ['repo', 'read:user', 'user:email']

export function getGitHubClientId(): string {
  const id = process.env.GITHUB_OAUTH_CLIENT_ID
  if (!id) throw new Error('GITHUB_OAUTH_CLIENT_ID is not set')
  return id
}

function getGitHubClientSecret(): string {
  const secret = process.env.GITHUB_OAUTH_CLIENT_SECRET
  if (!secret) throw new Error('GITHUB_OAUTH_CLIENT_SECRET is not set')
  return secret
}

function getCallbackUrl(): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3100'
  return `${base}/api/oauth/github/callback`
}

/**
 * 生成 GitHub OAuth 授权 URL
 */
export function buildAuthorizationUrl(state: string, scopes = DEFAULT_SCOPES): string {
  const params = new URLSearchParams({
    client_id: getGitHubClientId(),
    redirect_uri: getCallbackUrl(),
    scope: scopes.join(' '),
    state,
  })
  return `${GITHUB_OAUTH_URL}?${params.toString()}`
}

/**
 * 用 code 换取 access_token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string
  token_type: string
  scope: string
}> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: getGitHubClientId(),
      client_secret: getGitHubClientSecret(),
      code,
      redirect_uri: getCallbackUrl(),
    }),
  })

  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`)

  const data = await res.json() as { access_token?: string; token_type?: string; scope?: string; error?: string }
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token error: ${data.error || 'no access_token'}`)
  }

  return data as { access_token: string; token_type: string; scope: string }
}

/**
 * 获取 GitHub 用户信息
 */
export async function getGitHubUser(accessToken: string): Promise<{ login: string; name: string | null }> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'agent-auth-broker/1.0',
    },
  })
  if (!res.ok) throw new Error(`Failed to get GitHub user: ${res.status}`)
  return res.json() as Promise<{ login: string; name: string | null }>
}

/**
 * 完成 GitHub OAuth 授权，存储凭证
 */
export async function completeGitHubOAuth(
  ownerId: string,
  code: string
): Promise<{ credentialId: string; githubLogin: string }> {
  const tokenData = await exchangeCodeForToken(code)
  const githubUser = await getGitHubUser(tokenData.access_token)
  const scopes = tokenData.scope.split(',').map(s => s.trim())

  const credential = await storeCredential(
    ownerId,
    'github',
    `GitHub - ${githubUser.login}`,
    {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      extraData: { githubLogin: githubUser.login },
    },
    scopes
  )

  return { credentialId: credential.id, githubLogin: githubUser.login }
}
