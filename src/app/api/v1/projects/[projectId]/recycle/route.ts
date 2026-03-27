import { type ActionFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import {
  removeProjectRecycleItems,
  restoreProjectRecycleItems,
} from '@/server/project-state'

interface RecycleMutationBody {
  recycleIds?: unknown
}

function parseRecycleIds(body: RecycleMutationBody | null) {
  if (!Array.isArray(body?.recycleIds)) {
    return undefined
  }

  const recycleIds = body.recycleIds.filter((item): item is string => {
    return typeof item === 'string' && item.trim().length > 0
  })

  if (recycleIds.length !== body.recycleIds.length) {
    return undefined
  }

  return [...new Set(recycleIds)]
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response(null, { headers: { Allow: 'POST, DELETE' }, status: 405 })
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

  const body = await request.json().catch(() => null) as RecycleMutationBody | null
  const recycleIds = parseRecycleIds(body)

  if (!recycleIds || recycleIds.length === 0) {
    return fail('回收项参数非法')
  }

  try {
    const nextState = request.method === 'POST'
      ? restoreProjectRecycleItems(projectId, recycleIds)
      : removeProjectRecycleItems(projectId, recycleIds)

    return ok(nextState)
  }
  catch (error) {
    return fail((error as Error).message)
  }
}
