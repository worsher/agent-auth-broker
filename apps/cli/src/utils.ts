import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const DEFAULT_CONFIG_NAME = 'broker.yaml'

/**
 * 查找配置文件路径
 * 优先使用 --config 参数，否则从当前目录向上查找 broker.yaml
 */
export function resolveConfigPath(configOption?: string): string {
  if (configOption) {
    return path.resolve(configOption)
  }

  let dir = process.cwd()
  while (true) {
    const candidate = path.join(dir, DEFAULT_CONFIG_NAME)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return path.resolve(DEFAULT_CONFIG_NAME)
}

/**
 * 读取 YAML 配置文件（原始对象，不解析环境变量）
 */
export function readRawConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`)
  }
  const raw = fs.readFileSync(configPath, 'utf-8')
  return parseYaml(raw) as Record<string, unknown>
}

/**
 * 写入 YAML 配置文件
 */
export function writeConfig(configPath: string, config: Record<string, unknown>): void {
  const yaml = stringifyYaml(config, { lineWidth: 120 })
  fs.writeFileSync(configPath, yaml, 'utf-8')
}

export function log(message: string): void {
  console.log(message)
}

export function logError(message: string): void {
  console.error(`\u274C ${message}`)
}

export function logSuccess(message: string): void {
  console.log(`\u2705 ${message}`)
}

export function logWarn(message: string): void {
  console.log(`\u26A0\uFE0F  ${message}`)
}
