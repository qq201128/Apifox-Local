import { randomUUID } from 'node:crypto'

import { db } from './client'
import { runInTransaction } from './menu-repo'

import type {
  AssignableProjectRole,
  ProjectInvitationItem,
  ProjectInvitationStatus,
} from '../types'

interface ProjectInvitationRow {
  id: string
  project_id: string
  project_name: string
  inviter_user_id: string
  inviter_username: string
  accepted_by_user_id: string | null
  role: AssignableProjectRole
  status: ProjectInvitationStatus
  expires_at: number
  accepted_at: string | null
  created_at: string
}

interface StoredInvitationRow {
  id: string
  project_id: string
  inviter_user_id: string
  accepted_by_user_id: string | null
  role: AssignableProjectRole
  status: ProjectInvitationStatus
  expires_at: number
  accepted_at: string | null
  created_at: string
}

function toProjectInvitationItem(row: ProjectInvitationRow): ProjectInvitationItem {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    inviterUserId: row.inviter_user_id,
    inviterUsername: row.inviter_username,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: new Date(row.expires_at).toISOString(),
    acceptedAt: row.accepted_at ?? undefined,
    acceptedByUserId: row.accepted_by_user_id ?? undefined,
    isExpired: row.status === 'pending' && row.expires_at <= Date.now(),
  }
}

function getInvitationBaseQuery() {
  return `
    SELECT
      i.id,
      i.project_id,
      p.name AS project_name,
      i.inviter_user_id,
      u.username AS inviter_username,
      i.accepted_by_user_id,
      i.role,
      i.status,
      i.expires_at,
      i.accepted_at,
      i.created_at
    FROM project_invitations i
    JOIN projects p ON p.id = i.project_id
    JOIN users u ON u.id = i.inviter_user_id
  `
}

export function listProjectInvitations(projectId: string) {
  const rows = db.prepare(`
    ${getInvitationBaseQuery()}
    WHERE i.project_id = ?
    ORDER BY i.created_at DESC
  `).all(projectId) as ProjectInvitationRow[]

  return rows.map(toProjectInvitationItem)
}

export function getProjectInvitation(inviteId: string) {
  const row = db.prepare(`
    ${getInvitationBaseQuery()}
    WHERE i.id = ?
  `).get(inviteId) as ProjectInvitationRow | undefined

  if (!row) {
    return undefined
  }

  return toProjectInvitationItem(row)
}

export function createProjectInvitation(payload: {
  projectId: string
  inviterUserId: string
  role: AssignableProjectRole
  expiresAt: number
}) {
  const id = randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare(`
    INSERT INTO project_invitations (
      id, project_id, inviter_user_id, role, status, expires_at, created_at
    )
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, payload.projectId, payload.inviterUserId, payload.role, payload.expiresAt, createdAt)

  const invitation = getProjectInvitation(id)

  if (!invitation) {
    throw new Error('邀请创建失败')
  }

  return invitation
}

export function revokeProjectInvitation(payload: { projectId: string, inviteId: string }) {
  const result = db.prepare(`
    UPDATE project_invitations
    SET status = 'revoked'
    WHERE project_id = ? AND id = ? AND status = 'pending'
  `).run(payload.projectId, payload.inviteId)

  return result.changes > 0
}

export function acceptProjectInvitation(payload: { inviteId: string, userId: string }) {
  return runInTransaction(() => {
    const invite = db.prepare(`
      SELECT id, project_id, inviter_user_id, accepted_by_user_id, role, status, expires_at, accepted_at, created_at
      FROM project_invitations
      WHERE id = ?
    `).get(payload.inviteId) as StoredInvitationRow | undefined

    if (!invite) {
      throw new Error('邀请不存在')
    }

    if (invite.status === 'revoked') {
      throw new Error('邀请已失效')
    }

    if (invite.status === 'accepted') {
      throw new Error('邀请已被处理')
    }

    if (invite.expires_at <= Date.now()) {
      throw new Error('邀请已过期')
    }

    const member = db.prepare(`
      SELECT user_id
      FROM project_members
      WHERE project_id = ? AND user_id = ?
    `).get(invite.project_id, payload.userId) as { user_id: string } | undefined

    if (member) {
      throw new Error('你已经是该项目成员')
    }

    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run(invite.project_id, payload.userId, invite.role, now)

    db.prepare(`
      UPDATE project_invitations
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?
      WHERE id = ?
    `).run(payload.userId, now, payload.inviteId)

    const invitation = getProjectInvitation(payload.inviteId)

    if (!invitation) {
      throw new Error('邀请不存在')
    }

    return invitation
  })
}
