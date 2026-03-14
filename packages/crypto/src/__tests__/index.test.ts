import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  encryptCredential,
  decryptCredential,
  generateAgentToken,
  hashToken,
  generateMasterKey,
} from '../index'

describe('crypto', () => {
  const TEST_MEK = 'a'.repeat(64) // 32 bytes hex

  beforeEach(() => {
    process.env.BROKER_MASTER_KEY = TEST_MEK
  })

  afterEach(() => {
    delete process.env.BROKER_MASTER_KEY
  })

  describe('encryptCredential / decryptCredential', () => {
    it('should encrypt and decrypt credential data correctly', () => {
      const data = { accessToken: 'ghp_test123', refreshToken: 'ghr_refresh456' }
      const encrypted = encryptCredential(data)

      expect(encrypted.encryptedData).toBeTruthy()
      expect(encrypted.encryptionKeyId).toBeTruthy()
      expect(encrypted.encryptedData).not.toContain('ghp_test123')

      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('should produce different ciphertext for same plaintext (random DEK)', () => {
      const data = { token: 'same-value' }
      const enc1 = encryptCredential(data)
      const enc2 = encryptCredential(data)

      expect(enc1.encryptedData).not.toBe(enc2.encryptedData)
      expect(enc1.encryptionKeyId).not.toBe(enc2.encryptionKeyId)
    })

    it('should fail decryption with wrong MEK', () => {
      const data = { token: 'secret' }
      const encrypted = encryptCredential(data)

      process.env.BROKER_MASTER_KEY = 'b'.repeat(64)
      expect(() => decryptCredential(encrypted)).toThrow()
    })

    it('should fail if BROKER_MASTER_KEY is not set', () => {
      delete process.env.BROKER_MASTER_KEY
      expect(() => encryptCredential({ token: 'test' })).toThrow('BROKER_MASTER_KEY is not set')
    })

    it('should fail if BROKER_MASTER_KEY is wrong length', () => {
      process.env.BROKER_MASTER_KEY = 'abcd'
      expect(() => encryptCredential({ token: 'test' })).toThrow('32 bytes')
    })

    it('should handle empty object', () => {
      const encrypted = encryptCredential({})
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual({})
    })

    it('should handle nested objects', () => {
      const data = { nested: { deep: { value: 42 } }, arr: [1, 2, 3] }
      const encrypted = encryptCredential(data)
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('should fail with tampered ciphertext', () => {
      const encrypted = encryptCredential({ token: 'test' })
      const buf = Buffer.from(encrypted.encryptedData, 'base64')
      buf[buf.length - 1] ^= 0xff // flip last byte
      encrypted.encryptedData = buf.toString('base64')

      expect(() => decryptCredential(encrypted)).toThrow()
    })
  })

  describe('generateAgentToken', () => {
    it('should return token starting with agnt_ prefix', () => {
      const { token, prefix } = generateAgentToken()
      expect(token).toMatch(/^agnt_/)
      expect(prefix).toBe(token.substring(0, 12))
    })

    it('should generate unique tokens', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateAgentToken().token))
      expect(tokens.size).toBe(10)
    })

    it('should have prefix of 12 chars', () => {
      const { prefix } = generateAgentToken()
      expect(prefix).toHaveLength(12)
    })
  })

  describe('hashToken', () => {
    it('should return a 64-char hex string (SHA-256)', () => {
      const hash = hashToken('test-token')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should be deterministic', () => {
      expect(hashToken('same-input')).toBe(hashToken('same-input'))
    })

    it('should produce different hashes for different inputs', () => {
      expect(hashToken('input-a')).not.toBe(hashToken('input-b'))
    })
  })

  describe('generateMasterKey', () => {
    it('should return a 64-char hex string', () => {
      const key = generateMasterKey()
      expect(key).toHaveLength(64)
      expect(key).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should generate unique keys', () => {
      const keys = new Set(Array.from({ length: 5 }, () => generateMasterKey()))
      expect(keys.size).toBe(5)
    })
  })
})
