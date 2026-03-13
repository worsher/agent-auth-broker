import { stringify as stringifyYaml } from 'yaml'
import { readRawConfig, writeConfig } from '../utils.js'
import { listConnectors } from '@broker/connectors'
import { validateConfigFile } from '@broker/local-runtime'

interface RawAgent {
  id: string
  name: string
  token_hash?: string
  token_prefix?: string
}

interface RawCredential {
  id: string
  connector: string
  token?: string
  encrypted?: string
}

interface RawPolicy {
  agent: string
  credential: string
  actions: string[]
  param_constraints?: Record<string, { pattern?: string }>
}

export function createHandlers(configPath: string) {
  function getConfig() {
    return readRawConfig(configPath)
  }

  function saveConfig(config: Record<string, unknown>) {
    writeConfig(configPath, config)
  }

  return {
    // GET /api/config — 返回脱敏的 YAML 和路径
    getConfigInfo() {
      const config = getConfig()
      // 对 token 脱敏显示
      const sanitized = JSON.parse(JSON.stringify(config))
      const creds = (sanitized.credentials ?? []) as RawCredential[]
      for (const c of creds) {
        if (c.token && !c.token.startsWith('${')) {
          c.token = '***'
        }
      }
      // 生成 YAML 预览
      const yaml = stringifyYaml(sanitized, { lineWidth: 120 })
      return { yaml, path: configPath }
    },

    // GET /api/agents
    listAgents(): RawAgent[] {
      const config = getConfig()
      return (config.agents as RawAgent[] | undefined) ?? []
    },

    // POST /api/agents
    addAgent(body: { id: string; name: string }) {
      const config = getConfig()
      const agents = (config.agents as RawAgent[] | undefined) ?? []
      if (agents.find(a => a.id === body.id)) {
        throw new Error(`Agent "${body.id}" already exists`)
      }
      agents.push({ id: body.id, name: body.name })
      config.agents = agents
      saveConfig(config)
      return { ok: true }
    },

    // DELETE /api/agents/:id
    deleteAgent(id: string) {
      const config = getConfig()
      const agents = (config.agents as RawAgent[] | undefined) ?? []
      const index = agents.findIndex(a => a.id === id)
      if (index === -1) throw new Error(`Agent "${id}" not found`)
      agents.splice(index, 1)
      config.agents = agents
      // 同时移除关联策略
      const policies = (config.policies as RawPolicy[] | undefined) ?? []
      config.policies = policies.filter(p => p.agent !== id)
      saveConfig(config)
      return { ok: true }
    },

    // GET /api/credentials
    listCredentials(): Array<{ id: string; connector: string; token?: string }> {
      const config = getConfig()
      const creds = (config.credentials as RawCredential[] | undefined) ?? []
      return creds.map(c => ({
        id: c.id,
        connector: c.connector,
        token: c.token ? (c.token.startsWith('${') ? c.token : '***') : undefined,
      }))
    },

    // POST /api/credentials
    addCredential(body: { id: string; connector: string; token: string }) {
      const config = getConfig()
      const creds = (config.credentials as RawCredential[] | undefined) ?? []
      if (creds.find(c => c.id === body.id)) {
        throw new Error(`Credential "${body.id}" already exists`)
      }
      creds.push({ id: body.id, connector: body.connector, token: body.token })
      config.credentials = creds
      saveConfig(config)
      return { ok: true }
    },

    // DELETE /api/credentials/:id
    deleteCredential(id: string) {
      const config = getConfig()
      const creds = (config.credentials as RawCredential[] | undefined) ?? []
      const index = creds.findIndex(c => c.id === id)
      if (index === -1) throw new Error(`Credential "${id}" not found`)
      creds.splice(index, 1)
      config.credentials = creds
      // 同时移除关联策略
      const policies = (config.policies as RawPolicy[] | undefined) ?? []
      config.policies = policies.filter(p => p.credential !== id)
      saveConfig(config)
      return { ok: true }
    },

    // GET /api/policies
    listPolicies(): RawPolicy[] {
      const config = getConfig()
      return (config.policies as RawPolicy[] | undefined) ?? []
    },

    // POST /api/policies
    addPolicy(body: { agent: string; credential: string; actions: string[] }) {
      const config = getConfig()
      const policies = (config.policies as RawPolicy[] | undefined) ?? []
      const existing = policies.find(p => p.agent === body.agent && p.credential === body.credential)
      if (existing) {
        existing.actions = body.actions
      } else {
        policies.push({ agent: body.agent, credential: body.credential, actions: body.actions })
      }
      config.policies = policies
      saveConfig(config)
      return { ok: true }
    },

    // DELETE /api/policies
    deletePolicy(body: { agent: string; credential: string }) {
      const config = getConfig()
      const policies = (config.policies as RawPolicy[] | undefined) ?? []
      const index = policies.findIndex(p => p.agent === body.agent && p.credential === body.credential)
      if (index === -1) throw new Error('Policy not found')
      policies.splice(index, 1)
      config.policies = policies
      saveConfig(config)
      return { ok: true }
    },

    // GET /api/connectors
    listConnectorsInfo() {
      return listConnectors().map(c => ({ id: c.info.id, name: c.info.name }))
    },

    // POST /api/validate
    validateConfig() {
      try {
        return validateConfigFile(configPath)
      } catch (e) {
        return { valid: false, errors: [(e as Error).message] }
      }
    },
  }
}
