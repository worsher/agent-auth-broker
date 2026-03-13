import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from './providers'

export const metadata: Metadata = {
  title: 'Agent Auth Broker',
  description: 'AI Agent 统一鉴权管理平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
