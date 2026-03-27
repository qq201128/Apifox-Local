import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { acceptProjectInvitation } from '@/server/db/project-invitation-repo'
import { requireRouteParam } from '@/router/route-param'

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const inviteId = requireRouteParam(params.inviteId, 'inviteId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  try {
    const invitation = acceptProjectInvitation({ inviteId, userId: user.id })

    return ok({
      invitation,
      redirectTo: `/projects/${invitation.projectId}/home`,
    })
  }
  catch (error) {
    return fail((error as Error).message)
  }
}
