import {
  DEFAULT_ENVIRONMENT_MODULE_NAME,
  EMPTY_PROJECT_ENVIRONMENT_CONFIG,
  createGlobalParameters,
} from '@/project-environment-utils'
import type {
  ApiEnvironment,
  ApiEnvironmentBaseUrl,
  ApiEnvironmentGlobalParameters,
  ApiEnvironmentValue,
  ProjectEnvironmentConfig,
} from '@/types'

import { getProjectMetaValue, setProjectMetaValue } from './db/meta-repo'

const PROJECT_ENVIRONMENTS_META_KEY = 'project.environments'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseHttpUrl(value: string, label: string) {
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

  return url.toString().replace(/\/$/, '')
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEnvironmentValueList(input: unknown, label: string) {
  if (!Array.isArray(input)) {
    throw new Error(`${label} 必须是数组`)
  }

  const idSet = new Set<string>()

  return input.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${label} 第 ${index + 1} 项无效`)
    }

    const normalized = {
      id: normalizeString(item.id),
      name: normalizeString(item.name),
      remoteValue: typeof item.remoteValue === 'string' ? item.remoteValue : '',
      localValue: typeof item.localValue === 'string' ? item.localValue : '',
    } satisfies ApiEnvironmentValue

    if (!normalized.id) {
      throw new Error(`${label} 第 ${index + 1} 项缺少 id`)
    }

    if (!normalized.name) {
      throw new Error(`${label} 第 ${index + 1} 项名称不能为空`)
    }

    if (idSet.has(normalized.id)) {
      throw new Error(`${label}“${normalized.name}”的 id 重复`)
    }

    idSet.add(normalized.id)
    return normalized
  })
}

function normalizeEnvironmentBaseUrls(input: unknown, environmentName: string, legacyUrl: string) {
  const source = Array.isArray(input)
    ? input
    : legacyUrl
      ? [{ id: `${environmentName}-default`, name: DEFAULT_ENVIRONMENT_MODULE_NAME, url: legacyUrl }]
      : []

  if (source.length === 0) {
    throw new Error(`环境“${environmentName}”至少需要一个前置 URL`)
  }

  const idSet = new Set<string>()

  return source.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`环境“${environmentName}”的前置 URL #${index + 1} 配置无效`)
    }

    const id = normalizeString(item.id)
    const name = normalizeString(item.name)
    const url = normalizeString(item.url)

    if (!id) {
      throw new Error(`环境“${environmentName}”的前置 URL #${index + 1} 缺少 id`)
    }

    if (!name) {
      throw new Error(`环境“${environmentName}”的前置 URL #${index + 1} 名称不能为空`)
    }

    if (!url) {
      throw new Error(`环境“${environmentName}”的前置 URL“${name}”不能为空`)
    }

    if (idSet.has(id)) {
      throw new Error(`环境“${environmentName}”的前置 URL“${name}”重复`)
    }

    idSet.add(id)

    return {
      id,
      name,
      url: parseHttpUrl(url, `环境“${environmentName}”的前置 URL“${name}”`),
    } satisfies ApiEnvironmentBaseUrl
  })
}

function normalizeEnvironment(item: unknown, index: number) {
  if (!isRecord(item)) {
    throw new Error(`环境 #${index + 1} 配置无效`)
  }

  const id = normalizeString(item.id)
  const name = normalizeString(item.name)
  const legacyUrl = normalizeString(item.url)

  if (!id) {
    throw new Error(`环境 #${index + 1} 缺少 id`)
  }

  if (!name) {
    throw new Error(`环境 #${index + 1} 名称不能为空`)
  }

  const baseUrls = normalizeEnvironmentBaseUrls(item.baseUrls, name, legacyUrl)

  return {
    id,
    name,
    url: baseUrls[0].url,
    shared: typeof item.shared === 'boolean' ? item.shared : true,
    baseUrls,
    variables: normalizeEnvironmentValueList(item.variables ?? [], `环境“${name}”变量`),
  } satisfies ApiEnvironment
}

function normalizeEnvironmentList(input: unknown) {
  if (!Array.isArray(input)) {
    throw new Error('环境配置必须是数组')
  }

  const idSet = new Set<string>()

  return input.map((item, index) => {
    const environment = normalizeEnvironment(item, index)

    if (idSet.has(environment.id)) {
      throw new Error(`环境“${environment.name}”的 id 重复`)
    }

    idSet.add(environment.id)
    return environment
  })
}

function normalizeGlobalParameters(input: unknown): ApiEnvironmentGlobalParameters {
  if (!isRecord(input)) {
    throw new Error('全局参数必须是对象')
  }

  return {
    header: normalizeEnvironmentValueList(input.header ?? [], '全局 Header 参数'),
    cookie: normalizeEnvironmentValueList(input.cookie ?? [], '全局 Cookie 参数'),
    query: normalizeEnvironmentValueList(input.query ?? [], '全局 Query 参数'),
    body: normalizeEnvironmentValueList(input.body ?? [], '全局 Body 参数'),
  }
}

export function normalizeProjectEnvironmentConfig(input: unknown): ProjectEnvironmentConfig {
  if (Array.isArray(input)) {
    return {
      ...EMPTY_PROJECT_ENVIRONMENT_CONFIG,
      environments: normalizeEnvironmentList(input),
    }
  }

  if (!isRecord(input)) {
    throw new Error('环境配置必须是对象')
  }

  const legacyGlobalParameters = Array.isArray(input.globalParameters)
    ? normalizeEnvironmentValueList(input.globalParameters, '全局参数')
    : normalizeEnvironmentValueList(input.legacyGlobalParameters ?? [], '兼容全局参数')

  const globalParameters = Array.isArray(input.globalParameters)
    ? createGlobalParameters()
    : normalizeGlobalParameters(input.globalParameters ?? createGlobalParameters())

  return {
    globalVariables: normalizeEnvironmentValueList(input.globalVariables ?? [], '全局变量'),
    globalParameters,
    legacyGlobalParameters,
    vaultSecrets: normalizeEnvironmentValueList(input.vaultSecrets ?? [], 'Vault Secrets'),
    environments: normalizeEnvironmentList(input.environments ?? []),
  }
}

export function listProjectEnvironmentConfig(projectId: string) {
  const raw = getProjectMetaValue({
    projectId,
    key: PROJECT_ENVIRONMENTS_META_KEY,
  })

  if (!raw) {
    return EMPTY_PROJECT_ENVIRONMENT_CONFIG
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw new Error('项目环境配置已损坏，无法解析')
  }

  return normalizeProjectEnvironmentConfig(parsed)
}

export function listProjectEnvironments(projectId: string) {
  return listProjectEnvironmentConfig(projectId).environments
}

export function saveProjectEnvironmentConfig(projectId: string, config: unknown) {
  const normalized = normalizeProjectEnvironmentConfig(config)

  setProjectMetaValue({
    projectId,
    key: PROJECT_ENVIRONMENTS_META_KEY,
    value: JSON.stringify(normalized),
  })

  return normalized
}
