import type {
  ApiDetails,
  ApiRunHeader,
  Parameter,
  ProjectEnvironmentConfig,
} from '@/types'

import {
  applyRequestAuthCookieEntries,
  applyRequestAuthHeader,
  applyRequestAuthQuery,
  resolveRequestAuthEntry,
} from './request-runner-auth'
import { resolveParameterValues } from './request-runner-parameters'
import {
  resolveMergedCookieEntries,
  resolveMergedHeaderEntries,
  resolveMergedQueryEntries,
} from './request-runner-merged-parameters'
import {
  assertNoRequestTemplate,
  type RequestVariableMap,
  resolveRequestTemplate,
} from './request-runtime-variables'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, '')
}

function assertHttpUrl(value: string, label: string) {
  let url: URL

  try {
    url = new URL(value)
  }
  catch {
    throw new Error(`${label} 不是合法的 URL`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} 仅支持 http 或 https`)
  }

  return url
}

function splitPathInput(path: string) {
  const [pathWithQuery] = path.split('#')
  const [pathname, search = ''] = pathWithQuery.split('?')

  return {
    pathname: pathname || '/',
    search,
  }
}

function replacePathParameters(
  pathname: string,
  params: Parameter[] | undefined,
  variables: RequestVariableMap,
) {
  let nextPath = pathname
  const matches = pathname.match(/\{([^{}]+)\}|:([^/]+)/g) ?? []

  matches.forEach((token) => {
    const paramName = token.startsWith('{') ? token.slice(1, -1) : token.slice(1)
    const param = params?.find((item) => item.name === paramName)
    const [value] = resolveParameterValues({
      param,
      variables,
      label: `路径参数“${paramName}”`,
      required: true,
    })
    const encodedValue = encodeURIComponent(value)

    nextPath = nextPath.replace(new RegExp(`\\{${escapeRegExp(paramName)}\\}`, 'g'), encodedValue)
    nextPath = nextPath.replace(new RegExp(`:${escapeRegExp(paramName)}(?=/|$)`, 'g'), encodedValue)
  })

  if (/\{[^{}]+\}|:[^/]+/.test(nextPath)) {
    throw new Error(`路径参数未全部填充：${nextPath}`)
  }

  return nextPath
}

function buildRelativeUrl(baseUrl: string, path: string) {
  const base = assertHttpUrl(baseUrl, '前置 URL')
  const basePath = base.pathname === '/' ? '' : trimTrailingSlash(base.pathname)
  const requestPath = trimLeadingSlash(path)

  base.pathname = [basePath, requestPath].filter(Boolean).join('/').replace(/^([^/])/, '/$1')
  base.hash = ''

  return base
}

export function buildRequestUrl(payload: {
  apiDetails: ApiDetails
  baseUrlOverride?: string
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  const { apiDetails, baseUrlOverride, globalParameters, variables } = payload
  const rawPath = apiDetails.path?.trim()

  if (!rawPath) {
    throw new Error('接口路径为空，无法运行')
  }

  const sourcePath = resolveRequestTemplate(rawPath, variables, '接口路径')
  const baseUrl = (baseUrlOverride ?? apiDetails.serverUrl ?? '').trim()
  let url: URL

  if (ABSOLUTE_URL_REGEX.test(sourcePath)) {
    url = assertHttpUrl(sourcePath, '接口路径')
    url.pathname = replacePathParameters(url.pathname, apiDetails.parameters?.path, variables)
  }
  else {
    const { pathname, search } = splitPathInput(sourcePath)
    const replacedPath = replacePathParameters(pathname, apiDetails.parameters?.path, variables)
    const resolvedBaseUrl = resolveRequestTemplate(baseUrl, variables, '前置 URL')
    url = buildRelativeUrl(resolvedBaseUrl, replacedPath)

    if (search) {
      url.search = search
    }
  }

  resolveMergedQueryEntries({ apiDetails, globalParameters, variables }).forEach(({ name, value }) => {
    url.searchParams.append(name, value)
  })
  applyRequestAuthQuery(url, resolveRequestAuthEntry({ apiDetails, variables }))

  assertNoRequestTemplate(url.toString(), '请求地址')

  return url
}

export function buildHeaders(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  const { apiDetails, globalParameters, variables } = payload
  const headers = new Headers()
  const authEntry = resolveRequestAuthEntry({ apiDetails, variables })

  resolveMergedHeaderEntries({ apiDetails, globalParameters, variables }).forEach(({ name, value }) => {
    headers.append(name, value)
  })
  applyRequestAuthHeader(headers, authEntry)

  const cookiePairs = applyRequestAuthCookieEntries(
    resolveMergedCookieEntries({ apiDetails, globalParameters, variables }),
    authEntry,
  )
    .map(({ name, value }) => `${name}=${value}`)

  if (cookiePairs.length > 0) {
    headers.set('Cookie', cookiePairs.join('; '))
  }

  return headers
}

export function normalizeHeaders(headers: Headers) {
  return Array.from(headers.entries())
    .map(([name, value]) => ({ name, value }) satisfies ApiRunHeader)
    .sort((left, right) => left.name.localeCompare(right.name))
}
