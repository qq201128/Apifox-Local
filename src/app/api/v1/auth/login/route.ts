import { type ActionFunctionArgs } from 'react-router'

import { ok, fail } from '@/server/api-response'
import { createLoginSession, loginByPassword } from '@/server/auth'

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const body = await request.json().catch(() => null) as {
    username?: string
    password?: string
  } | null

  const username = body?.username?.trim()
  const password = body?.password ?? ''

  if (!username || !password) {
    return fail('用户名和密码不能为空')
  }

  const user = loginByPassword({ username, password })

  if (!user) {
    return fail('用户名或密码错误', 401)
  }

  const headers = new Headers()
  createLoginSession(headers, user.id)
  return ok({ user }, { headers })
}
