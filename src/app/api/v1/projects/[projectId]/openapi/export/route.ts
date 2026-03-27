import { type LoaderFunctionArgs } from 'react-router'

import { fail } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { exportMenuItemsToOpenApi } from '@/server/openapi'
import { ensureProjectPermission } from '@/server/project-access'
import { getProjectState } from '@/server/project-state'

export async function loader({ params, request }: LoaderFunctionArgs) {
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

  const requestUrl = new URL(request.url)
  const format = requestUrl.searchParams.get('format') === 'yaml' ? 'yaml' : 'json'
  const state = getProjectState(projectId)
  const text = exportMenuItemsToOpenApi(state.menuRawList, format)
  const filename = `openapi.${format === 'yaml' ? 'yaml' : 'json'}`

  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': format === 'yaml' ? 'application/yaml; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
