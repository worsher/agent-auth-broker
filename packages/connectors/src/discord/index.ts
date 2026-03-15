import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

const DISCORD_API = 'https://discord.com/api/v10'

async function discordRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
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

export const discordConnector: ConnectorAdapter = {
  info: {
    id: 'discord',
    name: 'Discord',
    description: 'Discord guilds, channels, and messages',
    authType: 'api_key',
  },

  getActions(): ConnectorAction[] {
    return [
      { id: 'list_guilds', name: 'List Guilds', description: 'List guilds the bot is in', inputSchema: { type: 'object', properties: {} } },
      { id: 'get_guild', name: 'Get Guild', description: 'Get guild details', inputSchema: { type: 'object', required: ['guildId'], properties: { guildId: { type: 'string' } } } },
      { id: 'list_channels', name: 'List Channels', description: 'List channels in a guild', inputSchema: { type: 'object', required: ['guildId'], properties: { guildId: { type: 'string' } } } },
      { id: 'get_channel', name: 'Get Channel', description: 'Get channel details', inputSchema: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string' } } } },
      { id: 'send_message', name: 'Send Message', description: 'Send a message to a channel', inputSchema: { type: 'object', required: ['channelId', 'content'], properties: { channelId: { type: 'string' }, content: { type: 'string' }, tts: { type: 'boolean' } } } },
      { id: 'get_messages', name: 'Get Messages', description: 'Get messages from a channel', inputSchema: { type: 'object', required: ['channelId'], properties: { channelId: { type: 'string' }, limit: { type: 'number' }, before: { type: 'string' }, after: { type: 'string' } } } },
      { id: 'edit_message', name: 'Edit Message', description: 'Edit a message', inputSchema: { type: 'object', required: ['channelId', 'messageId', 'content'], properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, content: { type: 'string' } } } },
      { id: 'add_reaction', name: 'Add Reaction', description: 'Add reaction to a message', inputSchema: { type: 'object', required: ['channelId', 'messageId', 'emoji'], properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, emoji: { type: 'string', description: 'URL-encoded emoji (e.g. %F0%9F%91%8D or custom name:id)' } } } },
      { id: 'create_thread', name: 'Create Thread', description: 'Create a thread from a message', inputSchema: { type: 'object', required: ['channelId', 'messageId', 'name'], properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, name: { type: 'string' }, auto_archive_duration: { type: 'number', description: '60, 1440, 4320, or 10080 minutes' } } } },
      { id: 'list_members', name: 'List Members', description: 'List guild members', inputSchema: { type: 'object', required: ['guildId'], properties: { guildId: { type: 'string' }, limit: { type: 'number' }, after: { type: 'string' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      case 'list_guilds': {
        const r = await discordRequest('GET', '/users/@me/guilds', token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list guilds', 'DISCORD_ERROR', r.status)
      }

      case 'get_guild': {
        const r = await discordRequest('GET', `/guilds/${params.guildId}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Guild not found', 'NOT_FOUND', r.status)
      }

      case 'list_channels': {
        const r = await discordRequest('GET', `/guilds/${params.guildId}/channels`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list channels', 'DISCORD_ERROR', r.status)
      }

      case 'get_channel': {
        const r = await discordRequest('GET', `/channels/${params.channelId}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Channel not found', 'NOT_FOUND', r.status)
      }

      case 'send_message': {
        const body: Record<string, unknown> = { content: params.content }
        if (params.tts) body.tts = params.tts
        const r = await discordRequest('POST', `/channels/${params.channelId}/messages`, token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to send message', 'DISCORD_ERROR', r.status)
      }

      case 'get_messages': {
        const { channelId, limit = 50, before, after } = params
        const qs = new URLSearchParams({ limit: String(limit) })
        if (before) qs.set('before', String(before))
        if (after) qs.set('after', String(after))
        const r = await discordRequest('GET', `/channels/${channelId}/messages?${qs}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to get messages', 'DISCORD_ERROR', r.status)
      }

      case 'edit_message': {
        const r = await discordRequest('PATCH', `/channels/${params.channelId}/messages/${params.messageId}`, token, {
          content: params.content,
        })
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to edit message', 'DISCORD_ERROR', r.status)
      }

      case 'add_reaction': {
        const r = await discordRequest('PUT', `/channels/${params.channelId}/messages/${params.messageId}/reactions/${params.emoji}/@me`, token)
        return r.status === 204 ? ok({ success: true }, r.status) : fail('Failed to add reaction', 'DISCORD_ERROR', r.status)
      }

      case 'create_thread': {
        const body: Record<string, unknown> = { name: params.name }
        if (params.auto_archive_duration) body.auto_archive_duration = params.auto_archive_duration
        const r = await discordRequest('POST', `/channels/${params.channelId}/messages/${params.messageId}/threads`, token, body)
        return r.status === 201 ? ok(r.data, r.status) : fail('Failed to create thread', 'DISCORD_ERROR', r.status)
      }

      case 'list_members': {
        const { guildId, limit = 100, after } = params
        const qs = new URLSearchParams({ limit: String(limit) })
        if (after) qs.set('after', String(after))
        const r = await discordRequest('GET', `/guilds/${guildId}/members?${qs}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list members', 'DISCORD_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
