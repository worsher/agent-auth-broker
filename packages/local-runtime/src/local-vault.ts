import type { DecryptedCredential } from '@broker/shared-types'
import { decryptCredential } from '@broker/crypto'
import type { LocalStore } from './local-store.js'

/**
 * 从本地配置加载并解密凭证
 * 支持两种模式：
 * 1. 环境变量引用 — token 字段直接包含明文（已在 config-loader 中解析 ${ENV_VAR}）
 * 2. AES-256-GCM 加密 — encrypted 字段包含密文，需要 encryption_key 解密
 */
export function loadLocalCredential(
  credentialId: string,
  store: LocalStore
): DecryptedCredential {
  const cred = store.getCredential(credentialId)
  if (!cred) {
    throw new Error(`凭证不存在: ${credentialId}`)
  }

  // 模式一：明文 token（来自环境变量引用）
  if (cred.token) {
    return {
      accessToken: cred.token,
      tokenType: 'bearer',
    }
  }

  // 模式二：加密存储
  if (cred.encrypted) {
    if (!store.encryptionKey) {
      throw new Error(`凭证 "${credentialId}" 使用加密存储，但配置中未设置 encryption_key`)
    }

    // 临时设置 BROKER_MASTER_KEY 环境变量，供 @broker/crypto 使用
    const prevKey = process.env.BROKER_MASTER_KEY
    try {
      process.env.BROKER_MASTER_KEY = store.encryptionKey
      const decrypted = decryptCredential({
        encryptedData: cred.encrypted,
        encryptionKeyId: '', // 单层加密模式，encrypted 包含完整密文
      })
      return decrypted as unknown as DecryptedCredential
    } finally {
      if (prevKey !== undefined) {
        process.env.BROKER_MASTER_KEY = prevKey
      } else {
        delete process.env.BROKER_MASTER_KEY
      }
    }
  }

  throw new Error(`凭证 "${credentialId}" 未配置 token 或 encrypted`)
}
