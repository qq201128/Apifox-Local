import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import {
  getProjectInvitation,
  revokeProjectInvitation,
} from '@/server/db/project-invitation-repo'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectCreator } from '@/server/project-access'

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'DELETE') {
    return new Response(null, { headers: { Allow: 'DELETE' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const inviteId = requireRouteParam(params.inviteId, 'inviteId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({ projectId, userId: user.id })

  if ('error' in access) {
    return access.error
  }

  const invitation = getProjectInvitation(inviteId)

  if (!invitation || invitation.projectId !== projectId) {
    return fail('邀请不存在', 404)
  }

  if (invitation.status !== 'pending' || invitation.isExpired) {
    return fail('邀请已失效')
  }

  revokeProjectInvitation({ projectId, inviteId })

  return ok({ inviteId })
}
