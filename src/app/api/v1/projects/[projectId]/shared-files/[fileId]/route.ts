import { type ActionFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { removeSharedFile } from '@/server/shared-files'

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'DELETE') {
    return new Response(null, { headers: { Allow: 'DELETE' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const fileId = requireRouteParam(params.fileId, 'fileId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  try {
    const files = removeSharedFile(projectId, fileId)
    return ok({ files })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '删除失败')
  }
}
