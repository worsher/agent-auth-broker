import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const GITHUB_API = 'https://api.github.com'

async function githubRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'agent-auth-broker/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

function ok(data: unknown, status?: number): ConnectorResult {
  return { success: true, data, httpStatus: status }
}

function fail(message: string, code: string, status?: number): ConnectorResult {
  return { success: false, error: { code, message }, httpStatus: status }
}

export const githubConnector: ConnectorAdapter = {
  oauth2RefreshConfig: {
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    clientIdEnvVar: 'GITHUB_CLIENT_ID',
    clientSecretEnvVar: 'GITHUB_CLIENT_SECRET',
  },
  info: {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub 仓库、Issue、PR 操作',
    authType: 'oauth2',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'list_repos', name: '列出仓库', description: '列出已授权用户的仓库', inputSchema: { type: 'object', properties: { per_page: { type: 'number' }, page: { type: 'number' } } } },
      { id: 'get_repo', name: '获取仓库', description: '获取仓库信息', inputSchema: { type: 'object', required: ['repo'], properties: { repo: { type: 'string', description: 'owner/repo' } } } },
      { id: 'list_issues', name: '列出 Issue', description: '列出仓库的 Issue', inputSchema: { type: 'object', required: ['repo'], properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, per_page: { type: 'number' } } } },
      { id: 'get_issue', name: '获取 Issue', description: '获取单个 Issue 详情', inputSchema: { type: 'object', required: ['repo', 'issue_number'], properties: { repo: { type: 'string' }, issue_number: { type: 'number' } } } },
      { id: 'create_issue', name: '创建 Issue', description: '在仓库中创建 Issue', inputSchema: { type: 'object', required: ['repo', 'title'], properties: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } } } },
      { id: 'comment_issue', name: '评论 Issue', description: '在 Issue 上添加评论', inputSchema: { type: 'object', required: ['repo', 'issue_number', 'body'], properties: { repo: { type: 'string' }, issue_number: { type: 'number' }, body: { type: 'string' } } } },
      { id: 'list_prs', name: '列出 PR', description: '列出仓库的 Pull Request', inputSchema: { type: 'object', required: ['repo'], properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, per_page: { type: 'number' } } } },
      { id: 'create_pr', name: '创建 PR', description: '创建 Pull Request', inputSchema: { type: 'object', required: ['repo', 'title', 'head', 'base'], properties: { repo: { type: 'string' }, title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' }, draft: { type: 'boolean' } } } },
      { id: 'get_file', name: '获取文件', description: '获取仓库中的文件内容', inputSchema: { type: 'object', required: ['repo', 'path'], properties: { repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string' } } } },
      { id: 'search_code', name: '搜索代码', description: '在 GitHub 上搜索代码', inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' }, per_page: { type: 'number' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'list_repos': {
        const { per_page = 30, page = 1 } = params
        const r = await githubRequest('GET', `/user/repos?per_page=${per_page}&page=${page}&sort=updated`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list repos', 'GITHUB_ERROR', r.status)
      }

      case 'get_repo': {
        const r = await githubRequest('GET', `/repos/${params.repo}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Repo not found', 'NOT_FOUND', r.status)
      }

      case 'list_issues': {
        const { repo, state = 'open', per_page = 30 } = params
        const r = await githubRequest('GET', `/repos/${repo}/issues?state=${state}&per_page=${per_page}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list issues', 'GITHUB_ERROR', r.status)
      }

      case 'get_issue': {
        const r = await githubRequest('GET', `/repos/${params.repo}/issues/${params.issue_number}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Issue not found', 'NOT_FOUND', r.status)
      }

      case 'create_issue': {
        const { repo, ...body } = params
        const r = await githubRequest('POST', `/repos/${repo}/issues`, token, body)
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to create issue', 'GITHUB_ERROR', r.status)
      }

      case 'comment_issue': {
        const { repo, issue_number, body } = params
        const r = await githubRequest('POST', `/repos/${repo}/issues/${issue_number}/comments`, token, { body })
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to add comment', 'GITHUB_ERROR', r.status)
      }

      case 'list_prs': {
        const { repo, state = 'open', per_page = 30 } = params
        const r = await githubRequest('GET', `/repos/${repo}/pulls?state=${state}&per_page=${per_page}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list PRs', 'GITHUB_ERROR', r.status)
      }

      case 'create_pr': {
        const { repo, ...body } = params
        const r = await githubRequest('POST', `/repos/${repo}/pulls`, token, body)
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to create PR', 'GITHUB_ERROR', r.status)
      }

      case 'get_file': {
        const { repo, path, ref } = params
        const query = ref ? `?ref=${ref}` : ''
        const r = await githubRequest('GET', `/repos/${repo}/contents/${path}${query}`, token)
        if (r.status === 200) {
          const file = r.data as { content?: string; encoding?: string; [k: string]: unknown }
          if (file.content && file.encoding === 'base64') {
            file.content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
          }
          return ok(file, r.status)
        }
        return fail('File not found', 'NOT_FOUND', r.status)
      }

      case 'search_code': {
        const { q, per_page = 10 } = params
        const r = await githubRequest('GET', `/search/code?q=${encodeURIComponent(q as string)}&per_page=${per_page}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Search failed', 'GITHUB_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
