import { redirect } from 'react-router'

import { getSessionUserFromRequest } from '@/server/auth'
import { ensureProjectPermission } from '@/server/project-access'
import { resolveAuthRedirectTarget } from './auth-redirect'

import type { ProjectPermission } from '@/server/types'

export function redirectIfAuthenticated(request: Request) {
  const { user } = getSessionUserFromRequest(request)

  if (user) {
    const requestUrl = new URL(request.url)
    throw redirect(resolveAuthRedirectTarget(requestUrl.searchParams.get('redirect')))
  }
}

export function requireAuthenticatedUser(request: Request) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    throw redirect('/login')
  }

  return user
}

export function resolveProjectAccess(
  request: Request,
  projectId: string,
  required: ProjectPermission,
) {
  const user = requireAuthenticatedUser(request)
  const access = ensureProjectPermission({
    projectId,
    userId: user.id,
    required,
  })

  if ('error' in access) {
    throw redirect('/projects')
  }

  return { access, user }
}
