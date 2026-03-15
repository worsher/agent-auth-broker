import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const FEISHU_API = 'https://open.feishu.cn/open-apis'

async function feishuRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; code: number; data: unknown }> {
  const res = await fetch(`${FEISHU_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  const fs = json as { code?: number; data?: unknown; msg?: string }
  return { status: res.status, code: fs.code ?? -1, data: fs.code === 0 ? fs.data : json }
}

function ok(data: unknown, status?: number): ConnectorResult {
  return { success: true, data, httpStatus: status }
}

function fail(message: string, code: string, status?: number): ConnectorResult {
  return { success: false, error: { code, message }, httpStatus: status }
}

export const feishuConnector: ConnectorAdapter = {
  info: {
    id: 'feishu',
    name: 'Feishu',
    description: 'Feishu (Lark) messages, chats, docs, and calendar',
    authType: 'api_key',
  },

  getActions(): ConnectorAction[] {
    return [
      // Messages
      { id: 'send_message', name: 'Send Message', description: 'Send a message to a chat', inputSchema: { type: 'object', required: ['receive_id_type', 'receive_id', 'msg_type', 'content'], properties: { receive_id_type: { type: 'string', enum: ['open_id', 'user_id', 'union_id', 'email', 'chat_id'], description: 'ID type of the receiver' }, receive_id: { type: 'string' }, msg_type: { type: 'string', enum: ['text', 'post', 'interactive', 'image', 'file'], description: 'Message type' }, content: { type: 'string', description: 'JSON string of message content' } } } },
      { id: 'get_message', name: 'Get Message', description: 'Get a message by ID', inputSchema: { type: 'object', required: ['message_id'], properties: { message_id: { type: 'string' } } } },
      { id: 'reply_message', name: 'Reply Message', description: 'Reply to a message', inputSchema: { type: 'object', required: ['message_id', 'msg_type', 'content'], properties: { message_id: { type: 'string' }, msg_type: { type: 'string', enum: ['text', 'post', 'interactive'] }, content: { type: 'string' } } } },

      // Chats
      { id: 'list_chats', name: 'List Chats', description: 'List chats the bot is in', inputSchema: { type: 'object', properties: { page_size: { type: 'number' }, page_token: { type: 'string' } } } },
      { id: 'get_chat', name: 'Get Chat', description: 'Get chat details', inputSchema: { type: 'object', required: ['chat_id'], properties: { chat_id: { type: 'string' } } } },

      // Docs
      { id: 'search_docs', name: 'Search Docs', description: 'Search documents in workspace', inputSchema: { type: 'object', required: ['search_key'], properties: { search_key: { type: 'string' }, count: { type: 'number' }, offset: { type: 'number' }, docs_types: { type: 'array', items: { type: 'string' }, description: 'doc, sheet, bitable, mindnote, wiki, etc.' } } } },
      { id: 'get_doc_content', name: 'Get Doc Content', description: 'Get document raw content', inputSchema: { type: 'object', required: ['document_id'], properties: { document_id: { type: 'string' } } } },

      // Calendar
      { id: 'list_events', name: 'List Events', description: 'List calendar events', inputSchema: { type: 'object', properties: { calendar_id: { type: 'string', description: 'Default: primary' }, start_time: { type: 'string', description: 'Unix timestamp' }, end_time: { type: 'string' }, page_size: { type: 'number' }, page_token: { type: 'string' } } } },
      { id: 'create_event', name: 'Create Event', description: 'Create a calendar event', inputSchema: { type: 'object', required: ['summary', 'start_time', 'end_time'], properties: { calendar_id: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' }, start_time: { type: 'object', description: '{ timestamp: "unix_ts" }' }, end_time: { type: 'object', description: '{ timestamp: "unix_ts" }' }, attendees: { type: 'array', items: { type: 'object' } } } } },

      // Users
      { id: 'get_user', name: 'Get User', description: 'Get user info by ID', inputSchema: { type: 'object', required: ['user_id_type', 'user_id'], properties: { user_id_type: { type: 'string', enum: ['open_id', 'union_id', 'user_id'] }, user_id: { type: 'string' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      // --- Messages ---
      case 'send_message': {
        const { receive_id_type, receive_id, msg_type, content } = params
        const r = await feishuRequest('POST', `/im/v1/messages?receive_id_type=${receive_id_type}`, token, {
          receive_id,
          msg_type,
          content,
        })
        return r.code === 0 ? ok(r.data, r.status) : fail('Failed to send message', 'FEISHU_ERROR', r.status)
      }

      case 'get_message': {
        const r = await feishuRequest('GET', `/im/v1/messages/${params.message_id}`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('Message not found', 'NOT_FOUND', r.status)
      }

      case 'reply_message': {
        const r = await feishuRequest('POST', `/im/v1/messages/${params.message_id}/reply`, token, {
          msg_type: params.msg_type,
          content: params.content,
        })
        return r.code === 0 ? ok(r.data, r.status) : fail('Failed to reply message', 'FEISHU_ERROR', r.status)
      }

      // --- Chats ---
      case 'list_chats': {
        const qs = new URLSearchParams()
        if (params.page_size) qs.set('page_size', String(params.page_size))
        if (params.page_token) qs.set('page_token', String(params.page_token))
        const query = qs.toString() ? `?${qs}` : ''
        const r = await feishuRequest('GET', `/im/v1/chats${query}`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('Failed to list chats', 'FEISHU_ERROR', r.status)
      }

      case 'get_chat': {
        const r = await feishuRequest('GET', `/im/v1/chats/${params.chat_id}`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('Chat not found', 'NOT_FOUND', r.status)
      }

      // --- Docs ---
      case 'search_docs': {
        const body: Record<string, unknown> = { search_key: params.search_key }
        if (params.count) body.count = params.count
        if (params.offset) body.offset = params.offset
        if (params.docs_types) body.docs_types = params.docs_types
        const r = await feishuRequest('POST', '/suite/docs-api/search/object', token, body)
        return r.code === 0 ? ok(r.data, r.status) : fail('Search failed', 'FEISHU_ERROR', r.status)
      }

      case 'get_doc_content': {
        const r = await feishuRequest('GET', `/docx/v1/documents/${params.document_id}/raw_content`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('Document not found', 'NOT_FOUND', r.status)
      }

      // --- Calendar ---
      case 'list_events': {
        const calendarId = params.calendar_id ?? 'primary'
        const qs = new URLSearchParams()
        if (params.start_time) qs.set('start_time', String(params.start_time))
        if (params.end_time) qs.set('end_time', String(params.end_time))
        if (params.page_size) qs.set('page_size', String(params.page_size))
        if (params.page_token) qs.set('page_token', String(params.page_token))
        const query = qs.toString() ? `?${qs}` : ''
        const r = await feishuRequest('GET', `/calendar/v4/calendars/${calendarId}/events${query}`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('Failed to list events', 'FEISHU_ERROR', r.status)
      }

      case 'create_event': {
        const calendarId = params.calendar_id ?? 'primary'
        const body: Record<string, unknown> = {
          summary: params.summary,
          start_time: params.start_time,
          end_time: params.end_time,
        }
        if (params.description) body.description = params.description
        if (params.attendees) body.attendees = params.attendees
        const r = await feishuRequest('POST', `/calendar/v4/calendars/${calendarId}/events`, token, body)
        return r.code === 0 ? ok(r.data, r.status) : fail('Failed to create event', 'FEISHU_ERROR', r.status)
      }

      // --- Users ---
      case 'get_user': {
        const { user_id_type, user_id } = params
        const r = await feishuRequest('GET', `/contact/v3/users/${user_id}?user_id_type=${user_id_type}`, token)
        return r.code === 0 ? ok(r.data, r.status) : fail('User not found', 'NOT_FOUND', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
