import type { ConnectorAdapter, ConnectorAction, ConnectorResult, DecryptedCredential } from '../types'

async function googleRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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

// --- Gmail API ---
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// --- Calendar API ---
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// --- Drive API ---
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

export const googleConnector: ConnectorAdapter = {
  info: {
    id: 'google',
    name: 'Google',
    description: 'Google Workspace: Gmail, Calendar, and Drive',
    authType: 'oauth2',
  },

  getActions(): ConnectorAction[] {
    return [
      // Gmail
      { id: 'gmail_list_messages', name: 'List Emails', description: 'List Gmail messages', inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'Gmail search query (e.g. "is:unread from:alice")' }, maxResults: { type: 'number' }, pageToken: { type: 'string' }, labelIds: { type: 'array', items: { type: 'string' } } } } },
      { id: 'gmail_get_message', name: 'Get Email', description: 'Get a full email message by ID', inputSchema: { type: 'object', required: ['messageId'], properties: { messageId: { type: 'string' }, format: { type: 'string', enum: ['full', 'metadata', 'minimal', 'raw'] } } } },
      { id: 'gmail_send_message', name: 'Send Email', description: 'Send an email', inputSchema: { type: 'object', required: ['to', 'subject', 'body'], properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string', description: 'Plain text body' }, cc: { type: 'string' }, bcc: { type: 'string' } } } },
      { id: 'gmail_list_labels', name: 'List Labels', description: 'List Gmail labels', inputSchema: { type: 'object', properties: {} } },

      // Calendar
      { id: 'calendar_list_events', name: 'List Events', description: 'List upcoming calendar events', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', description: 'Calendar ID (default: primary)' }, timeMin: { type: 'string', description: 'RFC3339 start time' }, timeMax: { type: 'string', description: 'RFC3339 end time' }, maxResults: { type: 'number' }, q: { type: 'string', description: 'Search text' } } } },
      { id: 'calendar_get_event', name: 'Get Event', description: 'Get a calendar event by ID', inputSchema: { type: 'object', required: ['eventId'], properties: { calendarId: { type: 'string' }, eventId: { type: 'string' } } } },
      { id: 'calendar_create_event', name: 'Create Event', description: 'Create a new calendar event', inputSchema: { type: 'object', required: ['summary', 'start', 'end'], properties: { calendarId: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' }, start: { type: 'object', description: '{ dateTime: "RFC3339", timeZone?: "string" }' }, end: { type: 'object', description: '{ dateTime: "RFC3339", timeZone?: "string" }' }, attendees: { type: 'array', items: { type: 'object' }, description: '[{ email: "..." }]' }, location: { type: 'string' } } } },

      // Drive
      { id: 'drive_list_files', name: 'List Files', description: 'List files in Google Drive', inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'Drive search query' }, pageSize: { type: 'number' }, pageToken: { type: 'string' }, orderBy: { type: 'string' } } } },
      { id: 'drive_get_file', name: 'Get File', description: 'Get file metadata by ID', inputSchema: { type: 'object', required: ['fileId'], properties: { fileId: { type: 'string' }, fields: { type: 'string', description: 'Comma-separated fields to return' } } } },
      { id: 'drive_search', name: 'Search Files', description: 'Search files by name or content', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Search text' }, pageSize: { type: 'number' } } } },
    ]
  },

  async execute(
    action: string,
    params: Record<string, unknown>,
    credential: DecryptedCredential
  ): Promise<ConnectorResult> {
    const token = credential.accessToken

    switch (action) {
      // --- Gmail ---
      case 'gmail_list_messages': {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', String(params.q))
        if (params.maxResults) qs.set('maxResults', String(params.maxResults))
        if (params.pageToken) qs.set('pageToken', String(params.pageToken))
        if (params.labelIds) {
          for (const id of params.labelIds as string[]) qs.append('labelIds', id)
        }
        const query = qs.toString() ? `?${qs}` : ''
        const r = await googleRequest('GET', `${GMAIL_API}/messages${query}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list messages', 'GOOGLE_ERROR', r.status)
      }

      case 'gmail_get_message': {
        const format = params.format ?? 'full'
        const r = await googleRequest('GET', `${GMAIL_API}/messages/${params.messageId}?format=${format}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Message not found', 'NOT_FOUND', r.status)
      }

      case 'gmail_send_message': {
        const { to, subject, body, cc, bcc } = params
        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset="UTF-8"`,
        ]
        if (cc) headers.push(`Cc: ${cc}`)
        if (bcc) headers.push(`Bcc: ${bcc}`)
        const rawMessage = headers.join('\r\n') + '\r\n\r\n' + body
        const encoded = Buffer.from(String(rawMessage)).toString('base64url')
        const r = await googleRequest('POST', `${GMAIL_API}/messages/send`, token, { raw: encoded })
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to send email', 'GOOGLE_ERROR', r.status)
      }

      case 'gmail_list_labels': {
        const r = await googleRequest('GET', `${GMAIL_API}/labels`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list labels', 'GOOGLE_ERROR', r.status)
      }

      // --- Calendar ---
      case 'calendar_list_events': {
        const calendarId = encodeURIComponent(String(params.calendarId ?? 'primary'))
        const qs = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime' })
        if (params.timeMin) qs.set('timeMin', String(params.timeMin))
        if (params.timeMax) qs.set('timeMax', String(params.timeMax))
        if (params.maxResults) qs.set('maxResults', String(params.maxResults))
        if (params.q) qs.set('q', String(params.q))
        const r = await googleRequest('GET', `${CALENDAR_API}/calendars/${calendarId}/events?${qs}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list events', 'GOOGLE_ERROR', r.status)
      }

      case 'calendar_get_event': {
        const calendarId = encodeURIComponent(String(params.calendarId ?? 'primary'))
        const r = await googleRequest('GET', `${CALENDAR_API}/calendars/${calendarId}/events/${params.eventId}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Event not found', 'NOT_FOUND', r.status)
      }

      case 'calendar_create_event': {
        const calendarId = encodeURIComponent(String(params.calendarId ?? 'primary'))
        const { summary, description, start, end, attendees, location } = params
        const body: Record<string, unknown> = { summary, start, end }
        if (description) body.description = description
        if (attendees) body.attendees = attendees
        if (location) body.location = location
        const r = await googleRequest('POST', `${CALENDAR_API}/calendars/${calendarId}/events`, token, body)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to create event', 'GOOGLE_ERROR', r.status)
      }

      // --- Drive ---
      case 'drive_list_files': {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', String(params.q))
        if (params.pageSize) qs.set('pageSize', String(params.pageSize))
        if (params.pageToken) qs.set('pageToken', String(params.pageToken))
        if (params.orderBy) qs.set('orderBy', String(params.orderBy))
        qs.set('fields', 'files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken')
        const r = await googleRequest('GET', `${DRIVE_API}/files?${qs}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Failed to list files', 'GOOGLE_ERROR', r.status)
      }

      case 'drive_get_file': {
        const fields = params.fields ?? 'id,name,mimeType,modifiedTime,size,webViewLink,description'
        const r = await googleRequest('GET', `${DRIVE_API}/files/${params.fileId}?fields=${fields}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('File not found', 'NOT_FOUND', r.status)
      }

      case 'drive_search': {
        const q = `fullText contains '${String(params.query).replace(/'/g, "\\'")}'`
        const qs = new URLSearchParams({ q })
        if (params.pageSize) qs.set('pageSize', String(params.pageSize))
        qs.set('fields', 'files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken')
        const r = await googleRequest('GET', `${DRIVE_API}/files?${qs}`, token)
        return r.status === 200 ? ok(r.data, r.status) : fail('Search failed', 'GOOGLE_ERROR', r.status)
      }

      default:
        return fail(`Unknown action: ${action}`, 'UNKNOWN_ACTION')
    }
  },
}
