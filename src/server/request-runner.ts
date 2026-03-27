import type { ApiDetails, ApiRunResult, ProjectEnvironmentConfig } from '@/types'

import { buildRequestBody } from './request-runner-body'
import {
  applyRequestAuthCookieEntries,
  resolveRequestAuthEntry,
} from './request-runner-auth'
import {
  buildHeaders,
  buildRequestUrl,
  normalizeHeaders,
} from './request-runner-builders'
import { resolveMergedCookieEntries } from './request-runner-merged-parameters'
import type { RequestVariableMap } from './request-runtime-variables'

function normalizeEntries(entries: Array<[string, string]>) {
  return entries.map(([name, value]) => ({ name, value }))
}

function getRequestBodyResult(body: BodyInit | undefined) {
  if (!body) {
    return { requestBodyParameters: [], requestBodyText: undefined }
  }

  if (typeof body === 'string') {
    return { requestBodyParameters: [], requestBodyText: body }
  }

  if (body instanceof URLSearchParams) {
    return {
      requestBodyParameters: normalizeEntries(Array.from(body.entries())),
      requestBodyText: undefined,
    }
  }

  if (body instanceof FormData) {
    return {
      requestBodyParameters: Array.from(body.entries()).map(([name, value]) => ({
        name,
        value: typeof value === 'string' ? value : value.name,
      })),
      requestBodyText: undefined,
    }
  }

  return { requestBodyParameters: [], requestBodyText: undefined }
}

export async function runApiRequest(payload: {
  apiDetails: ApiDetails
  baseUrlOverride?: string
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables?: RequestVariableMap
}) {
  const variables = payload.variables ?? {}
  const authEntry = resolveRequestAuthEntry({
    apiDetails: payload.apiDetails,
    variables,
  })
  const headers = buildHeaders({
    apiDetails: payload.apiDetails,
    globalParameters: payload.globalParameters,
    variables,
  })
  const url = buildRequestUrl({
    apiDetails: payload.apiDetails,
    baseUrlOverride: payload.baseUrlOverride,
    globalParameters: payload.globalParameters,
    variables,
  })
  const body = buildRequestBody({
    apiDetails: payload.apiDetails,
    globalParameters: payload.globalParameters,
    headers,
    variables,
  })
  const startedAt = Date.now()
  const response = await fetch(url, {
    method: payload.apiDetails.method,
    headers,
    body,
  })
  const responseBody = await response.text()
  const { requestBodyParameters, requestBodyText } = getRequestBodyResult(body)

  return {
    url: url.toString(),
    method: payload.apiDetails.method,
    status: response.status,
    statusText: response.statusText,
    durationMs: Date.now() - startedAt,
    requestHeaders: normalizeHeaders(headers),
    requestQuery: normalizeEntries(Array.from(url.searchParams.entries())),
    requestCookie: applyRequestAuthCookieEntries(
      resolveMergedCookieEntries({
        apiDetails: payload.apiDetails,
        globalParameters: payload.globalParameters,
        variables,
      }),
      authEntry,
    ),
    requestBodyParameters,
    requestBodyText,
    headers: normalizeHeaders(response.headers),
    contentType: response.headers.get('content-type') ?? undefined,
    body: responseBody || undefined,
  } satisfies ApiRunResult
}
