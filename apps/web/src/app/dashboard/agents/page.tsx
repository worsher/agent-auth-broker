import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'
import { AgentsClient } from './agents-client'

export default async function AgentsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const agents = await prisma.agent.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
      tokenPrefix: true,
      _count: { select: { policies: { where: { isActive: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const credentials = await prisma.credential.findMany({
    where: { ownerId: session.user.id, status: 'ACTIVE' },
    select: { id: true, name: true, connectorId: true },
  })

  return <AgentsClient agents={agents} credentials={credentials} />
}
