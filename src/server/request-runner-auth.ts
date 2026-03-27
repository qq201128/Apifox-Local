import { Buffer } from 'node:buffer'

import type { ApiDetails, ApiRequestAuth, ApiRequestAuthTarget, ApiRunHeader } from '@/types'

import { type RequestVariableMap, resolveRequestTemplate } from './request-runtime-variables'

type NameNormalizer = (name: string) => string

export interface RequestAuthEntry {
  target: ApiRequestAuthTarget
  name: string
  value: string
}

const EXACT_NAME: NameNormalizer = name => name
const HEADER_NAME: NameNormalizer = name => name.toLowerCase()

function requireResolvedValue(
  value: string,
  variables: RequestVariableMap,
  label: string,
) {
  const resolved = resolveRequestTemplate(value, variables, label)

  if (!resolved.trim()) {
    throw new Error(`${label} 不能为空`)
  }

  return resolved
}

function requireResolvedName(
  value: string,
  variables: RequestVariableMap,
  label: string,
) {
  return requireResolvedValue(value, variables, label).trim()
}

function resolveBearerEntry(
  auth: Extract<ApiRequestAuth, { type: 'bearer' }>,
  variables: RequestVariableMap,
) {
  const token = requireResolvedValue(auth.token, variables, 'Bearer Token')

  return {
    target: 'header',
    name: 'Authorization',
    value: `Bearer ${token}`,
  } satisfies RequestAuthEntry
}

function resolveBasicEntry(
  auth: Extract<ApiRequestAuth, { type: 'basic' }>,
  variables: RequestVariableMap,
) {
  const username = requireResolvedValue(auth.username, variables, 'Basic 用户名')
  const password = resolveRequestTemplate(auth.password, variables, 'Basic 密码')
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')

  return {
    target: 'header',
    name: 'Authorization',
    value: `Basic ${encoded}`,
  } satisfies RequestAuthEntry
}

function resolveApiKeyEntry(
  auth: Extract<ApiRequestAuth, { type: 'apiKey' }>,
  variables: RequestVariableMap,
) {
  const name = requireResolvedName(auth.key, variables, 'API Key 名称')
  const value = requireResolvedValue(auth.value, variables, `API Key“${name}”`)

  return {
    target: auth.target,
    name,
    value,
  } satisfies RequestAuthEntry
}

function replaceEntry(
  entries: ApiRunHeader[],
  entry: RequestAuthEntry | undefined,
  target: ApiRequestAuthTarget,
  normalizeName: NameNormalizer = EXACT_NAME,
) {
  if (!entry || entry.target !== target) {
    return entries
  }

  const filtered = entries.filter(({ name }) => normalizeName(name) !== normalizeName(entry.name))

  return [...filtered, { name: entry.name, value: entry.value }]
}

export function resolveRequestAuthEntry(payload: {
  apiDetails: ApiDetails
  variables: RequestVariableMap
}) {
  const auth = payload.apiDetails.auth

  if (!auth || auth.type === 'none') {
    return undefined
  }

  if (auth.type === 'bearer') {
    return resolveBearerEntry(auth, payload.variables)
  }

  if (auth.type === 'basic') {
    return resolveBasicEntry(auth, payload.variables)
  }

  return resolveApiKeyEntry(auth, payload.variables)
}

export function applyRequestAuthHeader(headers: Headers, entry: RequestAuthEntry | undefined) {
  if (!entry || entry.target !== 'header') {
    return
  }

  headers.set(entry.name, entry.value)
}

export function applyRequestAuthQuery(url: URL, entry: RequestAuthEntry | undefined) {
  if (!entry || entry.target !== 'query') {
    return
  }

  url.searchParams.delete(entry.name)
  url.searchParams.append(entry.name, entry.value)
}

export function applyRequestAuthCookieEntries(
  entries: ApiRunHeader[],
  entry: RequestAuthEntry | undefined,
) {
  return replaceEntry(entries, entry, 'cookie')
}

export function applyRequestAuthHeaderEntries(
  entries: ApiRunHeader[],
  entry: RequestAuthEntry | undefined,
) {
  return replaceEntry(entries, entry, 'header', HEADER_NAME)
}
