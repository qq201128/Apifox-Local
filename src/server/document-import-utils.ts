import * as yaml from 'yaml'

import { ContentType } from '@/enums'

function getYamlParse() {
  const parser = (yaml as { parse?: (input: string) => unknown }).parse
    ?? (yaml as { default?: { parse?: (input: string) => unknown } }).default?.parse

  if (typeof parser !== 'function') {
    throw new Error('YAML 解析器不可用，请检查 yaml 依赖加载')
  }

  return parser
}

export function parseDocumentFromFile(content: string, filename: string) {
  const parseYaml = getYamlParse()

  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    return parseYaml(content) as Record<string, unknown>
  }

  try {
    return JSON.parse(content) as Record<string, unknown>
  }
  catch {
    return parseYaml(content) as Record<string, unknown>
  }
}

export function mapContentType(value?: string) {
  if (!value) {
    return undefined
  }

  if (value.includes('application/json')) {
    return ContentType.JSON
  }

  if (value.includes('application/xml') || value.includes('text/xml')) {
    return ContentType.XML
  }

  if (value.includes('text/html')) {
    return ContentType.HTML
  }

  if (value.includes('application/octet-stream')) {
    return ContentType.Binary
  }

  return ContentType.Raw
}

export function toParamExample(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }

  return undefined
}
