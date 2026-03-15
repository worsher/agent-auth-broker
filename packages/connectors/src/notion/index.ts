import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function notionRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
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

export const notionConnector: ConnectorAdapter = {
  oauth2RefreshConfig: {
    tokenEndpoint: 'https://api.notion.com/v1/oauth/token',
    clientIdEnvVar: 'NOTION_CLIENT_ID',
    clientSecretEnvVar: 'NOTION_CLIENT_SECRET',
    authStyle: 'basic',
  },
  info: {
    id: 'notion',
    name: 'Notion',
    description: 'Notion pages, databases, and blocks',
    authType: 'oauth2',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'search', name: 'Search', description: 'Search pages and databases', inputSchema: { type: 'object', properties: { query: { type: 'string' }, filter: { type: 'object', description: '{ value: "page" | "database" }' }, page_size: { type: 'number' }, start_cursor: { type: 'string' } } } },
      { id: 'get_page', name: 'Get Page', description: 'Retrieve a page by ID', inputSchema: { type: 'object', required: ['page_id'], properties: { page_id: { type: 'string' } } } },
      { id: 'create_page', name: 'Create Page', description: 'Create a new page in a parent page or database', inputSchema: { type: 'object', required: ['parent', 'properties'], properties: { parent: { type: 'object', description: '{ database_id: string } or { page_id: string }' }, properties: { type: 'object', description: 'Page properties' }, children: { type: 'array', description: 'Block content' } } } },
      { id: 'update_page', name: 'Update Page', description: 'Update page properties', inputSchema: { type: 'object', required: ['page_id', 'properties'], properties: { page_id: { type: 'string' }, properties: { type: 'object' }, archived: { type: 'boolean' } } } },
      { id: 'get_database', name: 'Get Database', description: 'Retrieve a database by ID', inputSchema: { type: 'object', required: ['database_id'], properties: { database_id: { type: 'string' } } } },
      { id: 'query_database', name: 'Query Database', description: 'Query a database with filters and sorts', inputSchema: { type: 'object', required: ['database_id'], properties: { database_id: { type: 'string' }, filter: { type: 'object' }, sorts: { type: 'array' }, page_size: { type: 'number' }, start_cursor: { type: 'string' } } } },
      { id: 'get_block', name: 'Get Block', description: 'Retrieve a block by ID', inputSchema: { type: 'object', required: ['block_id'], properties: { block_id: { type: 'string' } } } },
      { id: 'get_block_children', name: 'Get Block Children', description: 'Retrieve children blocks of a block', inputSchema: { type: 'object', required: ['block_id'], properties: { block_id: { type: 'string' }, page_size: { type: 'number' }, start_cursor: { type: 'string' } } } },
      { id: 'append_block_children', name: 'Append Block Children', description: 'Append content blocks to a parent block', inputSchema: { type: 'object', required: ['block_id', 'children'], properties: { block_id: { type: 'string' }, children: { type: 'array', description: 'Array of block objects to append' } } } },
      { id: 'delete_block', name: 'Delete Block', description: 'Archive (delete) a block', inputSchema: { type: 'object', required: ['block_id'], properties: { block_id: { type: 'string' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'search': {
        const body: Record<string, unknown> = {}
        if (params.query) body.query = params.query
        if (params.filter) body.filter = params.filter
        if (params.page_size) body.page_size = params.page_size
        if (params.start_cursor) body.start_cursor = params.start_cursor
        const r = await notionRequest('POST', '/search', token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Search failed', 'NOTION_ERROR', r.status)
      }

      case 'get_page': {
        const r = await notionRequest('GET', `/pages/${params.page_id}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Page not found', 'NOT_FOUND', r.status)
      }

      case 'create_page': {
        const body: Record<string, unknown> = {
          parent: params.parent,
          properties: params.properties,
        }
        if (params.children) body.children = params.children
        const r = await notionRequest('POST', '/pages', token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to create page', 'NOTION_ERROR', r.status)
      }

      case 'update_page': {
        const { page_id, ...body } = params
        const r = await notionRequest('PATCH', `/pages/${page_id}`, token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to update page', 'NOTION_ERROR', r.status)
      }

      case 'get_database': {
        const r = await notionRequest('GET', `/databases/${params.database_id}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Database not found', 'NOT_FOUND', r.status)
      }

      case 'query_database': {
        const { database_id, ...body } = params
        const r = await notionRequest('POST', `/databases/${database_id}/query`, token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Query failed', 'NOTION_ERROR', r.status)
      }

      case 'get_block': {
        const r = await notionRequest('GET', `/blocks/${params.block_id}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Block not found', 'NOT_FOUND', r.status)
      }

      case 'get_block_children': {
        const { block_id, page_size, start_cursor } = params
        const qs = new URLSearchParams()
        if (page_size) qs.set('page_size', String(page_size))
        if (start_cursor) qs.set('start_cursor', String(start_cursor))
        const query = qs.toString() ? `?${qs}` : ''
        const r = await notionRequest('GET', `/blocks/${block_id}/children${query}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to get children', 'NOTION_ERROR', r.status)
      }

      case 'append_block_children': {
        const r = await notionRequest('PATCH', `/blocks/${params.block_id}/children`, token, {
          children: params.children,
        })
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to append blocks', 'NOTION_ERROR', r.status)
      }

      case 'delete_block': {
        const r = await notionRequest('DELETE', `/blocks/${params.block_id}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to delete block', 'NOTION_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
