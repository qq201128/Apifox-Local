import { randomUUID } from 'node:crypto'

import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './constants'
import {
  clearExpiredSessions,
  createSession,
  deleteSession,
  getSession,
  getUserById,
  validateUserPassword,
} from './db/auth-repo'

import type { SessionUser } from './types'

interface CookieOptions {
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: 'lax'
  secure?: boolean
}

function serializeCookie(name: string, value: string, options: CookieOptions) {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.path) {
    parts.push(`Path=${options.path}`)
  }
  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${options.maxAge}`)
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  if (options.httpOnly) {
    parts.push('HttpOnly')
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }
  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

function parseCookies(cookieHeader?: string | null) {
  const cookieStore = new Map<string, string>()

  if (!cookieHeader) {
    return cookieStore
  }

  for (const cookieText of cookieHeader.split(';')) {
    const [rawName, ...rawValueList] = cookieText.trim().split('=')
    const rawValue = rawValueList.join('=')

    if (!rawName) {
      continue
    }

    try {
      cookieStore.set(rawName, decodeURIComponent(rawValue))
    }
    catch {
      cookieStore.set(rawName, rawValue)
    }
  }

  return cookieStore
}

function appendSessionCookie(headers: Headers, value: string, options: CookieOptions) {
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, value, options))
}

function setSessionCookie(headers: Headers, sessionId: string, expiresAt: number) {
  appendSessionCookie(headers, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  })
}

function clearSessionCookie(headers: Headers) {
  appendSessionCookie(headers, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  })
}

export function createLoginSession(headers: Headers, userId: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const sessionId = createSession({ userId, expiresAt })

  setSessionCookie(headers, sessionId, expiresAt)
}

export function clearLoginSession(headers: Headers, sessionId?: string) {
  if (sessionId) {
    deleteSession(sessionId)
  }

  clearSessionCookie(headers)
}

export function loginByPassword(payload: { username: string, password: string }) {
  return validateUserPassword(payload)
}

function getValidSessionUserBySessionId(sessionId?: string): SessionUser | null {
  if (!sessionId) {
    return null
  }

  clearExpiredSessions()

  const session = getSession(sessionId)

  if (!session || session.expires_at <= Date.now()) {
    return null
  }

  const user = getUserById(session.user_id)

  if (!user) {
    return null
  }

  return { id: user.id, username: user.username }
}

export function getSessionUserFromRequest(request: Request) {
  const sessionId = parseCookies(request.headers.get('Cookie')).get(SESSION_COOKIE_NAME)
  const user = getValidSessionUserBySessionId(sessionId)

  return { sessionId, user }
}

export function createAnonymousSessionId() {
  return randomUUID()
}
