import { decryptCredential } from '@broker/crypto'
import type { DecryptedCredential } from '@broker/shared-types'
import { getPrisma } from './db.js'

export async function loadCredential(credentialId: string): Promise<DecryptedCredential> {
  const prisma = getPrisma()
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
