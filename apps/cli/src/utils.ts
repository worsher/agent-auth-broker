import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const DEFAULT_CONFIG_NAME = 'broker.yaml'

/**
 * 获取全局配置目录路径 (~/.broker/config/)
 */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), '.broker', 'config')
}

/**
 * 获取全局配置文件路径 (~/.broker/config/broker.yaml)
 */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), DEFAULT_CONFIG_NAME)
}

/**
 * 查找配置文件路径
 * 优先级：--config 参数 > 当前目录向上查找 > 全局配置目录（兜底）
 */
export function resolveConfigPath(configOption?: string): string {
  if (configOption) {
    return path.resolve(configOption)
  }

  // 从当前目录向上查找
  let dir = process.cwd()
  while (true) {
    const candidate = path.join(dir, DEFAULT_CONFIG_NAME)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // 兜底：全局配置目录（无论是否存在都返回此路径）
  return getGlobalConfigPath()
}

/**
 * 获取默认配置模板
 */
function getDefaultConfigTemplate(): Record<string, unknown> {
  return {
    version: '1',
    agents: [
      {
        id: 'my-agent',
        name: 'My AI Agent',
      },
    ],
    credentials: [
      {
        id: 'github-main',
        connector: 'github',
        token: '${GITHUB_TOKEN}',
      },
    ],
    policies: [
      {
        agent: 'my-agent',
        credential: 'github-main',
        actions: ['*'],
      },
    ],
    audit: {
      enabled: true,
      output: 'stdout',
    },
  }
}

/**
 * 检查配置文件是否存在
 * 如果不存在，自动在全局目录创建默认配置文件
 */
export function ensureConfigExists(configPath: string): boolean {
  if (fs.existsSync(configPath)) return true

  // 检查是否是全局配置路径，如果是则自动创建
  const globalConfigPath = getGlobalConfigPath()
  if (configPath === globalConfigPath) {
    const globalDir = getGlobalConfigDir()
    if (!fs.existsSync(globalDir)) {
      fs.mkdirSync(globalDir, { recursive: true })
    }
    const template = getDefaultConfigTemplate()
    const yaml = stringifyYaml(template, { lineWidth: 120 })
    fs.writeFileSync(globalConfigPath, yaml, 'utf-8')
    logSuccess(`已自动创建全局配置文件: ${globalConfigPath}`)
    console.log()
    console.log('下一步：')
    console.log('  1. 编辑配置文件添加你的凭证和策略')
    console.log('  2. 设置环境变量: export GITHUB_TOKEN=your_token')
    console.log('  3. 验证配置: broker validate')
    console.log()
    return true
  }

  // 用户指定了自定义路径但文件不存在
  logError(`找不到配置文件: ${configPath}`)
  console.log()
  console.log('请先初始化配置文件:')
  console.log()
  console.log('  在当前目录创建:')
  console.log('    broker init')
  console.log()
  console.log('  在全局配置目录创建:')
  console.log('    broker init --global')
  console.log()
  console.log('  或指定路径:')
  console.log('    broker init --config /path/to/broker.yaml')
  console.log()
  return false
}

/**
 * 读取 YAML 配置文件（原始对象，不解析环境变量）
 */
export function readRawConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) {
    ensureConfigExists(configPath)
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
