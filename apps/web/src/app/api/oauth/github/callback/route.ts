import { NextRequest, NextResponse } from 'next/server'
import { consumeOAuthState } from '@/lib/oauth/state-store'
import { completeGitHubOAuth } from '@/lib/oauth/github'
import { prisma } from '@/lib/db/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard/credentials?error=${encodeURIComponent(error)}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/credentials?error=missing_params', request.url))
  }

  // 验证 state（CSRF 防护，一次性消费）
  const stateData = await consumeOAuthState(state)
  if (!stateData) {
    return NextResponse.redirect(new URL('/dashboard/credentials?error=invalid_state', request.url))
  }

  const { userId } = stateData

  try {
    const { credentialId, githubLogin } = await completeGitHubOAuth(userId, code)

    // 写入审计日志
    await prisma.auditLog.create({
      data: {
        userId,
        credentialId,
        connectorId: 'github',
        action: 'oauth_connect',
        requestSummary: { githubLogin },
        responseStatus: 200,
        permissionResult: 'ALLOWED',
      },
    })

    return NextResponse.redirect(
      new URL(`/dashboard/credentials?success=github_connected&login=${githubLogin}`, request.url)
    )
  } catch (err) {
    console.error('GitHub OAuth callback error:', err)
    return NextResponse.redirect(
      new URL('/dashboard/credentials?error=oauth_failed', request.url)
    )
  }
}
