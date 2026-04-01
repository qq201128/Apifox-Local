import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { getSharedDocDetail, removeSharedDoc, saveSharedDoc } from '@/server/shared-files'

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
    return ok({ doc: getSharedDocDetail(projectId, docId) })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '文档不存在', 404)
  }
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const docId = requireRouteParam(params.docId, 'docId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  if (request.method === 'PATCH') {
    const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

    if ('error' in access) {
      return access.error
    }

    const payload = await request.json().catch(() => null) as {
      title?: string
      content?: string
      baseVersion?: number
    } | null

    if (!payload || typeof payload.title !== 'string' || typeof payload.content !== 'string') {
      return fail('缺少文档内容')
    }

    try {
      return ok({
        doc: saveSharedDoc({
          projectId,
          docId,
          title: payload.title,
          content: payload.content,
          baseVersion: payload.baseVersion,
        }),
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      const status = message.includes('刷新后重试') ? 409 : 400
      return fail(message, status)
    }
  }

  if (request.method === 'DELETE') {
    const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

    if ('error' in access) {
      return access.error
    }

    try {
      return ok({ docs: removeSharedDoc(projectId, docId) })
    }
    catch (error) {
      return fail(error instanceof Error ? error.message : '删除失败')
    }
  }

  return new Response(null, { headers: { Allow: 'GET, PATCH, DELETE' }, status: 405 })
}
