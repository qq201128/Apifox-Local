import { type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  return ok({ user })
}
