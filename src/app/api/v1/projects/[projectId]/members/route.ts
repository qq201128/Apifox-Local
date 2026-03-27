import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { getProjectMembers } from '@/server/db/project-repo'
import { ensureProjectCreator, ensureProjectPermission } from '@/server/project-access'

export async function GET(
  request: Request,
  projectId: string,
) {
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

  const members = getProjectMembers(projectId)

  return ok({ members })
}

async function createMember(
  request: Request,
  projectId: string,
) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({
    projectId,
    userId: user.id,
  })

  if ('error' in access) {
    return access.error
  }

  return fail('请通过邀请链接添加成员', 409)
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  return GET(request, projectId)
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'GET, POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  return createMember(request, projectId)
}
