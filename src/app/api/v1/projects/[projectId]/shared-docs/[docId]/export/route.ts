import { type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { exportSharedDoc } from '@/server/shared-files'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const docId = requireRouteParam(params.docId, 'docId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  try {
    const exported = exportSharedDoc(projectId, docId)
    const encodedFilename = encodeURIComponent(exported.filename)

    return new Response(exported.content, {
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Type': exported.contentType,
      },
    })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '导出失败', 404)
  }
}
