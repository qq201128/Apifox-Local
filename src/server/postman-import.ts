import { randomUUID } from 'node:crypto'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ApiStatus, BodyType, ContentType, HttpMethod, MenuItemType, ParamType } from '@/enums'
import type { ApiDetails, Parameter } from '@/types'

import { mapContentType, parseDocumentFromFile, stripImportedTimestampSuffix } from './document-import-utils'
import { inferJsonSchemaFromExample } from './json-schema-from-example'
import {
  buildPostmanVariableMap,
  mergePostmanVariableMaps,
  resolvePostmanPathVariableExample,
  resolvePostmanRequestTarget,
  resolvePostmanTemplate,
  resolvePostmanTemplateValue,
  type PostmanVariableMap,
} from './postman-url'
import {
  getPostmanDescription,
  getPostmanRecordList,
  getPostmanText,
  isPostmanRecord,
  parsePostmanJsonText,
  type PostmanRecord,
} from './postman-shared'

const DEFAULT_COLLECTION_NAME = 'Postman Collection'
const DEFAULT_FOLDER_NAME = '未命名目录'
const DEFAULT_REQUEST_NAME = '未命名请求'
const HTTP_METHOD_VALUES = new Set(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'TRACE'])
const POSTMAN_COLLECTION_SCHEMA_MARKER = 'schema.getpostman.com/json/collection/'

type ResponseExample = NonNullable<ApiDetails['responseExamples']>[number]

function toHttpMethod(value: unknown): HttpMethod {
  const upper = typeof value === 'string' ? value.toUpperCase() : ''

  return HTTP_METHOD_VALUES.has(upper)
    ? upper as HttpMethod
    : HttpMethod.Get
}

function createParameter(props: {
  description?: string
  enable?: boolean
  example?: string
  name: string
  required?: boolean
}) {
  return {
    id: randomUUID(),
    name: props.name,
    description: props.description ?? '',
    required: props.required === true,
    enable: props.enable !== false,
    type: ParamType.String,
    example: props.example,
  } as Parameter
}

function toParameterList(
  items: PostmanRecord[],
  options: {
    required?: boolean
    variables: PostmanVariableMap
    pathVariableNames?: Set<string>
  },
) {
  return items.reduce<Parameter[]>((acc, item) => {
    const rawName = getPostmanText(item.key)

    if (!rawName) {
      return acc
    }

    const example = options.pathVariableNames?.has(rawName)
      ? resolvePostmanPathVariableExample(item.value ?? item.src, options.variables)
      : resolvePostmanTemplateValue(item.value ?? item.src, options.variables)

    acc.push(createParameter({
      name: resolvePostmanTemplate(rawName, options.variables),
      description: getPostmanDescription(item.description),
      enable: item.disabled !== true,
      example,
      required: options.required,
    }))

    return acc
  }, [])
}

function getRawLanguage(body: PostmanRecord) {
  const options = isPostmanRecord(body.options) ? body.options : undefined
  const rawOptions = options && isPostmanRecord(options.raw) ? options.raw : undefined
  return typeof rawOptions?.language === 'string' ? rawOptions.language.toLowerCase() : undefined
}

function buildRawRequestBody(body: PostmanRecord, variables: PostmanVariableMap): ApiDetails['requestBody'] {
  const raw = resolvePostmanTemplateValue(body.raw, variables)
  const language = getRawLanguage(body)

  if (language === 'json') {
    return {
      type: BodyType.Json,
      rawText: raw,
      jsonSchema: raw ? inferJsonSchemaFromExample(parsePostmanJsonText(raw) ?? {}) : undefined,
    }
  }

  if (language === 'xml') {
    return { type: BodyType.Xml, rawText: raw }
  }

  if (language === 'file') {
    return { type: BodyType.Binary }
  }

  return raw ? { type: BodyType.Raw, rawText: raw } : { type: BodyType.None }
}

function buildRequestBody(body: unknown, variables: PostmanVariableMap): ApiDetails['requestBody'] {
  if (!isPostmanRecord(body)) {
    return { type: BodyType.None }
  }

  if (body.mode === 'formdata') {
    return {
      type: BodyType.FormData,
      parameters: toParameterList(getPostmanRecordList(body.formdata), { variables }),
    }
  }

  if (body.mode === 'urlencoded') {
    return {
      type: BodyType.UrlEncoded,
      parameters: toParameterList(getPostmanRecordList(body.urlencoded), { variables }),
    }
  }

  if (body.mode === 'file') {
    return { type: BodyType.Binary }
  }

  if (body.mode === 'raw' || body.mode === 'graphql') {
    return buildRawRequestBody(body, variables)
  }

  return { type: BodyType.None }
}

function getHeaderValue(headers: PostmanRecord[], headerName: string, variables: PostmanVariableMap) {
  const target = headers.find((header) => {
    return typeof header.key === 'string' && header.key.toLowerCase() === headerName.toLowerCase()
  })

  return typeof target?.value === 'string'
    ? resolvePostmanTemplate(target.value, variables)
    : undefined
}

function getResponseContentType(response: PostmanRecord, variables: PostmanVariableMap) {
  const headers = getPostmanRecordList(response.header)
  const headerContentType = mapContentType(getHeaderValue(headers, 'Content-Type', variables))

  if (headerContentType) {
    return headerContentType
  }

  const body = resolvePostmanTemplateValue(response.body, variables)

  if (parsePostmanJsonText(body) !== undefined) {
    return ContentType.JSON
  }

  if (typeof response._postman_previewlanguage === 'string' && response._postman_previewlanguage.toLowerCase() === 'xml') {
    return ContentType.XML
  }

  return body ? ContentType.Raw : undefined
}

