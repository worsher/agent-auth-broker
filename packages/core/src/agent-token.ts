import bcrypt from 'bcryptjs'
import { generateAgentToken } from '@broker/crypto'
import { getPrisma } from './db.js'

export { generateAgentToken }

/**
 * 验证 Agent Token
 * 先用 prefix 快速定位 Agent，再 bcrypt.compare 验证
 */
export async function verifyAgentToken(token: string): Promise<string | null> {
  if (!token.startsWith('agnt_')) return null

  const prisma = getPrisma()
  const prefix = token.substring(0, 12)

  const agent = await prisma.agent.findUnique({
    where: { tokenPrefix: prefix },
    select: { id: true, tokenHash: true, isActive: true, tokenExpiresAt: true },
  })

  if (!agent || !agent.isActive) return null

  // Token TTL 检查
  if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
    return null
  }

  const valid = await bcrypt.compare(token, agent.tokenHash)
  if (!valid) return null

  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastUsedAt: new Date() },
  })

  return agent.id
}
