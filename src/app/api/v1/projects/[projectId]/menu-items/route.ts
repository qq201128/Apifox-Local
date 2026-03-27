import { type ActionFunctionArgs } from 'react-router'

import type { ApiMenuData } from '@/components/ApiMenu'
import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { createProjectMenuItem } from '@/server/project-state'

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

  const menuData = await request.json().catch(() => null) as ApiMenuData | null

  if (!menuData?.id || !menuData.name || !menuData.type) {
    return fail('菜单数据不完整')
  }

  try {
    const nextState = createProjectMenuItem(projectId, menuData)
    return ok(nextState)
  }
  catch (error) {
    return fail((error as Error).message)
  }
}