function buildResponseData(
  response: PostmanRecord,
  index: number,
  variables: PostmanVariableMap,
) {
  const responseId = randomUUID()
  const body = resolvePostmanTemplateValue(response.body, variables)
  const contentType = getResponseContentType(response, variables)
  const parsedJson = parsePostmanJsonText(body)
  const responseName = getPostmanText(response.name) ?? getPostmanText(response.status) ?? `响应 ${index + 1}`
  const item = {
    id: responseId,
    code: typeof response.code === 'number' ? response.code : 200,
    name: resolvePostmanTemplate(responseName, variables),
    contentType,
    jsonSchema: parsedJson === undefined ? undefined : inferJsonSchemaFromExample(parsedJson),
  }
  const example = body
    ? { id: randomUUID(), responseId, name: item.name, data: body } satisfies ResponseExample
    : undefined

  return { item, example }
}

function buildResponses(response: unknown, variables: PostmanVariableMap) {
  const mapped = getPostmanRecordList(response).map((item, index) => {
    return buildResponseData(item, index, variables)
  })
  const responses = mapped.map(({ item }) => item)
  const responseExamples = mapped.flatMap(({ example }) => example ? [example] : [])

  return {
    responses: responses.length > 0 ? responses : undefined,
    responseExamples: responseExamples.length > 0 ? responseExamples : undefined,
  }
}

function buildParameters(request: PostmanRecord, variables: PostmanVariableMap) {
  const url = isPostmanRecord(request.url) ? request.url : undefined
  const pathVariableNames = new Set(
    getPostmanRecordList(url?.variable)
      .map((item) => getPostmanText(item.key))
      .filter((item): item is string => Boolean(item)),
  )
  const query = toParameterList(getPostmanRecordList(url?.query), { variables })
  const path = toParameterList(getPostmanRecordList(url?.variable), {
    variables,
    required: true,
    pathVariableNames,
  })
  const header = toParameterList(getPostmanRecordList(request.header), { variables })

  return {
    query: query.length > 0 ? query : undefined,
    path: path.length > 0 ? path : undefined,
    header: header.length > 0 ? header : undefined,
  }
}

function buildRequestMenuItem(
  item: PostmanRecord,
  parentId: string,
  variables: PostmanVariableMap,
): ApiMenuData {
  const request = isPostmanRecord(item.request) ? item.request : {}
  const name = getPostmanText(item.name) ?? DEFAULT_REQUEST_NAME
  const target = resolvePostmanRequestTarget(request.url, variables)
  const responseData = buildResponses(item.response, variables)

  return {
    id: randomUUID(),
    parentId,
    name: resolvePostmanTemplate(name, variables),
    type: MenuItemType.ApiDetail,
    data: {
      id: randomUUID(),
      name: resolvePostmanTemplate(name, variables),
      path: target.path,
      method: toHttpMethod(request.method),
      status: ApiStatus.Developing,
      serverId: '',
      serverUrl: target.serverUrl,
      description: resolvePostmanTemplate(
        getPostmanDescription(item.description) ?? getPostmanDescription(request.description) ?? '',
        variables,
      ) || undefined,
      parameters: buildParameters(request, variables),
      requestBody: buildRequestBody(request.body, variables),
      responses: responseData.responses,
      responseExamples: responseData.responseExamples,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    } satisfies ApiDetails,
  }
}

function appendCollectionItems(
  items: unknown,
  parentId: string,
  menuItems: ApiMenuData[],
  inheritedVariables: PostmanVariableMap,
) {
  getPostmanRecordList(items).forEach((item, index) => {
    const itemVariables = mergePostmanVariableMaps(
      inheritedVariables,
      buildPostmanVariableMap(item.variable),
    )
    const children = Array.isArray(item.item) ? item.item : undefined

    if (children) {
      const folderId = randomUUID()
      const folderName = resolvePostmanTemplate(
        getPostmanText(item.name) ?? `${DEFAULT_FOLDER_NAME} ${index + 1}`,
        itemVariables,
      )
      menuItems.push({
        id: folderId,
        parentId,
        name: stripImportedTimestampSuffix(folderName),
        type: MenuItemType.ApiDetailFolder,
      })
      appendCollectionItems(children, folderId, menuItems, itemVariables)
      return
    }

    if (isPostmanRecord(item.request)) {
      menuItems.push(buildRequestMenuItem(item, parentId, itemVariables))
    }
  })
}

export function isPostmanCollectionDocument(doc: Record<string, unknown>) {
  const info = isPostmanRecord(doc.info) ? doc.info : undefined
  const schema = getPostmanText(info?.schema)

  return typeof schema === 'string' && schema.includes(POSTMAN_COLLECTION_SCHEMA_MARKER)
}

export function importPostmanCollectionDocumentToMenuItems(doc: Record<string, unknown>) {
  if (!isPostmanCollectionDocument(doc)) {
    throw new Error('仅支持 Postman Collection v2/v2.1')
  }

  const info = isPostmanRecord(doc.info) ? doc.info : undefined
  const rootId = randomUUID()
  const rootVariables = buildPostmanVariableMap(doc.variable)
  const rootName = resolvePostmanTemplate(
    getPostmanText(info?.name) ?? DEFAULT_COLLECTION_NAME,
    rootVariables,
  )
  const menuItems: ApiMenuData[] = [{
    id: rootId,
    name: stripImportedTimestampSuffix(rootName),
    type: MenuItemType.ApiDetailFolder,
  }]

  appendCollectionItems(doc.item, rootId, menuItems, rootVariables)

  return menuItems
}

export function importPostmanCollectionToMenuItems(fileContent: string, filename: string) {
  return importPostmanCollectionDocumentToMenuItems(parseDocumentFromFile(fileContent, filename))
}
