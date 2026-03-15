import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

function getTelegramApi(token: string): string {
  return `https://api.telegram.org/bot${token}`
}

async function telegramRequest(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${getTelegramApi(token)}/${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  const tg = json as { ok?: boolean; result?: unknown }
  return { ok: tg.ok === true, status: res.status, data: tg.ok ? tg.result : json }
}

function ok(data: unknown, status?: number): ConnectorResult {
  return { success: true, data, httpStatus: status }
}

function fail(message: string, code: string, status?: number): ConnectorResult {
  return { success: false, error: { code, message }, httpStatus: status }
}

export const telegramConnector: ConnectorAdapter = {
  info: {
    id: 'telegram',
    name: 'Telegram',
    description: 'Telegram Bot API: messages, chats, and files',
    authType: 'api_key',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'get_me', name: 'Get Bot Info', description: 'Get information about the bot', inputSchema: { type: 'object', properties: {} } },
      { id: 'send_message', name: 'Send Message', description: 'Send a text message', inputSchema: { type: 'object', required: ['chat_id', 'text'], properties: { chat_id: { type: 'string', description: 'Chat ID or @channel_username' }, text: { type: 'string' }, parse_mode: { type: 'string', enum: ['Markdown', 'MarkdownV2', 'HTML'] }, reply_to_message_id: { type: 'number' }, disable_notification: { type: 'boolean' } } } },
      { id: 'edit_message', name: 'Edit Message', description: 'Edit a sent message', inputSchema: { type: 'object', required: ['chat_id', 'message_id', 'text'], properties: { chat_id: { type: 'string' }, message_id: { type: 'number' }, text: { type: 'string' }, parse_mode: { type: 'string', enum: ['Markdown', 'MarkdownV2', 'HTML'] } } } },
      { id: 'delete_message', name: 'Delete Message', description: 'Delete a message', inputSchema: { type: 'object', required: ['chat_id', 'message_id'], properties: { chat_id: { type: 'string' }, message_id: { type: 'number' } } } },
      { id: 'get_chat', name: 'Get Chat', description: 'Get chat information', inputSchema: { type: 'object', required: ['chat_id'], properties: { chat_id: { type: 'string' } } } },
      { id: 'get_chat_members_count', name: 'Get Members Count', description: 'Get number of members in a chat', inputSchema: { type: 'object', required: ['chat_id'], properties: { chat_id: { type: 'string' } } } },
      { id: 'send_document', name: 'Send Document', description: 'Send a document by URL', inputSchema: { type: 'object', required: ['chat_id', 'document'], properties: { chat_id: { type: 'string' }, document: { type: 'string', description: 'File URL or file_id' }, caption: { type: 'string' } } } },
      { id: 'get_file', name: 'Get File', description: 'Get file info and download link', inputSchema: { type: 'object', required: ['file_id'], properties: { file_id: { type: 'string' } } } },
      { id: 'pin_message', name: 'Pin Message', description: 'Pin a message in a chat', inputSchema: { type: 'object', required: ['chat_id', 'message_id'], properties: { chat_id: { type: 'string' }, message_id: { type: 'number' }, disable_notification: { type: 'boolean' } } } },
      { id: 'get_updates', name: 'Get Updates', description: 'Get recent bot updates (messages received)', inputSchema: { type: 'object', properties: { offset: { type: 'number' }, limit: { type: 'number' }, timeout: { type: 'number' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'get_me': {
        const r = await telegramRequest('GET', 'getMe', token)
        return r.ok ? ok(r.data, r.status) : fail('Failed to get bot info', 'TELEGRAM_ERROR', r.status)
      }

      case 'send_message': {
        const body: Record<string, unknown> = { chat_id: params.chat_id, text: params.text }
        if (params.parse_mode) body.parse_mode = params.parse_mode
        if (params.reply_to_message_id) body.reply_to_message_id = params.reply_to_message_id
        if (params.disable_notification) body.disable_notification = params.disable_notification
        const r = await telegramRequest('POST', 'sendMessage', token, body)
        return r.ok ? ok(r.data, r.status) : fail('Failed to send message', 'TELEGRAM_ERROR', r.status)
      }

      case 'edit_message': {
        const body: Record<string, unknown> = {
          chat_id: params.chat_id,
          message_id: params.message_id,
          text: params.text,
        }
        if (params.parse_mode) body.parse_mode = params.parse_mode
        const r = await telegramRequest('POST', 'editMessageText', token, body)
        return r.ok ? ok(r.data, r.status) : fail('Failed to edit message', 'TELEGRAM_ERROR', r.status)
      }

      case 'delete_message': {
        const r = await telegramRequest('POST', 'deleteMessage', token, {
          chat_id: params.chat_id,
          message_id: params.message_id,
        })
        return r.ok ? ok(r.data, r.status) : fail('Failed to delete message', 'TELEGRAM_ERROR', r.status)
      }

      case 'get_chat': {
        const r = await telegramRequest('POST', 'getChat', token, { chat_id: params.chat_id })
        return r.ok ? ok(r.data, r.status) : fail('Chat not found', 'NOT_FOUND', r.status)
      }

      case 'get_chat_members_count': {
        const r = await telegramRequest('POST', 'getChatMemberCount', token, { chat_id: params.chat_id })
        return r.ok ? ok(r.data, r.status) : fail('Failed to get members count', 'TELEGRAM_ERROR', r.status)
      }

      case 'send_document': {
        const body: Record<string, unknown> = { chat_id: params.chat_id, document: params.document }
        if (params.caption) body.caption = params.caption
        const r = await telegramRequest('POST', 'sendDocument', token, body)
        return r.ok ? ok(r.data, r.status) : fail('Failed to send document', 'TELEGRAM_ERROR', r.status)
      }

      case 'get_file': {
        const r = await telegramRequest('POST', 'getFile', token, { file_id: params.file_id })
        return r.ok ? ok(r.data, r.status) : fail('File not found', 'NOT_FOUND', r.status)
      }

      case 'pin_message': {
        const body: Record<string, unknown> = { chat_id: params.chat_id, message_id: params.message_id }
        if (params.disable_notification) body.disable_notification = params.disable_notification
        const r = await telegramRequest('POST', 'pinChatMessage', token, body)
        return r.ok ? ok(r.data, r.status) : fail('Failed to pin message', 'TELEGRAM_ERROR', r.status)
      }

      case 'get_updates': {
        const body: Record<string, unknown> = {}
        if (params.offset !== undefined) body.offset = params.offset
        if (params.limit) body.limit = params.limit
        if (params.timeout) body.timeout = params.timeout
        const r = await telegramRequest('POST', 'getUpdates', token, body)
        return r.ok ? ok(r.data, r.status) : fail('Failed to get updates', 'TELEGRAM_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
