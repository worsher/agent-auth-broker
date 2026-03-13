import { encryptCredential, decryptCredential } from '@broker/crypto'
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

export async function loadCredential(credentialId: string): Promise<DecryptedCredential> {
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
