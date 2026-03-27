import { type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { getProjectState } from '@/server/project-state'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const startedAt = Date.now()
  const routeTag = '[api][projects/state]'
  let lastMark = startedAt
  const { user } = getSessionUserFromRequest(request)
  console.info(
    `${routeTag} step=auth_check projectId=${projectId} elapsedMs=${Date.now() - lastMark}`,
  )
  lastMark = Date.now()

  if (!user) {
    console.info(
      `${routeTag} step=unauthorized projectId=${projectId} totalMs=${Date.now() - startedAt}`,
    )
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required: 'viewer',
  })
  console.info(
    `${routeTag} step=permission_check projectId=${projectId} userId=${user.id} elapsedMs=${Date.now() - lastMark}`,
  )
  lastMark = Date.now()

  if ('error' in access) {
    console.info(
      `${routeTag} step=permission_denied projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`,
    )
    return access.error
  }

  const state = getProjectState(projectId)
  console.info(
    `${routeTag} step=get_project_state projectId=${projectId} userId=${user.id} elapsedMs=${Date.now() - lastMark}`,
  )
  console.info(
    `${routeTag} step=done projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`,
  )

  return ok(state)
}
