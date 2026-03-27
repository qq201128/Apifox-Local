import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import {
  deleteProjectMember,
  getProjectMembers,
  updateProjectMemberRole,
} from '@/server/db/project-repo'
import { ensureProjectCreator } from '@/server/project-access'

import type { AssignableProjectRole } from '@/server/types'

function isValidRole(role: unknown): role is AssignableProjectRole {
  return role === 'editor' || role === 'viewer'
}

async function patchMemberRole(request: Request, projectId: string, userId: string) {
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

  if (userId === access.project.ownerId) {
    return fail('不能修改项目拥有者角色')
  }

  const body = await request.json().catch(() => null) as { role?: AssignableProjectRole } | null
  const role = body?.role

  if (!isValidRole(role)) {
    return fail('角色非法')
  }

  updateProjectMemberRole({
    projectId,
    userId,
    role,
  })

  return ok({ members: getProjectMembers(projectId) })
}

async function deleteMember(request: Request, projectId: string, userId: string) {
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

  if (userId === access.project.ownerId) {
    return fail('不能移除项目拥有者')
  }

  deleteProjectMember({
    projectId,
    userId,
  })

  return ok({ members: getProjectMembers(projectId) })
}

export async function action({ params, request }: ActionFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const userId = requireRouteParam(params.userId, 'userId')

  if (request.method === 'PATCH') {
    return patchMemberRole(request, projectId, userId)
  }
  if (request.method === 'DELETE') {
    return deleteMember(request, projectId, userId)
  }

  return new Response(null, {
    headers: { Allow: 'PATCH, DELETE' },
    status: 405,
  })
}
