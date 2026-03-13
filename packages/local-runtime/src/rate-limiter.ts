/**
 * 内存滑动窗口速率限制器
 * 基于 policy 的 rate_limit 配置进行限速
 */

interface RateLimitConfig {
  max_calls: number
  window_seconds: number
}

interface WindowEntry {
  timestamps: number[]
}

export class RateLimiter {
  /** key = `${agentId}:${credentialId}` */
  private windows: Map<string, WindowEntry> = new Map()

  /**
   * 检查是否允许请求
   * @returns { allowed: true } 或 { allowed: false, retryAfterMs }
   */
  check(
    agentId: string,
    credentialId: string,
    config: RateLimitConfig
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const key = `${agentId}:${credentialId}`
    const now = Date.now()
    const windowMs = config.window_seconds * 1000
    const windowStart = now - windowMs

    let entry = this.windows.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      this.windows.set(key, entry)
    }

    // 清理过期的时间戳
    entry.timestamps = entry.timestamps.filter(t => t > windowStart)

    if (entry.timestamps.length >= config.max_calls) {
      // 计算最早的时间戳何时过期
      const earliest = entry.timestamps[0]
      const retryAfterMs = earliest + windowMs - now
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
    }

    // 记录当前请求
    entry.timestamps.push(now)
    return { allowed: true }
  }

  /**
   * 清除所有计数器
   */
  reset(): void {
    this.windows.clear()
  }
}
