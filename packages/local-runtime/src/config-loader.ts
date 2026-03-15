import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import safe from 'safe-regex2'

const RateLimitSchema = z.object({
  max_calls: z.number().int().positive(),
  window_seconds: z.number().int().positive(),
}).optional()

const ParamConstraintSchema = z.record(
  z.string(),
  z.object({ pattern: z.string().optional() })
)

const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  token_hash: z.string().optional(),
  token_prefix: z.string().optional(),
  // Token TTL：ISO 8601 格式的过期时间
  token_expires_at: z.string().datetime().optional(),
  // IP 白名单：CIDR 或精确 IP，空数组或不设置 = 不限制
  allowed_ips: z.array(z.string()).default([]),
})

const CredentialSchema = z.object({
  id: z.string().min(1),
  connector: z.string().min(1),
  token: z.string().optional(),
  encrypted: z.string().optional(),
})

const PolicySchema = z.object({
  agent: z.string().min(1),
  credential: z.string().min(1),
  actions: z.array(z.string()).default(['*']),
  param_constraints: ParamConstraintSchema.optional(),
  rate_limit: RateLimitSchema,
  expires_at: z.string().datetime().optional(),
})

const AuditSchema = z.object({
  enabled: z.boolean().default(true),
  output: z.enum(['stdout', 'file']).default('stdout'),
  file: z.string().optional(),
}).default({ enabled: true, output: 'stdout' })

const BrokerConfigSchema = z.object({
  version: z.string().default('1'),
  encryption_key: z.string().optional(),
  agents: z.array(AgentSchema).min(1),
  credentials: z.array(CredentialSchema).min(1),
  policies: z.array(PolicySchema).min(1),
  audit: AuditSchema,
})

export type BrokerConfig = z.infer<typeof BrokerConfigSchema>
export type AgentConfig = z.infer<typeof AgentSchema>
export type CredentialConfig = z.infer<typeof CredentialSchema>
export type PolicyConfig = z.infer<typeof PolicySchema>
export type AuditConfig = z.infer<typeof AuditSchema>

/**
 * 解析字符串中的 ${ENV_VAR} 引用
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envName: string) => {
    const envValue = process.env[envName]
    if (envValue === undefined) {
      throw new Error(`环境变量 ${envName} 未设置`)
    }
    return envValue
  })
}

/**
 * 递归解析对象中的所有 ${ENV_VAR} 引用
 */
function resolveEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj) as T
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolveEnvVarsInObject(item)) as T
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = resolveEnvVarsInObject(value)
    }
    return result as T
  }
  return obj
}

/**
 * 从文件路径加载 broker.yaml 配置
 */
export function loadConfig(configPath: string): BrokerConfig {
  const absolutePath = path.resolve(configPath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`配置文件不存在: ${absolutePath}`)
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8')
  const parsed = parseYaml(raw)
  const resolved = resolveEnvVarsInObject(parsed)
  const result = BrokerConfigSchema.parse(resolved)

  // 验证凭证配置完整性
  for (const cred of result.credentials) {
    if (!cred.token && !cred.encrypted) {
      throw new Error(`凭证 "${cred.id}" 必须设置 token 或 encrypted 字段`)
    }
    if (cred.encrypted && !result.encryption_key) {
      throw new Error(`凭证 "${cred.id}" 使用加密存储，但未设置 encryption_key`)
    }
  }

  // 验证策略引用完整性
  const agentIds = new Set(result.agents.map(a => a.id))
  const credentialIds = new Set(result.credentials.map(c => c.id))

  for (const policy of result.policies) {
    if (!agentIds.has(policy.agent)) {
      throw new Error(`策略引用了不存在的 agent: "${policy.agent}"`)
    }
    if (!credentialIds.has(policy.credential)) {
      throw new Error(`策略引用了不存在的 credential: "${policy.credential}"`)
    }

    // 验证参数约束中的正则模式安全性（防止 ReDoS）
    if (policy.param_constraints) {
      for (const [key, constraint] of Object.entries(policy.param_constraints)) {
        if (constraint.pattern && !safe(constraint.pattern)) {
          throw new Error(`策略参数约束 "${key}" 的正则模式不安全（可能导致 ReDoS）: "${constraint.pattern}"`)
        }
      }
    }
  }

  return result
}

/**
 * 验证配置文件格式（不解析环境变量，只检查结构）
 */
export function validateConfigFile(configPath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  try {
    const absolutePath = path.resolve(configPath)
    if (!fs.existsSync(absolutePath)) {
      return { valid: false, errors: [`配置文件不存在: ${absolutePath}`] }
    }

    const raw = fs.readFileSync(absolutePath, 'utf-8')
    const parsed = parseYaml(raw)

    // 用 safeParse 收集所有错误
    const result = BrokerConfigSchema.safeParse(parsed)
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`)
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { valid: errors.length === 0, errors }
}
