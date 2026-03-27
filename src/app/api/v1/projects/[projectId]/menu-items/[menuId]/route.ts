import { type ActionFunctionArgs } from 'react-router'

import type { ApiMenuData } from '@/components/ApiMenu'
import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { patchProjectMenuItem, removeProjectMenuItem } from '@/server/project-state'

async function patchMenuItem(request: Request, projectId: string, menuId: string) {
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

  const patch = await request.json().catch(() => null) as Partial<ApiMenuData> | null

  if (!patch) {
    return fail('更新数据无效')
  }

  try {
    const nextState = patchProjectMenuItem(projectId, {
      ...patch,
      id: menuId,
    })

    return ok(nextState)
  }
  catch (error) {
    return fail((error as Error).message)
  }
}

async function deleteMenuItem(request: Request, projectId: string, menuId: string) {
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

  const nextState = removeProjectMenuItem({
    projectId,
    menuId,
    actor: user,
  })

  return ok(nextState)
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const menuId = requireRouteParam(params.menuId, 'menuId')

  if (request.method === 'PATCH') {
    return patchMenuItem(request, projectId, menuId)
  }
  if (request.method === 'DELETE') {
    return deleteMenuItem(request, projectId, menuId)
  }

  return new Response(null, {
    headers: { Allow: 'PATCH, DELETE' },
    status: 405,
  })
}
