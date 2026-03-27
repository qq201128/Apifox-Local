import { type ActionFunctionArgs } from 'react-router'

import { ok, fail } from '@/server/api-response'
import { createLoginSession } from '@/server/auth'
import { createUser, getUserByUsername } from '@/server/db/auth-repo'

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

  if (!username || username.length < 3) {
    return fail('用户名至少 3 个字符')
  }

  if (password.length < 6) {
    return fail('密码至少 6 个字符')
  }

  const existed = getUserByUsername(username)

  if (existed) {
    return fail('用户名已存在', 409)
  }

  const user = createUser({ username, password })
  const headers = new Headers()
  createLoginSession(headers, user.id)
  return ok({ user }, { headers })
}
