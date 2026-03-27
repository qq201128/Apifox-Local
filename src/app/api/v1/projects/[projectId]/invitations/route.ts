import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import {
  PROJECT_INVITE_MAX_TTL_HOURS,
  PROJECT_INVITE_MIN_TTL_HOURS,
} from '@/server/constants'
import {
  createProjectInvitation,
  listProjectInvitations,
} from '@/server/db/project-invitation-repo'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectCreator } from '@/server/project-access'

import type { AssignableProjectRole } from '@/server/types'

const HOUR_MS = 60 * 60 * 1000

function isValidRole(role: unknown): role is AssignableProjectRole {
  return role === 'editor' || role === 'viewer'
}

function parseExpiresInHours(value: unknown) {
  if (!Number.isInteger(value)) {
    return undefined
  }

  const hours = Number(value)

  if (hours < PROJECT_INVITE_MIN_TTL_HOURS || hours > PROJECT_INVITE_MAX_TTL_HOURS) {
    return undefined
  }

  return hours
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({ projectId, userId: user.id })

  if ('error' in access) {
    return access.error
  }

  return ok({ invitations: listProjectInvitations(projectId) })
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'GET, POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectCreator({ projectId, userId: user.id })

  if ('error' in access) {
    return access.error
  }

  const body = await request.json().catch(() => null) as {
    role?: AssignableProjectRole
    expiresInHours?: number
  } | null
  const role = body?.role
  const expiresInHours = parseExpiresInHours(body?.expiresInHours)

  if (!isValidRole(role)) {
    return fail('角色非法')
  }

  if (!expiresInHours) {
    return fail(`有效期必须在 ${PROJECT_INVITE_MIN_TTL_HOURS}-${PROJECT_INVITE_MAX_TTL_HOURS} 小时之间`)
  }

  const invitation = createProjectInvitation({
    projectId,
    inviterUserId: user.id,
    role,
    expiresAt: Date.now() + expiresInHours * HOUR_MS,
  })

  return ok({ invitation }, { status: 201 })
}
