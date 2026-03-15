import type { PrismaClient } from '@prisma/client'
import { decryptCredential } from '@broker/crypto'
import type { DecryptedCredential } from '@broker/shared-types'
import { getPrisma } from './db.js'
import { attemptTokenRefresh } from './token-refresher.js'

/**
 * 解密并加载凭证
 *
 * 如果凭证已过期且包含 refreshToken，会自动尝试 OAuth2 刷新。
 * 刷新成功后返回新的凭证；刷新失败则标记为 REFRESH_REQUIRED 并抛出异常。
 *
 * @param credentialId 凭证 ID
 * @param prismaClient 可选的 Prisma 实例
 */
export async function loadCredential(credentialId: string, prismaClient?: PrismaClient): Promise<DecryptedCredential> {
  const prisma = prismaClient ?? getPrisma()
  const cred = await prisma.credential.findUniqueOrThrow({
    where: { id: credentialId },
    select: {
      encryptedData: true,
      encryptionKeyId: true,
      status: true,
      expiresAt: true,
      connectorId: true,
    },
  })

  if (cred.status !== 'ACTIVE') {
    throw new Error(`Credential ${credentialId} is not active: ${cred.status}`)
  }

  // 凭证过期：尝试 OAuth2 自动刷新
  if (cred.expiresAt && cred.expiresAt < new Date()) {
    try {
      return await attemptTokenRefresh(
        credentialId,
        cred.connectorId,
        cred.encryptedData,
        cred.encryptionKeyId,
        prisma
      )
    } catch (refreshErr) {
      // 刷新失败：标记为 REFRESH_REQUIRED，需管理员重新授权
      await prisma.credential.update({
        where: { id: credentialId },
        data: { status: 'REFRESH_REQUIRED' },
      })
      const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
      throw new Error(`Credential ${credentialId} has expired and could not be refreshed: ${msg}`)
    }
  }

  const decrypted = decryptCredential({
    encryptedData: cred.encryptedData,
    encryptionKeyId: cred.encryptionKeyId,
  })

  return decrypted as unknown as DecryptedCredential
}
