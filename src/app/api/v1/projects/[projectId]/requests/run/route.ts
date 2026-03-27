import { type ActionFunctionArgs } from 'react-router'

import { requireRouteParam } from '@/router/route-param'
import { fail, ok } from '@/server/api-response'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { listProjectEnvironmentConfig } from '@/server/project-environments'
import { runApiRequest } from '@/server/request-runner'
import { buildRequestVariableMap } from '@/server/request-runtime-variables'
import type { ApiDetails } from '@/types'

interface RunRequestPayload {
  apiDetails?: ApiDetails
  baseUrlOverride?: string
  environmentId?: string
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

  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required: 'viewer',
  })

  if ('error' in access) {
    return access.error
  }

  const payload = await request.json().catch(() => null) as RunRequestPayload | null

  if (!payload?.apiDetails) {
    return fail('缺少接口数据')
  }

  try {
    const environmentConfig = listProjectEnvironmentConfig(projectId)
    const variables = buildRequestVariableMap({
      config: environmentConfig,
      environmentId: payload.environmentId,
    })
    const result = await runApiRequest({
      apiDetails: payload.apiDetails,
      baseUrlOverride: payload.baseUrlOverride,
      globalParameters: environmentConfig.globalParameters,
      variables,
    })

    return ok(result)
  }
  catch (error) {
    return fail(error instanceof Error ? error.message : '运行失败')
  }
}
