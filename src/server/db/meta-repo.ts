import { db } from './client'

interface MetaRow {
  project_id: string
  key: string
  value: string
}

export function getProjectMetaValue(payload: { projectId: string, key: string }) {
  const row = db.prepare(`
    SELECT project_id, key, value
    FROM meta
    WHERE project_id = ? AND key = ?
  `).get(payload.projectId, payload.key) as MetaRow | undefined

  return row?.value
}

export function setProjectMetaValue(payload: {
  projectId: string
  key: string
  value: string
}) {
  db.prepare(`
    INSERT INTO meta (project_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT (project_id, key)
    DO UPDATE SET value = excluded.value
  `).run(payload.projectId, payload.key, payload.value)
}
