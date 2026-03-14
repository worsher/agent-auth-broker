import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/next-auth'
import { buildAuthorizationUrl } from '@/lib/oauth/github'
import { createOAuthState } from '@/lib/oauth/state-store'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const state = await createOAuthState(session.user.id, 'github')
  const authUrl = buildAuthorizationUrl(state)
  return NextResponse.redirect(authUrl)
}
