import type { ApiEnvironmentValue, ProjectEnvironmentConfig } from '@/types'
import { GLOBAL_PARAMETER_SECTIONS } from '@/types'

export type RequestVariableMap = Record<string, string>

const TEMPLATE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g
const UNRESOLVED_TEMPLATE_REGEX = /\{\{\s*[^{}]+?\s*\}\}/

function getEnvironmentValue(item: ApiEnvironmentValue) {
  if (item.localValue !== undefined && item.localValue !== '') {
    return item.localValue
  }

  if (item.remoteValue !== undefined && item.remoteValue !== '') {
    return item.remoteValue
  }

  return undefined
}

function appendVariableValues(
  target: RequestVariableMap,
  values: ApiEnvironmentValue[] | undefined,
) {
  values?.forEach((item) => {
    if (!item.name) {
      return
    }

    const value = getEnvironmentValue(item)

    if (value !== undefined) {
      target[item.name] = value
    }
  })
}

function appendGroupedParameterValues(
  target: RequestVariableMap,
  config: ProjectEnvironmentConfig['globalParameters'],
) {
  GLOBAL_PARAMETER_SECTIONS.forEach((section) => {
    appendVariableValues(target, config[section])
  })
}

export function resolveEnvironmentValue(
  item: ApiEnvironmentValue,
  variables: RequestVariableMap,
  label: string,
) {
  const value = getEnvironmentValue(item)

  if (value === undefined) {
    throw new Error(`${label} 未配置值`)
  }

  return resolveRequestTemplate(value, variables, label)
}

export function buildRequestVariableMap(payload: {
  config: ProjectEnvironmentConfig
  environmentId?: string
}) {
  const { config, environmentId } = payload
  const variables: RequestVariableMap = {}

  appendVariableValues(variables, config.globalVariables)
  appendGroupedParameterValues(variables, config.globalParameters)
  appendVariableValues(variables, config.legacyGlobalParameters)
  appendVariableValues(variables, config.vaultSecrets)

  if (!environmentId) {
    return variables
  }

  const environment = config.environments.find(({ id }) => id === environmentId)

  if (!environment) {
    throw new Error(`环境不存在：${environmentId}`)
  }

  appendVariableValues(variables, environment.variables)

  return variables
}

export function assertNoRequestTemplate(value: string, label: string) {
  if (UNRESOLVED_TEMPLATE_REGEX.test(value)) {
    throw new Error(`${label} 包含未解析的环境变量：${value}`)
  }
}

export function resolveRequestTemplate(
  value: string,
  variables: RequestVariableMap,
  label: string,
) {
  const resolved = value.replace(TEMPLATE_REGEX, (match, name: string) => {
    return variables[name.trim()] ?? match
  })

  assertNoRequestTemplate(resolved, label)

  return resolved
}

export function resolveRequestTemplateList(
  values: string[],
  variables: RequestVariableMap,
  label: string,
) {
  return values.map((value, index) => {
    return resolveRequestTemplate(value, variables, `${label} #${index + 1}`)
  })
}
