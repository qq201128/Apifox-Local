import { type ActionFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { removeProjectMenuItemsBatch } from '@/server/project-state'

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

  const body = await request.json().catch(() => null) as { menuIds?: unknown } | null

  if (!body || !Array.isArray(body.menuIds)) {
    return fail('请提供 menuIds 数组')
  }

  const menuIds = body.menuIds.filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (menuIds.length !== body.menuIds.length) {
    return fail('menuIds 须为非空字符串数组')
  }

  try {
    const nextState = removeProjectMenuItemsBatch({
      projectId,
      menuIds,
      actor: user,
    })

    return ok(nextState)
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '批量删除失败')
  }
}
