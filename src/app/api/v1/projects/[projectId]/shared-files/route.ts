import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { getSharedFileList, uploadSharedFile } from '@/server/shared-files'

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

  return ok({ files: getSharedFileList(projectId) })
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

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return fail('请上传文件')
  }

  try {
    const files = await uploadSharedFile({
      projectId,
      uploaderUserId: user.id,
      file,
    })
    return ok({ files })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '上传失败')
  }
}
