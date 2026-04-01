import { type LoaderFunctionArgs } from 'react-router'
import { Readable } from 'node:stream'

import { requireRouteParam } from '@/router/route-param'
import { fail } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { getSharedFileDownload } from '@/server/shared-files'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const fileId = requireRouteParam(params.fileId, 'fileId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'viewer' })

  if ('error' in access) {
    return access.error
  }

  try {
    const download = getSharedFileDownload(projectId, fileId)
    const stream = Readable.toWeb(download.stream) as ReadableStream
    const encodedFilename = encodeURIComponent(download.filename)

    return new Response(stream, {
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Type': download.mimeType,
      },
    })
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '下载失败', 404)
  }
}
