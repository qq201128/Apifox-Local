import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

import * as Y from 'yjs'
import * as XLSX from 'xlsx'

import { getUserById } from './db/auth-repo'
import {
  clearExpiredSharedDocPresence,
  deleteSharedDoc,
  deleteSharedDocPresenceByDoc,
  deleteSharedFile,
  deleteSharedFilesByLinkedDocId,
  getSharedDoc,
  getSharedFile,
  insertSharedDoc,
  insertSharedFile,
  listSharedDocPresence,
  listSharedDocs,
  listSharedFiles,
  upsertSharedDocPresence,
  updateSharedDoc,
} from './db/shared-files-repo'

type SharedDocType = 'markdown' | 'excel'
type ExcelGrid = string[][]

const sharedRootDir = path.join(process.cwd(), 'runtime', 'shared-files')

function ensureDir(targetDir: string) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
}

function safeFilename(raw: string) {
  const normalized = raw.replace(/[\\/:*?"<>|]/g, '_').trim()
  return normalized || `file-${Date.now()}`
}

function encodeYState(doc: Y.Doc) {
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

function createYDocFromText(text: string) {
  const doc = new Y.Doc()
  doc.getText('content').insert(0, text)
  return doc
}

function createYDocFromBase64(base64: string) {
  const doc = new Y.Doc()

  if (base64) {
    const update = Buffer.from(base64, 'base64')

    if (update.length > 0) {
      Y.applyUpdate(doc, update)
    }
  }

  return doc
}

function getDocContent(doc: Y.Doc) {
  return doc.getText('content').toString()
}

function toSharedFileItem(row: ReturnType<typeof listSharedFiles>[number]) {
  const uploader = getUserById(row.uploader_user_id)
  return {
    id: row.id,
    projectId: row.project_id,
    uploaderUserId: row.uploader_user_id,
    uploaderUsername: uploader?.username ?? 'unknown',
    linkedDocId: row.linked_doc_id ?? undefined,
    name: row.name,
    size: row.size,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  }
}

function toSharedDocItem(row: ReturnType<typeof listSharedDocs>[number]) {
  const creator = getUserById(row.creator_user_id)
  return {
    id: row.id,
    projectId: row.project_id,
    creatorUserId: row.creator_user_id,
    creatorUsername: creator?.username ?? 'unknown',
    docType: row.doc_type,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getSharedFileList(projectId: string) {
  return listSharedFiles(projectId).map(toSharedFileItem)
}

export function getSharedDocList(projectId: string) {
  return listSharedDocs(projectId).map(toSharedDocItem)
}

export async function uploadSharedFile(payload: {
  projectId: string
  uploaderUserId: string
  file: File
}) {
  const safeName = safeFilename(payload.file.name)
  const fileId = randomUUID()
  const projectDir = path.join(sharedRootDir, payload.projectId)
  const filePath = path.join(projectDir, `${fileId}-${safeName}`)
  const storagePath = path.relative(process.cwd(), filePath).replaceAll('\\', '/')

  ensureDir(projectDir)

  const writeStream = fs.createWriteStream(filePath, { flags: 'wx' })
  const readStream = Readable.fromWeb(payload.file.stream() as any)

  await new Promise<void>((resolve, reject) => {
    readStream.on('error', reject)
    writeStream.on('error', reject)
    writeStream.on('finish', resolve)
    readStream.pipe(writeStream)
  })

  insertSharedFile({
    id: fileId,
    projectId: payload.projectId,
    uploaderUserId: payload.uploaderUserId,
    name: safeName,
    size: payload.file.size,
    mimeType: payload.file.type || 'application/octet-stream',
    storagePath,
  })

  return getSharedFileList(payload.projectId)
}

export function getSharedFileDownload(projectId: string, fileId: string) {
  const row = getSharedFile({ projectId, fileId })

  if (!row) {
    throw new Error('共享文件不存在')
  }

  const raw = row.storage_path?.trim()

  if (!raw) {
    throw new Error('该记录无磁盘文件（可能是在线文档遗留条目，请从在线文档删除）')
  }

  const absolutePath = path.resolve(process.cwd(), raw)

  if (!fs.existsSync(absolutePath)) {
    throw new Error('文件已丢失')
  }

  return {
    filename: row.name,
    mimeType: row.mime_type || 'application/octet-stream',
    stream: fs.createReadStream(absolutePath),
  }
}

export function removeSharedFile(projectId: string, fileId: string) {
  const row = getSharedFile({ projectId, fileId })

  if (!row) {
    throw new Error('共享文件不存在')
  }

  const raw = row.storage_path?.trim()

  if (raw) {
    const absolutePath = path.resolve(process.cwd(), raw)

    try {
      if (fs.existsSync(absolutePath)) {
        const stat = fs.statSync(absolutePath)

        if (stat.isFile()) {
          fs.rmSync(absolutePath)
        }
      }
    }
    catch {
      // 磁盘异常时仍删除元数据，避免列表里永远删不掉
    }
  }

  deleteSharedFile({ projectId, fileId })
  return getSharedFileList(projectId)
}

export function createSharedDoc(payload: {
  projectId: string
  creatorUserId: string
  docType?: SharedDocType
  title: string
  content?: string
}) {
  const docType = payload.docType ?? 'markdown'
  const initialContent = payload.content ?? (docType === 'excel' ? JSON.stringify([['']]) : '')
  const doc = createYDocFromText(initialContent)
  const docId = insertSharedDoc({
    projectId: payload.projectId,
    creatorUserId: payload.creatorUserId,
    docType,
    title: payload.title.trim() || '未命名在线文档',
    content: initialContent,
    yStateBase64: encodeYState(doc),
  })

  return getSharedDocList(payload.projectId)
}

export function getSharedDocDetail(projectId: string, docId: string) {
  const row = getSharedDoc({ projectId, docId })

  if (!row) {
    throw new Error('在线文档不存在')
  }

  return toSharedDocItem(row)
}

export function saveSharedDoc(payload: {
  projectId: string
  docId: string
  title: string
  content: string
  baseVersion?: number
}) {
  const current = getSharedDoc({ projectId: payload.projectId, docId: payload.docId })

  if (!current) {
    throw new Error('在线文档不存在')
  }

  const doc = createYDocFromText(payload.content)
  const updated = updateSharedDoc({
    projectId: payload.projectId,
    docId: payload.docId,
    docType: current.doc_type,
    title: payload.title.trim() || '未命名在线文档',
    content: payload.content,
    yStateBase64: encodeYState(doc),
    baseVersion: payload.baseVersion,
    version: current.version + 1,
  })

  if (!updated) {
    throw new Error('文档已被其他成员更新，请刷新后重试')
  }

  return getSharedDocDetail(payload.projectId, payload.docId)
}

export function removeSharedDoc(projectId: string, docId: string) {
  const current = getSharedDoc({ projectId, docId })

  if (!current) {
    throw new Error('在线文档不存在')
  }

  deleteSharedFilesByLinkedDocId({ projectId, docId })
  deleteSharedDocPresenceByDoc({ projectId, docId })
  deleteSharedDoc({ projectId, docId })
  return getSharedDocList(projectId)
}

export function exportSharedDoc(projectId: string, docId: string) {
  const current = getSharedDoc({ projectId, docId })

  if (!current) {
    throw new Error('在线文档不存在')
  }

  if (current.doc_type === 'excel') {
    const rows = JSON.parse(current.content || '[]') as ExcelGrid
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
    const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    return {
      filename: `${safeFilename(current.title)}.xlsx`,
      content: xlsxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }

  return {
    filename: `${safeFilename(current.title)}.md`,
    content: current.content,
    contentType: 'text/markdown; charset=utf-8',
  }
}

export function applySharedDocCollabUpdate(payload: {
  projectId: string
  docId: string
  updateBase64: string
}) {
  const current = getSharedDoc({ projectId: payload.projectId, docId: payload.docId })

  if (!current) {
    throw new Error('在线文档不存在')
  }

  if (current.doc_type !== 'markdown') {
    throw new Error('仅 Markdown 文档支持实时协同')
  }

  const doc = createYDocFromBase64(current.y_state_base64)
  const updateBuffer = Buffer.from(payload.updateBase64, 'base64')

  if (updateBuffer.length > 0) {
    Y.applyUpdate(doc, updateBuffer)
  }

  const nextContent = getDocContent(doc)
  const nextState = encodeYState(doc)
  const nextVersion = current.version + 1

  const updated = updateSharedDoc({
    projectId: payload.projectId,
    docId: payload.docId,
    docType: current.doc_type,
    title: current.title,
    content: nextContent,
    yStateBase64: nextState,
    version: nextVersion,
  })

  if (!updated) {
    throw new Error('协同更新失败，请稍后重试')
  }

  return {
    version: nextVersion,
    stateBase64: nextState,
    content: nextContent,
  }
}

export function heartbeatSharedDocPresence(payload: {
  projectId: string
  docId: string
  userId: string
  isTyping: boolean
}) {
  const now = Date.now()
  clearExpiredSharedDocPresence(now - 30_000)
  upsertSharedDocPresence({
    projectId: payload.projectId,
    docId: payload.docId,
    userId: payload.userId,
    isTyping: payload.isTyping,
    now,
  })
}

export function getSharedDocPresence(projectId: string, docId: string) {
  const rows = listSharedDocPresence({
    projectId,
    docId,
    minSeenAt: Date.now() - 30_000,
  })

  return rows.map((row) => {
    const user = getUserById(row.user_id)
    return {
      userId: row.user_id,
      username: user?.username ?? 'unknown',
      isTyping: row.is_typing === 1,
      lastSeenAt: row.last_seen_at,
    }
  })
}

export function getSharedDocCollabState(projectId: string, docId: string) {
  const current = getSharedDoc({ projectId, docId })

  if (!current) {
    throw new Error('在线文档不存在')
  }

  if (current.doc_type !== 'markdown') {
    throw new Error('仅 Markdown 文档支持实时协同')
  }

  return {
    docId: current.id,
    docType: current.doc_type,
    version: current.version,
    stateBase64: current.y_state_base64,
    updatedAt: current.updated_at,
  }
}
