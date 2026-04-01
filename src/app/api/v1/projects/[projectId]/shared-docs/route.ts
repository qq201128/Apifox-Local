import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { createSharedDoc, getSharedDocList } from '@/server/shared-files'

export async function loader({ params, request }: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return new Response(null, { headers: { Allow: 'GET' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  return ok({ docs: getSharedDocList(projectId) })
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  const payload = await request.json().catch(() => null) as {
    title?: string
    content?: string
    docType?: 'markdown' | 'excel'
  } | null
  const title = payload?.title?.trim()

  if (!title) {
    return fail('文档标题不能为空')
  }

  try {
    const docs = createSharedDoc({
      projectId,
      creatorUserId: user.id,
      title,
      docType: payload?.docType,
      content: payload?.content ?? '',
    })
    return ok({ docs })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '创建文档失败')
  }
}
