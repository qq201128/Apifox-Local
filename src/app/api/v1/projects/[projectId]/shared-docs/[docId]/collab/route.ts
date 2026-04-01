import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { applySharedDocCollabUpdate, getSharedDocCollabState } from '@/server/shared-files'

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
    return ok({ collab: getSharedDocCollabState(projectId, docId) })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '文档不存在', 404)
  }
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const docId = requireRouteParam(params.docId, 'docId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  const payload = await request.json().catch(() => null) as { updateBase64?: string } | null

  if (!payload?.updateBase64) {
    return fail('缺少协同增量')
  }

  try {
    return ok({
      collab: applySharedDocCollabUpdate({
        projectId,
        docId,
        updateBase64: payload.updateBase64,
      }),
    })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '协同同步失败')
  }
}
