import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { saveProjectEnvironmentConfig } from '@/server/project-environments'
import { getProjectState } from '@/server/project-state'

interface UpdateEnvironmentsPayload {
  config?: unknown
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'PATCH') {
    return new Response(null, { headers: { Allow: 'PATCH' }, status: 405 })
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

  const payload = await request.json().catch(() => null) as UpdateEnvironmentsPayload | null

  if (!payload || !('config' in payload)) {
    return fail('缺少环境配置')
  }

  try {
    saveProjectEnvironmentConfig(projectId, payload.config)
    return ok(getProjectState(projectId))
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '保存环境失败')
  }
}
