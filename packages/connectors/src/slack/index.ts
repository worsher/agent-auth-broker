import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const SLACK_API = 'https://slack.com/api'

async function slackRequest(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<{ ok: boolean; data: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
  }

  const res = await fetch(`${SLACK_API}/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: (data as { ok?: boolean }).ok === true, data }
}

function ok(data: unknown): ConnectorResult {
  return { success: true, data, httpStatus: 200 }
}

function fail(message: string, code: string, status?: number): ConnectorResult {
  return { success: false, error: { code, message }, httpStatus: status }
}

export const slackConnector: ConnectorAdapter = {
  oauth2RefreshConfig: {
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
    clientIdEnvVar: 'SLACK_CLIENT_ID',
    clientSecretEnvVar: 'SLACK_CLIENT_SECRET',
  },
  info: {
    id: 'slack',
    name: 'Slack',
    description: 'Slack workspace channels, messages, and users',
    authType: 'oauth2',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'list_channels', name: 'List Channels', description: 'List public channels in workspace', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, cursor: { type: 'string' }, types: { type: 'string', description: 'Comma-separated: public_channel, private_channel' } } } },
      { id: 'get_channel', name: 'Get Channel', description: 'Get channel info', inputSchema: { type: 'object', required: ['channel'], properties: { channel: { type: 'string', description: 'Channel ID' } } } },
      { id: 'send_message', name: 'Send Message', description: 'Post a message to a channel', inputSchema: { type: 'object', required: ['channel', 'text'], properties: { channel: { type: 'string' }, text: { type: 'string' }, thread_ts: { type: 'string', description: 'Thread timestamp for replies' } } } },
      { id: 'get_messages', name: 'Get Messages', description: 'Retrieve messages from a channel', inputSchema: { type: 'object', required: ['channel'], properties: { channel: { type: 'string' }, limit: { type: 'number' }, oldest: { type: 'string' }, latest: { type: 'string' } } } },
      { id: 'get_thread', name: 'Get Thread', description: 'Retrieve replies in a thread', inputSchema: { type: 'object', required: ['channel', 'ts'], properties: { channel: { type: 'string' }, ts: { type: 'string', description: 'Thread parent timestamp' }, limit: { type: 'number' } } } },
      { id: 'add_reaction', name: 'Add Reaction', description: 'Add emoji reaction to a message', inputSchema: { type: 'object', required: ['channel', 'timestamp', 'name'], properties: { channel: { type: 'string' }, timestamp: { type: 'string' }, name: { type: 'string', description: 'Emoji name without colons' } } } },
      { id: 'list_users', name: 'List Users', description: 'List workspace members', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, cursor: { type: 'string' } } } },
      { id: 'get_user', name: 'Get User', description: 'Get user profile info', inputSchema: { type: 'object', required: ['user'], properties: { user: { type: 'string', description: 'User ID' } } } },
      { id: 'set_topic', name: 'Set Topic', description: 'Set channel topic', inputSchema: { type: 'object', required: ['channel', 'topic'], properties: { channel: { type: 'string' }, topic: { type: 'string' } } } },
      { id: 'upload_file', name: 'Upload File', description: 'Upload text content as a file snippet', inputSchema: { type: 'object', required: ['channels', 'content'], properties: { channels: { type: 'string', description: 'Comma-separated channel IDs' }, content: { type: 'string' }, title: { type: 'string' }, filetype: { type: 'string' } } } },
      { id: 'search_messages', name: 'Search Messages', description: 'Search for messages', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, count: { type: 'number' }, sort: { type: 'string', enum: ['score', 'timestamp'] } } } },
      { id: 'update_message', name: 'Update Message', description: 'Update an existing message', inputSchema: { type: 'object', required: ['channel', 'ts', 'text'], properties: { channel: { type: 'string' }, ts: { type: 'string' }, text: { type: 'string' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'list_channels': {
        const { limit = 100, cursor, types = 'public_channel' } = params
        const qs = new URLSearchParams({ limit: String(limit), types: String(types) })
        if (cursor) qs.set('cursor', String(cursor))
        const r = await slackRequest('GET', `conversations.list?${qs}`, token)
        return r.ok ? ok(r.data) : fail('Failed to list channels', 'SLACK_ERROR')
      }

      case 'get_channel': {
        const r = await slackRequest('GET', `conversations.info?channel=${params.channel}`, token)
        return r.ok ? ok(r.data) : fail('Channel not found', 'NOT_FOUND')
      }

      case 'send_message': {
        const { channel, text, thread_ts } = params
        const body: Record<string, unknown> = { channel, text }
        if (thread_ts) body.thread_ts = thread_ts
        const r = await slackRequest('POST', 'chat.postMessage', token, body)
        return r.ok ? ok(r.data) : fail('Failed to send message', 'SLACK_ERROR')
      }

      case 'get_messages': {
        const { channel, limit = 20, oldest, latest } = params
        const qs = new URLSearchParams({ channel: String(channel), limit: String(limit) })
        if (oldest) qs.set('oldest', String(oldest))
        if (latest) qs.set('latest', String(latest))
        const r = await slackRequest('GET', `conversations.history?${qs}`, token)
        return r.ok ? ok(r.data) : fail('Failed to get messages', 'SLACK_ERROR')
      }

      case 'get_thread': {
        const { channel, ts, limit = 20 } = params
        const qs = new URLSearchParams({ channel: String(channel), ts: String(ts), limit: String(limit) })
        const r = await slackRequest('GET', `conversations.replies?${qs}`, token)
        return r.ok ? ok(r.data) : fail('Failed to get thread', 'SLACK_ERROR')
      }

      case 'add_reaction': {
        const r = await slackRequest('POST', 'reactions.add', token, {
          channel: params.channel,
          timestamp: params.timestamp,
          name: params.name,
        })
        return r.ok ? ok(r.data) : fail('Failed to add reaction', 'SLACK_ERROR')
      }

      case 'list_users': {
        const { limit = 100, cursor } = params
        const qs = new URLSearchParams({ limit: String(limit) })
        if (cursor) qs.set('cursor', String(cursor))
        const r = await slackRequest('GET', `users.list?${qs}`, token)
        return r.ok ? ok(r.data) : fail('Failed to list users', 'SLACK_ERROR')
      }

      case 'get_user': {
        const r = await slackRequest('GET', `users.info?user=${params.user}`, token)
        return r.ok ? ok(r.data) : fail('User not found', 'NOT_FOUND')
      }

      case 'set_topic': {
        const r = await slackRequest('POST', 'conversations.setTopic', token, {
          channel: params.channel,
          topic: params.topic,
        })
        return r.ok ? ok(r.data) : fail('Failed to set topic', 'SLACK_ERROR')
      }

      case 'upload_file': {
        const r = await slackRequest('POST', 'files.upload', token, {
          channels: params.channels,
          content: params.content,
          title: params.title,
          filetype: params.filetype,
        })
        return r.ok ? ok(r.data) : fail('Failed to upload file', 'SLACK_ERROR')
      }

      case 'search_messages': {
        const { query, count = 20, sort = 'score' } = params
        const qs = new URLSearchParams({ query: String(query), count: String(count), sort: String(sort) })
        const r = await slackRequest('GET', `search.messages?${qs}`, token)
        return r.ok ? ok(r.data) : fail('Search failed', 'SLACK_ERROR')
      }

      case 'update_message': {
        const r = await slackRequest('POST', 'chat.update', token, {
          channel: params.channel,
          ts: params.ts,
          text: params.text,
        })
        return r.ok ? ok(r.data) : fail('Failed to update message', 'SLACK_ERROR')
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
