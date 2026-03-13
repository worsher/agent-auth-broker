import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

/**
 * 双层加密方案：
 * - MEK (Master Encryption Key)：来自环境变量 BROKER_MASTER_KEY，用于加密 DEK
 * - DEK (Data Encryption Key)：每条凭证独立随机生成，用于加密实际数据
 *
 * 存储格式（encryptedData）：
 *   Base64( IV[12] + AuthTag[16] + CipherText )
 *
 * 存储格式（encryptionKeyId）：
 *   Base64( DEK_IV[12] + DEK_AuthTag[16] + Encrypted_DEK[32] )
 */

function getMasterKey(): Buffer {
  const key = process.env.BROKER_MASTER_KEY
  if (!key) throw new Error('BROKER_MASTER_KEY is not set')
  const buf = Buffer.from(key, 'hex')
  if (buf.length !== 32) throw new Error('BROKER_MASTER_KEY must be 32 bytes (64 hex chars)')
  return buf
}

function encryptWithKey(plaintext: Buffer, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decryptWithKey(encoded: string, key: Buffer): Buffer {
  const buf = Buffer.from(encoded, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export interface EncryptedCredential {
  /** AES-256-GCM 加密的凭证数据（Base64） */
  encryptedData: string
  /** 加密后的 DEK（Base64），实际上是 "encrypted DEK" */
  encryptionKeyId: string
}

/**
 * 加密凭证数据
 * @param data 需要加密的凭证对象
 */
export function encryptCredential(data: Record<string, unknown>): EncryptedCredential {
  const mek = getMasterKey()

  // 1. 生成随机 DEK
  const dek = crypto.randomBytes(32)

  // 2. 用 DEK 加密数据
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
  const encryptedData = encryptWithKey(plaintext, dek)

  // 3. 用 MEK 加密 DEK（encryptionKeyId 存的是"加密后的 DEK"）
  const encryptionKeyId = encryptWithKey(dek, mek)

  return { encryptedData, encryptionKeyId }
}

/**
 * 解密凭证数据
 */
export function decryptCredential(encrypted: EncryptedCredential): Record<string, unknown> {
  const mek = getMasterKey()

  // 1. 用 MEK 解密 DEK
  const dek = decryptWithKey(encrypted.encryptionKeyId, mek)

  // 2. 用 DEK 解密数据
  const plaintext = decryptWithKey(encrypted.encryptedData, dek)

  return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
}

/**
 * 生成 Agent Token
 * 格式：agnt_<base62(32bytes)>
 */
export function generateAgentToken(): { token: string; prefix: string } {
  const bytes = crypto.randomBytes(32)
  const token = `agnt_${bytes.toString('base64url')}`
  const prefix = token.substring(0, 12) // "agnt_" + 7 chars = 12 chars
  return { token, prefix }
}

/**
 * 生成 MEK（仅用于初始化，运行时从环境变量读取）
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex')
}
