import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'node:crypto'
import { authOptions } from '@/lib/auth/next-auth'
import { buildAuthorizationUrl } from '@/lib/oauth/github'
import { stateStore } from '@/lib/oauth/state-store'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  stateStore.set(state, {
    userId: session.user.id,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 分钟过期
  })

  const authUrl = buildAuthorizationUrl(state)
  return NextResponse.redirect(authUrl)
}
