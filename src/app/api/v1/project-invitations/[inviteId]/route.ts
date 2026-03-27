import { type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { getProjectInvitation } from '@/server/db/project-invitation-repo'
import { getProjectMember } from '@/server/db/project-repo'
import { requireRouteParam } from '@/router/route-param'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const inviteId = requireRouteParam(params.inviteId, 'inviteId')
  const invitation = getProjectInvitation(inviteId)

  if (!invitation) {
    return fail('邀请不存在', 404)
  }

  const { user } = getSessionUserFromRequest(request)
  const member = user
    ? getProjectMember({ projectId: invitation.projectId, userId: user.id })
    : undefined

  return ok({
    invitation,
    user,
    isCurrentUserMember: Boolean(member),
  })
}
