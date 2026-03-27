export type PostmanRecord = Record<string, unknown>

export function isPostmanRecord(value: unknown): value is PostmanRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getPostmanText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function getPostmanDescription(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (isPostmanRecord(value) && typeof value.content === 'string') {
    return value.content
  }

  return undefined
}

export function getPostmanRecordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isPostmanRecord) : []
}

export function toPostmanExampleText(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.join(',')
  }

  return undefined
}

export function parsePostmanJsonText(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return undefined
  }
}
