import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

import { db } from './client'

interface UserRow {
  id: string
  username: string
  password_hash: string
}

interface SessionRow {
  id: string
  user_id: string
  expires_at: number
}

function toPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')

  return `${salt}:${hash}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')

  if (!salt || !hash) {
    return false
  }

  const calculated = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')

  if (calculated.length !== expected.length) {
    return false
  }

  return timingSafeEqual(calculated, expected)
}

export function createUser(payload: { username: string, password: string }) {
  const now = new Date().toISOString()
  const id = randomUUID()
  const passwordHash = toPasswordHash(payload.password)

  db.prepare(`
    INSERT INTO users (id, username, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, payload.username, passwordHash, now)

  return { id, username: payload.username }
}

export function getUserByUsername(username: string) {
  const row = db.prepare(`
    SELECT id, username, password_hash
    FROM users
    WHERE username = ?
  `).get(username) as UserRow | undefined

  return row
}

export function validateUserPassword(payload: { username: string, password: string }) {
  const user = getUserByUsername(payload.username)

  if (!user || !verifyPassword(payload.password, user.password_hash)) {
    return null
  }

  return { id: user.id, username: user.username }
}

export function createSession(payload: { userId: string, expiresAt: number }) {
  const id = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, payload.userId, payload.expiresAt, now)

  return id
}

export function deleteSession(sessionId: string) {
  db.prepare(`
    DELETE FROM sessions
    WHERE id = ?
  `).run(sessionId)
}

export function clearExpiredSessions(now = Date.now()) {
  db.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= ?
  `).run(now)
}

export function getSession(sessionId: string) {
  clearExpiredSessions()

  const row = db.prepare(`
    SELECT id, user_id, expires_at
    FROM sessions
    WHERE id = ?
  `).get(sessionId) as SessionRow | undefined

  return row
}

export function getUserById(userId: string) {
  return db.prepare(`
    SELECT id, username
    FROM users
    WHERE id = ?
  `).get(userId) as { id: string, username: string } | undefined
}

