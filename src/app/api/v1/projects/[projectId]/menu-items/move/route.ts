import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { moveProjectMenuItem } from '@/server/project-state'

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required: 'editor',
  })

  if ('error' in access) {
    return access.error
  }

  const body = await request.json().catch(() => null) as {
    dragKey?: string
    dropKey?: string
    dropPosition?: -1 | 0 | 1
  } | null

  if (!body?.dragKey || !body.dropKey || (body.dropPosition !== -1 && body.dropPosition !== 0 && body.dropPosition !== 1)) {
    return fail('移动参数无效')
  }

  try {
    const nextState = moveProjectMenuItem({
      projectId,
      dragKey: body.dragKey,
      dropKey: body.dropKey,
      dropPosition: body.dropPosition,
    })

    return ok(nextState)
  }
  catch (error) {
    return fail((error as Error).message)
  }
}
