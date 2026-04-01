import { randomUUID } from 'node:crypto'

import { db } from './client'

export interface SharedFileRow {
  id: string
  project_id: string
  uploader_user_id: string
  linked_doc_id: string | null
  name: string
  size: number
  mime_type: string
  storage_path: string
  created_at: string
}

export interface SharedDocRow {
  id: string
  project_id: string
  creator_user_id: string
  doc_type: 'markdown' | 'excel'
  title: string
  content: string
  y_state_base64: string
  version: number
  created_at: string
  updated_at: string
}

export interface SharedDocPresenceRow {
  project_id: string
  doc_id: string
  user_id: string
  is_typing: number
  last_seen_at: number
}

export function listSharedFiles(projectId: string) {
  return db.prepare(`
    SELECT id, project_id, uploader_user_id, linked_doc_id, name, size, mime_type, storage_path, created_at
    FROM shared_files
    WHERE project_id = ? AND linked_doc_id IS NULL
    ORDER BY created_at DESC
  `).all(projectId) as SharedFileRow[]
}

export function getSharedFile(payload: { projectId: string, fileId: string }) {
  return db.prepare(`
    SELECT id, project_id, uploader_user_id, linked_doc_id, name, size, mime_type, storage_path, created_at
    FROM shared_files
    WHERE project_id = ? AND id = ?
  `).get(payload.projectId, payload.fileId) as SharedFileRow | undefined
}

export function insertSharedFile(payload: {
  id?: string
  projectId: string
  uploaderUserId: string
  linkedDocId?: string
  name: string
  size: number
  mimeType: string
  storagePath: string
}) {
  const id = payload.id ?? randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO shared_files (
      id, project_id, uploader_user_id, linked_doc_id, name, size, mime_type, storage_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.projectId,
    payload.uploaderUserId,
    payload.linkedDocId ?? null,
    payload.name,
    payload.size,
    payload.mimeType,
    payload.storagePath,
    now,
  )

  return id
}

export function deleteSharedFile(payload: { projectId: string, fileId: string }) {
  const result = db.prepare(`
    DELETE FROM shared_files
    WHERE project_id = ? AND id = ?
  `).run(payload.projectId, payload.fileId)

  return result.changes > 0
}

export function deleteSharedFilesByLinkedDocId(payload: { projectId: string, docId: string }) {
  db.prepare(`
    DELETE FROM shared_files
    WHERE project_id = ? AND linked_doc_id = ?
  `).run(payload.projectId, payload.docId)
}

export function listSharedDocs(projectId: string) {
  return db.prepare(`
    SELECT id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at
    FROM shared_docs
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId) as SharedDocRow[]
}

export function getSharedDoc(payload: { projectId: string, docId: string }) {
  return db.prepare(`
    SELECT id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at
    FROM shared_docs
    WHERE project_id = ? AND id = ?
  `).get(payload.projectId, payload.docId) as SharedDocRow | undefined
}

export function insertSharedDoc(payload: {
  projectId: string
  creatorUserId: string
  docType: 'markdown' | 'excel'
  title: string
  content: string
  yStateBase64: string
}) {
  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO shared_docs (
      id, project_id, creator_user_id, doc_type, title, content, y_state_base64, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    payload.projectId,
    payload.creatorUserId,
    payload.docType,
    payload.title,
    payload.content,
    payload.yStateBase64,
    now,
    now,
  )

  return id
}

export function updateSharedDoc(payload: {
  projectId: string
  docId: string
  docType: 'markdown' | 'excel'
  title: string
  content: string
  yStateBase64: string
  baseVersion?: number
  version: number
}) {
  const now = new Date().toISOString()
  const versionGuardSql = payload.baseVersion === undefined ? '' : ' AND version = ?'
  const stmt = db.prepare(`
    UPDATE shared_docs
    SET doc_type = ?, title = ?, content = ?, y_state_base64 = ?, version = ?, updated_at = ?
    WHERE project_id = ? AND id = ?${versionGuardSql}
  `)

  const result = payload.baseVersion === undefined
    ? stmt.run(
        payload.docType,
        payload.title,
        payload.content,
        payload.yStateBase64,
        payload.version,
        now,
        payload.projectId,
        payload.docId,
      )
    : stmt.run(
        payload.docType,
        payload.title,
        payload.content,
        payload.yStateBase64,
        payload.version,
        now,
        payload.projectId,
        payload.docId,
        payload.baseVersion,
      )

  return result.changes > 0
}

export function upsertSharedDocPresence(payload: {
  projectId: string
  docId: string
  userId: string
  isTyping: boolean
  now: number
}) {
  db.prepare(`
    INSERT INTO shared_doc_presence (project_id, doc_id, user_id, is_typing, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, doc_id, user_id)
    DO UPDATE SET is_typing = excluded.is_typing, last_seen_at = excluded.last_seen_at
  `).run(
    payload.projectId,
    payload.docId,
    payload.userId,
    payload.isTyping ? 1 : 0,
    payload.now,
  )
}

export function listSharedDocPresence(payload: { projectId: string, docId: string, minSeenAt: number }) {
  return db.prepare(`
    SELECT project_id, doc_id, user_id, is_typing, last_seen_at
    FROM shared_doc_presence
    WHERE project_id = ? AND doc_id = ? AND last_seen_at >= ?
    ORDER BY last_seen_at DESC
  `).all(payload.projectId, payload.docId, payload.minSeenAt) as SharedDocPresenceRow[]
}

export function deleteSharedDocPresenceByDoc(payload: { projectId: string, docId: string }) {
  db.prepare(`
    DELETE FROM shared_doc_presence
    WHERE project_id = ? AND doc_id = ?
  `).run(payload.projectId, payload.docId)
}

export function clearExpiredSharedDocPresence(expireBefore: number) {
  db.prepare(`
    DELETE FROM shared_doc_presence
    WHERE last_seen_at < ?
  `).run(expireBefore)
}

export function deleteSharedDoc(payload: { projectId: string, docId: string }) {
  const result = db.prepare(`
    DELETE FROM shared_docs
    WHERE project_id = ? AND id = ?
  `).run(payload.projectId, payload.docId)

  return result.changes > 0
}
