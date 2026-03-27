import { type ActionFunctionArgs } from 'react-router'

import { ok } from '@/server/api-response'
import { clearLoginSession, getSessionUserFromRequest } from '@/server/auth'

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const { sessionId } = getSessionUserFromRequest(request)
  const headers = new Headers()

  clearLoginSession(headers, sessionId)
  return ok({ success: true }, { headers })
}
