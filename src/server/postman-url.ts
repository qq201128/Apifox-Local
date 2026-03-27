import {
  getPostmanRecordList,
  getPostmanText,
  toPostmanExampleText,
} from './postman-shared'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i
const TEMPLATE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g
const EXACT_TEMPLATE_REGEX = /^\{\{\s*([^{}]+?)\s*\}\}$/

export type PostmanVariableMap = Record<string, string>

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function ensureLeadingSlash(value?: string) {
  if (!value) {
    return undefined
  }

  return value.startsWith('/') ? value : `/${value}`
}

function stripSearchAndHash(value: string) {
  return value.replace(/[?#].*$/, '')
}

function getTemplateName(value: string) {
  const match = value.trim().match(EXACT_TEMPLATE_REGEX)
  return match?.[1]?.trim()
}

function getVariableKey(item: Record<string, unknown>) {
  return getPostmanText(item.key) ?? getPostmanText(item.id)
}

function getPathSegments(pathValue: unknown) {
  if (Array.isArray(pathValue)) {
    return pathValue.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }

  const path = getPostmanText(pathValue)

  return path
    ? stripSearchAndHash(path).split('/').filter(Boolean)
    : []
}

function toServerUrl(host: string, protocol?: string) {
  if (!host) {
    return undefined
  }

  if (ABSOLUTE_URL_REGEX.test(host)) {
    return trimTrailingSlash(host)
  }

  if (protocol) {
    return trimTrailingSlash(`${protocol}://${host}`)
  }

  return trimTrailingSlash(host)
}

function resolvePathSegment(
  segment: string,
  pathVariableNames: Set<string>,
  variables: PostmanVariableMap,
) {
  if (segment.startsWith(':') && segment.length > 1) {
    return `{${segment.slice(1)}}`
  }

  const templateName = getTemplateName(segment)

  if (templateName && pathVariableNames.has(templateName)) {
    return `{${templateName}}`
  }

  return resolvePostmanTemplate(segment, variables)
}

function resolveHostValue(hostValue: unknown, protocol: string | undefined, variables: PostmanVariableMap) {
  const hostParts = Array.isArray(hostValue)
    ? hostValue.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []

  if (hostParts.length > 0) {
    const resolvedHost = hostParts
      .map((part) => resolvePostmanTemplate(part, variables))
      .join('.')

    return toServerUrl(resolvedHost, protocol)
  }

  const host = getPostmanText(hostValue)

  return host
    ? toServerUrl(resolvePostmanTemplate(host, variables), protocol)
    : undefined
}

function resolveStringUrl(value: string, variables: PostmanVariableMap) {
  const resolved = resolvePostmanTemplate(value, variables)

  if (ABSOLUTE_URL_REGEX.test(resolved)) {
    const url = new URL(resolved)
    return {
      serverUrl: trimTrailingSlash(url.origin),
      path: ensureLeadingSlash(stripSearchAndHash(`${url.pathname}${url.search}`)),
    }
  }

  const prefixedTemplate = resolved.match(/^(\{\{[^{}]+\}\})(\/.*)?$/)

  if (prefixedTemplate) {
    return {
      serverUrl: trimTrailingSlash(prefixedTemplate[1]),
      path: ensureLeadingSlash(stripSearchAndHash(prefixedTemplate[2] ?? '')),
    }
  }

  return {
    path: ensureLeadingSlash(stripSearchAndHash(resolved)),
  }
}

export function buildPostmanVariableMap(source: unknown) {
  return getPostmanRecordList(source).reduce<PostmanVariableMap>((acc, item) => {
    const key = getVariableKey(item)
    const value = toPostmanExampleText(item.value)

    if (!key || value === undefined) {
      return acc
    }

    acc[key] = value
    return acc
  }, {})
}

export function mergePostmanVariableMaps(
  parentVariables: PostmanVariableMap,
  currentVariables: PostmanVariableMap,
) {
  return {
    ...parentVariables,
    ...currentVariables,
  }
}

export function resolvePostmanTemplate(value: string, variables: PostmanVariableMap) {
  return value.replace(TEMPLATE_REGEX, (match, name: string) => {
    return variables[name.trim()] ?? match
  })
}

export function resolvePostmanRequestTarget(url: unknown, variables: PostmanVariableMap) {
  if (typeof url === 'string') {
    return resolveStringUrl(url, variables)
  }

  if (!url || typeof url !== 'object' || Array.isArray(url)) {
    return {}
  }

  const urlRecord = url as Record<string, unknown>
  const protocol = getPostmanText(urlRecord.protocol)
  const pathVariableNames = new Set(
    getPostmanRecordList(urlRecord.variable)
      .map(getVariableKey)
      .filter((item): item is string => Boolean(item)),
  )
  const pathSegments = getPathSegments(urlRecord.path).map((segment) => {
    return resolvePathSegment(segment, pathVariableNames, variables)
  })
  const path = ensureLeadingSlash(pathSegments.join('/'))
  const serverUrl = resolveHostValue(urlRecord.host, protocol, variables)

  if (serverUrl || path) {
    return { path, serverUrl }
  }

  const raw = getPostmanText(urlRecord.raw)

  return raw ? resolveStringUrl(raw, variables) : {}
}

export function resolvePostmanPathVariableExample(value: unknown, variables: PostmanVariableMap) {
  const example = toPostmanExampleText(value)
  return example ? resolvePostmanTemplate(example, variables) : undefined
}

export function resolvePostmanTemplateValue(value: unknown, variables: PostmanVariableMap) {
  const text = toPostmanExampleText(value)

  return text
    ? resolvePostmanTemplate(text, variables)
    : undefined
}
