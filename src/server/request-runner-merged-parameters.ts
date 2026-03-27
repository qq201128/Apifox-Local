import type { ApiDetails, ApiEnvironmentValue, ApiRunHeader, Parameter, ProjectEnvironmentConfig } from '@/types'

import { resolveParameterValues } from './request-runner-parameters'
import {
  type RequestVariableMap,
  resolveEnvironmentValue,
  resolveRequestTemplate,
} from './request-runtime-variables'

type NameNormalizer = (name: string) => string

const EXACT_NAME: NameNormalizer = name => name
const HEADER_NAME: NameNormalizer = name => name.toLowerCase()

function resolveGlobalEntries(payload: {
  params: ApiEnvironmentValue[] | undefined
  variables: RequestVariableMap
  nameLabel: string
  valueLabel: string
}) {
  const { params, variables, nameLabel, valueLabel } = payload

  return params?.flatMap((param, index) => {
    if (!param.name) {
      return []
    }

    const name = resolveRequestTemplate(param.name, variables, `${nameLabel} #${index + 1}`)
    const value = resolveEnvironmentValue(param, variables, `${valueLabel}“${name}”`)

    return [{ name, value }] satisfies ApiRunHeader[]
  }) ?? []
}

function resolveInterfaceEntries(payload: {
  params: Parameter[] | undefined
  variables: RequestVariableMap
  nameLabel: string
  valueLabel: string
}) {
  const { params, variables, nameLabel, valueLabel } = payload

  return params?.flatMap((param, index) => {
    if (!param.name || param.enable === false) {
      return []
    }

    const name = resolveRequestTemplate(param.name, variables, `${nameLabel} #${index + 1}`)
    const values = resolveParameterValues({
      param,
      variables,
      label: `${valueLabel}“${name}”`,
    })

    return values.map((value) => ({ name, value }) satisfies ApiRunHeader)
  }) ?? []
}

function mergeEntries(payload: {
  globalParams: ApiEnvironmentValue[] | undefined
  params: Parameter[] | undefined
  variables: RequestVariableMap
  globalNameLabel: string
  globalValueLabel: string
  nameLabel: string
  valueLabel: string
  normalizeName?: NameNormalizer
}) {
  const {
    globalParams,
    params,
    variables,
    globalNameLabel,
    globalValueLabel,
    nameLabel,
    valueLabel,
    normalizeName = EXACT_NAME,
  } = payload

  const interfaceEntries = resolveInterfaceEntries({
    params,
    variables,
    nameLabel,
    valueLabel,
  })
  const overriddenNames = new Set(interfaceEntries.map(({ name }) => normalizeName(name)))
  const globalEntries = resolveGlobalEntries({
    params: globalParams,
    variables,
    nameLabel: globalNameLabel,
    valueLabel: globalValueLabel,
  }).filter(({ name }) => !overriddenNames.has(normalizeName(name)))

  return [...globalEntries, ...interfaceEntries]
}

export function resolveMergedQueryEntries(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  return mergeEntries({
    globalParams: payload.globalParameters?.query,
    params: payload.apiDetails.parameters?.query,
    variables: payload.variables,
    globalNameLabel: '全局 Query 参数名',
    globalValueLabel: '全局 Query 参数',
    nameLabel: 'Query 参数名',
    valueLabel: 'Query 参数',
  })
}

export function resolveMergedHeaderEntries(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  return mergeEntries({
    globalParams: payload.globalParameters?.header,
    params: payload.apiDetails.parameters?.header,
    variables: payload.variables,
    globalNameLabel: '全局请求头名称',
    globalValueLabel: '全局请求头',
    nameLabel: '请求头名称',
    valueLabel: '请求头',
    normalizeName: HEADER_NAME,
  })
}

export function resolveMergedCookieEntries(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  return mergeEntries({
    globalParams: payload.globalParameters?.cookie,
    params: payload.apiDetails.parameters?.cookie,
    variables: payload.variables,
    globalNameLabel: '全局 Cookie 名称',
    globalValueLabel: '全局 Cookie',
    nameLabel: 'Cookie 名称',
    valueLabel: 'Cookie',
  })
}

export function resolveMergedBodyEntries(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  variables: RequestVariableMap
}) {
  return mergeEntries({
    globalParams: payload.globalParameters?.body,
    params: payload.apiDetails.requestBody?.parameters,
    variables: payload.variables,
    globalNameLabel: '全局 Body 字段名',
    globalValueLabel: '全局 Body 字段',
    nameLabel: 'Body 字段名',
    valueLabel: 'Body 字段',
  })
}
