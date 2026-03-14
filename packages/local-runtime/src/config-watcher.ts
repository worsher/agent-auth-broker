import fs from 'node:fs'
import { loadConfig } from './config-loader.js'
import type { LocalStore } from './local-store.js'
import { logger } from './logger.js'

/**
 * 监视 broker.yaml 文件变更，自动重载配置
 * 使用 300ms 防抖避免编辑器保存时多次触发
 * 重载失败时保留旧配置并输出错误日志
 */
export class ConfigWatcher {
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number

  constructor(
    private configPath: string,
    private store: LocalStore,
    opts?: { debounceMs?: number }
  ) {
    this.debounceMs = opts?.debounceMs ?? 300
  }

  start(): void {
    if (this.watcher) return

    this.watcher = fs.watch(this.configPath, (_eventType) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => this.reload(), this.debounceMs)
    })

    this.watcher.on('error', (err) => {
      logger.error({ err }, '监视配置文件出错')
    })
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private reload(): void {
    try {
      const config = loadConfig(this.configPath)
      this.store.reload(config)
      logger.info({ path: this.configPath }, '配置已重载')
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), path: this.configPath }, '重载失败，保留旧配置')
    }
  }
}
