import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const LINEAR_API = 'https://api.linear.app/graphql'

async function linearGraphQL(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ status: number; data: unknown; errors?: unknown[] }> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'User-Agent': 'agent-auth-broker/1.0',
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json().catch(() => ({}))
  const gql = body as { data?: unknown; errors?: unknown[] }
  return { status: res.status, data: gql.data, errors: gql.errors }
}

function ok(data: unknown, status?: number): ConnectorResult {
  return { success: true, data, httpStatus: status }
}

function fail(message: string, code: string, status?: number): ConnectorResult {
  return { success: false, error: { code, message }, httpStatus: status }
}

function gqlResult(r: { status: number; data: unknown; errors?: unknown[] }): ConnectorResult {
  if (r.errors && (r.errors as unknown[]).length > 0) {
    const msg = ((r.errors as Array<{ message?: string }>)[0])?.message ?? 'GraphQL error'
    return fail(msg, 'LINEAR_ERROR', r.status)
  }
  return ok(r.data, r.status)
}

export const linearConnector: ConnectorAdapter = {
  info: {
    id: 'linear',
    name: 'Linear',
    description: 'Linear project management: issues, projects, teams, and cycles',
    authType: 'api_key',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'list_issues', name: 'List Issues', description: 'List issues with optional filters', inputSchema: { type: 'object', properties: { first: { type: 'number' }, teamId: { type: 'string' }, stateId: { type: 'string' }, assigneeId: { type: 'string' }, after: { type: 'string', description: 'Cursor for pagination' } } } },
      { id: 'get_issue', name: 'Get Issue', description: 'Get issue by identifier (e.g. ENG-123)', inputSchema: { type: 'object', required: ['issueId'], properties: { issueId: { type: 'string', description: 'Issue ID or identifier' } } } },
      { id: 'create_issue', name: 'Create Issue', description: 'Create a new issue', inputSchema: { type: 'object', required: ['teamId', 'title'], properties: { teamId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' }, assigneeId: { type: 'string' }, stateId: { type: 'string' }, labelIds: { type: 'array', items: { type: 'string' } }, projectId: { type: 'string' } } } },
      { id: 'update_issue', name: 'Update Issue', description: 'Update an existing issue', inputSchema: { type: 'object', required: ['issueId'], properties: { issueId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number' }, stateId: { type: 'string' }, assigneeId: { type: 'string' }, labelIds: { type: 'array', items: { type: 'string' } } } } },
      { id: 'add_comment', name: 'Add Comment', description: 'Add a comment to an issue', inputSchema: { type: 'object', required: ['issueId', 'body'], properties: { issueId: { type: 'string' }, body: { type: 'string', description: 'Markdown content' } } } },
      { id: 'list_teams', name: 'List Teams', description: 'List all teams in workspace', inputSchema: { type: 'object', properties: { first: { type: 'number' } } } },
      { id: 'list_projects', name: 'List Projects', description: 'List all projects', inputSchema: { type: 'object', properties: { first: { type: 'number' }, after: { type: 'string' } } } },
      { id: 'get_project', name: 'Get Project', description: 'Get project details by ID', inputSchema: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string' } } } },
      { id: 'list_cycles', name: 'List Cycles', description: 'List cycles for a team', inputSchema: { type: 'object', required: ['teamId'], properties: { teamId: { type: 'string' }, first: { type: 'number' } } } },
      { id: 'search_issues', name: 'Search Issues', description: 'Search issues by text query', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, first: { type: 'number' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'list_issues': {
        const { first = 50, teamId, stateId, assigneeId, after } = params
        const filters: string[] = []
        if (teamId) filters.push(`team: { id: { eq: "${teamId}" } }`)
        if (stateId) filters.push(`state: { id: { eq: "${stateId}" } }`)
        if (assigneeId) filters.push(`assignee: { id: { eq: "${assigneeId}" } }`)
        const filterStr = filters.length > 0 ? `, filter: { ${filters.join(', ')} }` : ''
        const afterStr = after ? `, after: "${after}"` : ''
        const r = await linearGraphQL(token, `query { issues(first: ${first}${afterStr}${filterStr}) { nodes { id identifier title state { name } assignee { name } priority createdAt updatedAt } pageInfo { hasNextPage endCursor } } }`)
        return gqlResult(r)
      }

      case 'get_issue': {
        const r = await linearGraphQL(token, `query($id: String!) { issue(id: $id) { id identifier title description state { name } assignee { name email } priority labels { nodes { name } } project { name } createdAt updatedAt } }`, { id: params.issueId })
        return gqlResult(r)
      }

      case 'create_issue': {
        const { teamId, title, description, priority, assigneeId, stateId, labelIds, projectId } = params
        const input: Record<string, unknown> = { teamId, title }
        if (description) input.description = description
        if (priority !== undefined) input.priority = priority
        if (assigneeId) input.assigneeId = assigneeId
        if (stateId) input.stateId = stateId
        if (labelIds) input.labelIds = labelIds
        if (projectId) input.projectId = projectId
        const r = await linearGraphQL(token, `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`, { input })
        return gqlResult(r)
      }

      case 'update_issue': {
        const { issueId, ...updates } = params
        const r = await linearGraphQL(token, `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title state { name } } } }`, { id: issueId, input: updates })
        return gqlResult(r)
      }

      case 'add_comment': {
        const r = await linearGraphQL(token, `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body createdAt } } }`, { input: { issueId: params.issueId, body: params.body } })
        return gqlResult(r)
      }

      case 'list_teams': {
        const { first = 50 } = params
        const r = await linearGraphQL(token, `query { teams(first: ${first}) { nodes { id name key description } } }`)
        return gqlResult(r)
      }

      case 'list_projects': {
        const { first = 50, after } = params
        const afterStr = after ? `, after: "${after}"` : ''
        const r = await linearGraphQL(token, `query { projects(first: ${first}${afterStr}) { nodes { id name state startDate targetDate } pageInfo { hasNextPage endCursor } } }`)
        return gqlResult(r)
      }

      case 'get_project': {
        const r = await linearGraphQL(token, `query($id: String!) { project(id: $id) { id name description state startDate targetDate teams { nodes { name } } issues { nodes { id identifier title } } } }`, { id: params.projectId })
        return gqlResult(r)
      }

      case 'list_cycles': {
        const { teamId, first = 10 } = params
        const r = await linearGraphQL(token, `query($teamId: String!) { team(id: $teamId) { cycles(first: ${first}) { nodes { id number name startsAt endsAt } } } }`, { teamId })
        return gqlResult(r)
      }

      case 'search_issues': {
        const { query, first = 20 } = params
        const r = await linearGraphQL(token, `query($query: String!, $first: Int) { searchIssues(query: $query, first: $first) { nodes { id identifier title state { name } assignee { name } } } }`, { query, first })
        return gqlResult(r)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
