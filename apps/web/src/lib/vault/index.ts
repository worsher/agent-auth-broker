import { encryptCredential } from '@broker/crypto'
import { loadCredential as coreLoadCredential } from '@broker/core'
import type { DecryptedCredential } from '@broker/shared-types'
import { prisma } from '../db/prisma'

export async function storeCredential(
  ownerId: string,
  connectorId: string,
  name: string,
  data: DecryptedCredential,
  oauthScopes: string[],
  expiresAt?: Date
) {
  const { encryptedData, encryptionKeyId } = encryptCredential(data as unknown as Record<string, unknown>)

  return prisma.credential.create({
    data: {
      ownerId,
      connectorId,
      name,
      encryptedData,
      encryptionKeyId,
      oauthScopes,
      expiresAt,
    },
  })
}

/**
 * 解密并加载凭证，委托给 @broker/core 并注入 web 的 prisma 实例
 */
export async function loadCredential(credentialId: string): Promise<DecryptedCredential> {
  return coreLoadCredential(credentialId, prisma)
}
