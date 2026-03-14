/**
 * MCP Streamable HTTP Transport
 *
 * 启用方式：MCP_TRANSPORT=http MCP_PORT=3200 node dist/index.js
 * 可选 Bearer Token 认证：MCP_AUTH_TOKEN=your-secret-token
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN

interface SessionEntry {
  transport: StreamableHTTPServerTransport
  server: Server
}

/**
 * 启动 HTTP 模式的 MCP Server
 */
export async function startHttpTransport(
  createServer_: () => Server,
  port: number,
): Promise<void> {
  const sessions = new Map<string, SessionEntry>()

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    if (!AUTH_TOKEN) return true
    const auth = req.headers.authorization
    if (auth === `Bearer ${AUTH_TOKEN}`) return true
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null }))
    return false
  }

  const httpServer = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization')
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (!checkAuth(req, res)) return

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (req.method === 'GET') {
      // SSE streaming for existing sessions
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!
        await session.transport.handleRequest(req, res)
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session' }, id: null }))
      }
      return
    }

    if (req.method === 'DELETE') {
      // Session cleanup
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!
        await session.transport.handleRequest(req, res)
        sessions.delete(sessionId)
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Session not found' }, id: null }))
      }
      return
    }

    if (req.method === 'POST') {
      // Read body
      const body = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', chunk => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })

      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }))
        return
      }

      // Reuse existing session
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.transport.handleRequest(req, res, parsed)
        return
      }

      // Create new session on initialize request
      if (!sessionId && isInitializeRequest(parsed)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server })
            console.error(`[broker-mcp] HTTP session initialized: ${id}`)
          },
        })

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId)
            console.error(`[broker-mcp] HTTP session closed: ${transport.sessionId}`)
          }
        }

        const server = createServer_()
        await server.connect(transport)
        await transport.handleRequest(req, res, parsed)
        return
      }

      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session or missing initialize' }, id: null }))
      return
    }

    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }))
  })

  httpServer.listen(port, () => {
    console.error(`[broker-mcp] MCP Server started (HTTP mode, port ${port})`)
    if (AUTH_TOKEN) {
      console.error('[broker-mcp] Bearer Token authentication enabled')
    }
  })
}
