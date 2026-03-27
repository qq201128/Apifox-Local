import { fail } from './api-response'
import { getProject, getProjectMember } from './db/project-repo'

import type { ProjectPermission, ProjectRole } from './types'

const roleRank: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

export function hasProjectPermission(role: ProjectRole, required: ProjectPermission) {
  return roleRank[role] >= roleRank[required]
}

export function getProjectRole(payload: { projectId: string, userId: string }) {
  const member = getProjectMember(payload)

  return member?.role
}

export function ensureProjectPermission(payload: {
  projectId: string
  userId: string
  required: ProjectPermission
}) {
  const project = getProject(payload.projectId)

  if (!project) {
    return { error: fail('项目不存在', 404) }
  }

  const role = getProjectRole({ projectId: payload.projectId, userId: payload.userId })

  if (!role) {
    return { error: fail('你不是该项目成员', 403) }
  }

  if (!hasProjectPermission(role, payload.required)) {
    return { error: fail('权限不足', 403) }
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      ownerId: project.owner_id,
      createdAt: project.created_at,
    },
    role,
  }
}

export function ensureProjectCreator(payload: { projectId: string, userId: string }) {
  const access = ensureProjectPermission({
    projectId: payload.projectId,
    userId: payload.userId,
    required: 'owner',
  })

  if ('error' in access) {
    return access
  }

  if (access.project.ownerId !== payload.userId) {
    return { error: fail('仅项目创建者可操作', 403) }
  }

  return access
}
