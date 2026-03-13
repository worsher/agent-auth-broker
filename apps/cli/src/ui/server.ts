import http from 'node:http'
import { getHtml } from './html.js'
import { createHandlers } from './handlers.js'

export function startServer(configPath: string, port: number): http.Server {
  const handlers = createHandlers(configPath)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const method = req.method ?? 'GET'
    const pathname = url.pathname

    // CORS headers (for local development)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      // Serve HTML
      if (method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(getHtml())
        return
      }

      // API routes
      if (pathname.startsWith('/api/')) {
        const body = method !== 'GET' ? await readBody(req) : undefined

        let result: unknown

        // Config
        if (method === 'GET' && pathname === '/api/config') {
          result = handlers.getConfigInfo()
        }
        // Agents
        else if (method === 'GET' && pathname === '/api/agents') {
          result = handlers.listAgents()
        }
        else if (method === 'POST' && pathname === '/api/agents') {
          result = handlers.addAgent(body as { id: string; name: string })
        }
        else if (method === 'DELETE' && pathname.startsWith('/api/agents/')) {
          const id = pathname.slice('/api/agents/'.length)
          result = handlers.deleteAgent(decodeURIComponent(id))
        }
        // Credentials
        else if (method === 'GET' && pathname === '/api/credentials') {
          result = handlers.listCredentials()
        }
        else if (method === 'POST' && pathname === '/api/credentials') {
          result = handlers.addCredential(body as { id: string; connector: string; token: string })
        }
        else if (method === 'DELETE' && pathname.startsWith('/api/credentials/')) {
          const id = pathname.slice('/api/credentials/'.length)
          result = handlers.deleteCredential(decodeURIComponent(id))
        }
        // Policies
        else if (method === 'GET' && pathname === '/api/policies') {
          result = handlers.listPolicies()
        }
        else if (method === 'POST' && pathname === '/api/policies') {
          result = handlers.addPolicy(body as { agent: string; credential: string; actions: string[] })
        }
        else if (method === 'DELETE' && pathname === '/api/policies') {
          result = handlers.deletePolicy(body as { agent: string; credential: string })
        }
        // Connectors
        else if (method === 'GET' && pathname === '/api/connectors') {
          result = handlers.listConnectorsInfo()
        }
        // Validate
        else if (method === 'POST' && pathname === '/api/validate') {
          result = handlers.validateConfig()
        }
        else {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Not found' }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
        return
      }

      // 404
      res.writeHead(404)
      res.end('Not found')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: message }))
    }
  })

  server.listen(port, () => {
    console.log(`Broker UI running at http://localhost:${port}`)
    console.log(`Config: ${configPath}`)
    console.log('Press Ctrl+C to stop')
  })

  return server
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}
