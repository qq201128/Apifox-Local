import { type JsonSchema, SchemaType } from '@/components/JsonSchema'
import { BodyType } from '@/enums'
import type { ApiDetails, ProjectEnvironmentConfig } from '@/types'

import { resolveMergedBodyEntries } from './request-runner-merged-parameters'
import { type RequestVariableMap, resolveRequestTemplate } from './request-runtime-variables'

function buildJsonExample(schema?: JsonSchema): unknown {
  if (!schema) {
    return {}
  }

  if (schema.type === SchemaType.String) {
    return 'string'
  }

  if (schema.type === SchemaType.Integer || schema.type === SchemaType.Number) {
    return 0
  }

  if (schema.type === SchemaType.Boolean) {
    return true
  }

  if (schema.type === SchemaType.Null) {
    return null
  }

  if (schema.type === SchemaType.Refer) {
    return {}
  }

  if (schema.type === SchemaType.Array) {
    return [buildJsonExample(schema.items)]
  }

  const objectSchema = schema as Extract<JsonSchema, { type: SchemaType.Object }>
  const output: Record<string, unknown> = {}

  objectSchema.properties?.forEach((field, index) => {
    const fieldName = field.name ?? `field_${index + 1}`
    output[fieldName] = buildJsonExample(field)
  })

  return output
}

function setDefaultContentType(headers: Headers, value: string) {
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', value)
  }
}

function buildFormDataBody(
  apiDetails: ApiDetails,
  variables: RequestVariableMap,
  globalParameters?: ProjectEnvironmentConfig['globalParameters'],
) {
  const formData = new FormData()
  resolveMergedBodyEntries({
    apiDetails,
    globalParameters,
    variables,
  }).forEach(({ name, value }) => {
    formData.append(name, value)
  })

  return formData
}

function buildUrlEncodedBody(
  apiDetails: ApiDetails,
  headers: Headers,
  variables: RequestVariableMap,
  globalParameters?: ProjectEnvironmentConfig['globalParameters'],
) {
  const form = new URLSearchParams()

  resolveMergedBodyEntries({
    apiDetails,
    globalParameters,
    variables,
  }).forEach(({ name, value }) => {
    form.append(name, value)
  })

  setDefaultContentType(headers, BodyType.UrlEncoded)

  return form
}

function buildRawBody(
  apiDetails: ApiDetails,
  headers: Headers,
  variables: RequestVariableMap,
) {
  const requestBody = apiDetails.requestBody
  const rawText = requestBody?.rawText?.trim()

  if (requestBody?.type === BodyType.Json) {
    const payload = rawText && rawText.length > 0
      ? rawText
      : JSON.stringify(buildJsonExample(requestBody.jsonSchema), null, 2)
    setDefaultContentType(headers, BodyType.Json)

    return resolveRequestTemplate(payload, variables, 'JSON Body')
  }

  if (requestBody?.type === BodyType.Xml) {
    if (!rawText) {
      throw new Error('XML Body 缺少原始文本，无法运行')
    }

    setDefaultContentType(headers, BodyType.Xml)

    return resolveRequestTemplate(rawText, variables, 'XML Body')
  }

  if (!rawText) {
    throw new Error('Raw Body 缺少原始文本，无法运行')
  }

  setDefaultContentType(headers, BodyType.Raw)

  return resolveRequestTemplate(rawText, variables, 'Raw Body')
}

export function buildRequestBody(payload: {
  apiDetails: ApiDetails
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  headers: Headers
  variables: RequestVariableMap
}) {
  const { apiDetails, globalParameters, headers, variables } = payload
  const requestBody = apiDetails.requestBody

  if (!requestBody || requestBody.type === BodyType.None) {
    return undefined
  }

  if (requestBody.type === BodyType.FormData) {
    return buildFormDataBody(apiDetails, variables, globalParameters)
  }

  if (requestBody.type === BodyType.UrlEncoded) {
    return buildUrlEncodedBody(apiDetails, headers, variables, globalParameters)
  }

  if (requestBody.type === BodyType.Binary) {
    throw new Error('Binary Body 暂不支持运行')
  }

  return buildRawBody(apiDetails, headers, variables)
}
