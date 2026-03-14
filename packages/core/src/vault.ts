import type { PrismaClient } from '@prisma/client'
import { decryptCredential } from '@broker/crypto'
import type { DecryptedCredential } from '@broker/shared-types'
import { getPrisma } from './db.js'

/**
 * 解密并加载凭证
 * @param credentialId 凭证 ID
 * @param prismaClient 可选的 Prisma 实例
 */
export async function loadCredential(credentialId: string, prismaClient?: PrismaClient): Promise<DecryptedCredential> {
  const prisma = prismaClient ?? getPrisma()
  const cred = await prisma.credential.findUniqueOrThrow({
    where: { id: credentialId },
    select: { encryptedData: true, encryptionKeyId: true, status: true, expiresAt: true },
  })

  if (cred.status !== 'ACTIVE') {
    throw new Error(`Credential ${credentialId} is not active: ${cred.status}`)
  }

  if (cred.expiresAt && cred.expiresAt < new Date()) {
    await prisma.credential.update({
      where: { id: credentialId },
      data: { status: 'EXPIRED' },
    })
    throw new Error(`Credential ${credentialId} has expired`)
  }

  const decrypted = decryptCredential({
    encryptedData: cred.encryptedData,
    encryptionKeyId: cred.encryptionKeyId,
  })

  return decrypted as unknown as DecryptedCredential
}
