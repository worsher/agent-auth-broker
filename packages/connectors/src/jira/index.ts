import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

function getBaseUrl(credential: DecryptedCredential): string {
  const domain = credential.extraData?.domain as string | undefined
  if (!domain) throw new Error('Jira domain (extraData.domain) is required, e.g. "your-company.atlassian.net"')
  return `https://${domain}/rest/api/3`
}

async function jiraRequest(
  method: string,
  path: string,
  credential: DecryptedCredential,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const baseUrl = getBaseUrl(credential)
  const email = credential.extraData?.email as string | undefined
  const token = credential.accessToken

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'agent-auth-broker/1.0',
  }

  // Jira Cloud supports both OAuth2 Bearer tokens and Basic auth (email + API token)
  if (email) {
    headers.Authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
  } else {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
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

export const jiraConnector: ConnectorAdapter = {
  info: {
    id: 'jira',
    name: 'Jira',
    description: 'Jira Cloud projects, issues, and workflows',
    authType: 'api_key',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'list_projects', name: 'List Projects', description: 'List all accessible projects', inputSchema: { type: 'object', properties: { maxResults: { type: 'number' }, startAt: { type: 'number' } } } },
      { id: 'get_project', name: 'Get Project', description: 'Get project details', inputSchema: { type: 'object', required: ['projectKey'], properties: { projectKey: { type: 'string' } } } },
      { id: 'search_issues', name: 'Search Issues', description: 'Search issues using JQL', inputSchema: { type: 'object', required: ['jql'], properties: { jql: { type: 'string', description: 'JQL query string' }, maxResults: { type: 'number' }, startAt: { type: 'number' }, fields: { type: 'array', items: { type: 'string' }, description: 'Fields to return' } } } },
      { id: 'get_issue', name: 'Get Issue', description: 'Get issue details by key', inputSchema: { type: 'object', required: ['issueKey'], properties: { issueKey: { type: 'string', description: 'e.g. PROJ-123' }, fields: { type: 'array', items: { type: 'string' } } } } },
      { id: 'create_issue', name: 'Create Issue', description: 'Create a new issue', inputSchema: { type: 'object', required: ['projectKey', 'summary', 'issueType'], properties: { projectKey: { type: 'string' }, summary: { type: 'string' }, issueType: { type: 'string', description: 'e.g. Bug, Task, Story' }, description: { type: 'string' }, priority: { type: 'string' }, assignee: { type: 'string', description: 'Account ID' }, labels: { type: 'array', items: { type: 'string' } } } } },
      { id: 'update_issue', name: 'Update Issue', description: 'Update issue fields', inputSchema: { type: 'object', required: ['issueKey', 'fields'], properties: { issueKey: { type: 'string' }, fields: { type: 'object', description: 'Fields to update' } } } },
      { id: 'add_comment', name: 'Add Comment', description: 'Add comment to an issue', inputSchema: { type: 'object', required: ['issueKey', 'body'], properties: { issueKey: { type: 'string' }, body: { type: 'string' } } } },
      { id: 'get_transitions', name: 'Get Transitions', description: 'Get available status transitions for an issue', inputSchema: { type: 'object', required: ['issueKey'], properties: { issueKey: { type: 'string' } } } },
      { id: 'transition_issue', name: 'Transition Issue', description: 'Move issue to a new status', inputSchema: { type: 'object', required: ['issueKey', 'transitionId'], properties: { issueKey: { type: 'string' }, transitionId: { type: 'string' } } } },
      { id: 'assign_issue', name: 'Assign Issue', description: 'Assign issue to a user', inputSchema: { type: 'object', required: ['issueKey', 'accountId'], properties: { issueKey: { type: 'string' }, accountId: { type: 'string', description: 'Atlassian account ID, or null to unassign' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    switch (action) {
      case 'list_projects': {
        const { maxResults = 50, startAt = 0 } = params
        const r = await jiraRequest('GET', `/project/search?maxResults=${maxResults}&startAt=${startAt}`, credential)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list projects', 'JIRA_ERROR', r.status)
      }

      case 'get_project': {
        const r = await jiraRequest('GET', `/project/${params.projectKey}`, credential)
        return r.status === 200 ? ok(r.data, r.status) : fail('Project not found', 'NOT_FOUND', r.status)
      }

      case 'search_issues': {
        const { jql, maxResults = 50, startAt = 0, fields } = params
        const body: Record<string, unknown> = { jql, maxResults, startAt }
        if (fields) body.fields = fields
        const r = await jiraRequest('POST', '/search', credential, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Search failed', 'JIRA_ERROR', r.status)
      }

      case 'get_issue': {
        const { issueKey, fields } = params
        const qs = fields ? `?fields=${(fields as string[]).join(',')}` : ''
        const r = await jiraRequest('GET', `/issue/${issueKey}${qs}`, credential)
        return r.status === 200 ? ok(r.data, r.status) : fail('Issue not found', 'NOT_FOUND', r.status)
      }

      case 'create_issue': {
        const { projectKey, summary, issueType, description, priority, assignee, labels } = params
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType },
        }
        if (description) {
          fields.description = {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          }
        }
        if (priority) fields.priority = { name: priority }
        if (assignee) fields.assignee = { accountId: assignee }
        if (labels) fields.labels = labels
        const r = await jiraRequest('POST', '/issue', credential, { fields })
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to create issue', 'JIRA_ERROR', r.status)
      }

      case 'update_issue': {
        const { issueKey, fields } = params
        const r = await jiraRequest('PUT', `/issue/${issueKey}`, credential, { fields })
        return r.status === 204 || r.status === 200
          ? ok({ success: true }, r.status)
          : fail('Failed to update issue', 'JIRA_ERROR', r.status)
      }

      case 'add_comment': {
        const { issueKey, body } = params
        const r = await jiraRequest('POST', `/issue/${issueKey}/comment`, credential, {
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
          },
        })
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to add comment', 'JIRA_ERROR', r.status)
      }

      case 'get_transitions': {
        const r = await jiraRequest('GET', `/issue/${params.issueKey}/transitions`, credential)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to get transitions', 'JIRA_ERROR', r.status)
      }

      case 'transition_issue': {
        const r = await jiraRequest('POST', `/issue/${params.issueKey}/transitions`, credential, {
          transition: { id: params.transitionId },
        })
        return r.status === 204 || r.status === 200
          ? ok({ success: true }, r.status)
          : fail('Failed to transition issue', 'JIRA_ERROR', r.status)
      }

      case 'assign_issue': {
        const r = await jiraRequest('PUT', `/issue/${params.issueKey}/assignee`, credential, {
          accountId: params.accountId,
        })
        return r.status === 204 || r.status === 200
          ? ok({ success: true }, r.status)
          : fail('Failed to assign issue', 'JIRA_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
