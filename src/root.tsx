import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LinksFunction,
  type MetaFunction,
} from 'react-router'

import { ThemeProviderClient } from '@/components/ThemeEditor'
import { GlobalContextProvider } from '@/contexts/global'
import { getPageTitle } from '@/utils'

import '@/styles/globals.css'

export const links: LinksFunction = () => {
  return [
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ]
}

export const meta: MetaFunction = () => {
  return [
    { title: getPageTitle() },
    { name: 'description', content: '一个可本地运行、可审计、可按需改造的 API 接口管理前端项目。' },
  ]
}

interface DocumentProps {
  children: React.ReactNode
}

export function Layout(props: DocumentProps) {
  const { children } = props

  return (
    <html className="h-full" lang="zh-Hans-CN">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="m-0 h-full">
        <ThemeProviderClient autoSaveId="theme:persistence">
          <main className="h-full">
            <GlobalContextProvider>{children}</GlobalContextProvider>
          </main>
        </ThemeProviderClient>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  return <Outlet />
}
