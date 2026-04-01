import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { getSharedDocPresence, heartbeatSharedDocPresence } from '@/server/shared-files'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const docId = requireRouteParam(params.docId, 'docId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  return ok({ members: getSharedDocPresence(projectId, docId) })
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const docId = requireRouteParam(params.docId, 'docId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  const payload = await request.json().catch(() => null) as { isTyping?: boolean } | null
  heartbeatSharedDocPresence({
    projectId,
    docId,
    userId: user.id,
    isTyping: Boolean(payload?.isTyping),
  })

  return ok({ ok: true })
}
