import type { BrokerCallResult } from '@broker/shared-types'
import {
  AuthenticationError,
  BrokerApiError,
  NetworkError,
  PermissionDeniedError,
} from './errors.js'

export interface ToolEntry {
  connector: string
  connectorName: string
  credentialName: string
  action: string
  actionName: string
  description: string
}

export interface BrokerClientOptions {
  /** Broker API 地址，如 'http://localhost:3100' */
  baseUrl: string
  /** Agent Token (agnt_xxx) */
  token: string
  /** 请求超时，单位 ms，默认 30000 */
  timeout?: number
  /** 全局错误回调 */
  onError?: (error: Error) => void
}

/**
 * ConnectorProxy — 按 connector 分组的便捷调用接口
 *
 * @example
 * ```ts
 * const github = client.connector('github')
 * const result = await github.call('create_issue', { repo: 'org/repo', title: 'Bug' })
 * const actions = await github.listActions()
 * ```
 */
export class ConnectorProxy {
  constructor(
    private readonly client: BrokerClient,
    private readonly connectorId: string
  ) {}

  /**
   * 调用该 connector 的指定 action
   */
  async call(action: string, params: Record<string, unknown> = {}): Promise<BrokerCallResult> {
    return this.client.callTool(this.connectorId, action, params)
  }

  /**
   * 列出该 connector 可用的 actions
   */
  async listActions(): Promise<ToolEntry[]> {
    return this.client.listTools(this.connectorId)
  }
}

/**
 * Agent Auth Broker TypeScript SDK
 *
 * @example
 * ```ts
 * import { BrokerClient } from '@broker/sdk'
 *
 * const client = new BrokerClient({
 *   baseUrl: 'http://localhost:3100',
 *   token: 'agnt_xxxxxxxx',
 * })
 *
 * // 列出所有可用工具
 * const tools = await client.listTools()
 *
 * // 调用工具
 * const result = await client.callTool('github', 'create_issue', {
 *   repo: 'org/repo',
 *   title: 'New issue',
 * })
 *
 * // 便捷 connector 代理
 * const github = client.connector('github')
 * await github.call('list_repos', { per_page: 10 })
 * ```
 */
export class BrokerClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeout: number
  private readonly onError?: (error: Error) => void

  constructor(options: BrokerClientOptions) {
    if (!options.baseUrl) throw new Error('baseUrl is required')
    if (!options.token) throw new Error('token is required')

    // 去掉末尾斜杠
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeout = options.timeout ?? 30_000
    this.onError = options.onError
  }

  /**
   * 底层 HTTP 请求方法
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'broker-sdk/0.1.0',
          ...options.headers,
        },
      })

      const body = await res.json().catch(() => ({})) as Record<string, unknown>

      if (res.status === 401) {
        throw new AuthenticationError(
          (body.error as string) ?? 'Invalid or missing agent token'
        )
      }

      if (res.status === 403) {
        throw new PermissionDeniedError(
          (body.error as string) ?? 'Permission denied',
          (body.permissionResult as string) ?? 'UNKNOWN'
        )
      }

      if (!res.ok) {
        throw new BrokerApiError(
          (body.error as string) ?? `HTTP ${res.status}: ${res.statusText}`,
          res.status
        )
      }

      return body as T
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const error = new NetworkError(`Request timeout after ${this.timeout}ms: ${url}`)
        this.onError?.(error)
        throw error
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const error = new NetworkError(`Network error: ${err.message}`)
        this.onError?.(error)
        throw error
      }
      // 已知的 BrokerError 子类直接透传
      if (this.onError && err instanceof Error) {
        this.onError(err)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 列出可用工具
   * @param connector 可选，按 connector 过滤
   */
  async listTools(connector?: string): Promise<ToolEntry[]> {
    const query = connector ? `?connector=${encodeURIComponent(connector)}` : ''
    const res = await this.request<{ success: boolean; data?: ToolEntry[]; error?: string }>(
      `/api/broker/list-tools${query}`
    )
    if (!res.success) {
      throw new BrokerApiError(res.error ?? 'Failed to list tools', 500)
    }
    return res.data ?? []
  }

  /**
   * 调用工具
   * @param connector Connector ID，如 'github'
   * @param action Action ID，如 'create_issue'
   * @param params 操作参数
   */
  async callTool(
    connector: string,
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<BrokerCallResult> {
    return this.request<BrokerCallResult>('/api/broker/call', {
      method: 'POST',
      body: JSON.stringify({ connector, action, params }),
    })
  }

  /**
   * 创建 connector 代理，便于按 connector 分组调用
   * @param connectorId Connector ID，如 'github'
   */
  connector(connectorId: string): ConnectorProxy {
    return new ConnectorProxy(this, connectorId)
  }
}
