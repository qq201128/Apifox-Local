const PATH_PREFIX_SEGMENTS = new Set(['api', 'apis', 'openapi', 'swagger'])

export const DEFAULT_OPENAPI_GROUP_NAME = '未分组'

function pickControllerFromOperationId(operationId: string) {
  const normalized = operationId.trim()

  if (!normalized) {
    return undefined
  }

  const delimiterMatch = /^([^._:/\\-]+)[._:/\\-]/.exec(normalized)

  if (delimiterMatch?.[1]) {
    return delimiterMatch[1]
  }

  const controllerMatch = /^([A-Za-z0-9]+Controller)\b/.exec(normalized)

  if (controllerMatch?.[1]) {
    return controllerMatch[1]
  }

  return undefined
}

function getPathGroupName(pathName: string) {
  const segments = pathName
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.startsWith('{') && !segment.endsWith('}'))

  if (segments.length === 0) {
    return undefined
  }

  let groupIndex = 0

  while (
    groupIndex < segments.length
    && (PATH_PREFIX_SEGMENTS.has(segments[groupIndex].toLowerCase()) || /^v\d+$/i.test(segments[groupIndex]))
  ) {
    groupIndex += 1
  }

  if (groupIndex === 0 && segments.length > 1 && segments[0].includes('-')) {
    groupIndex = 1
  }

  return segments[groupIndex] ?? segments[0]
}

export function getOpenApiGroupName(operation: Record<string, unknown>, pathName: string) {
  const controllerCandidates = [
    operation.controller,
    operation.controllerName,
    operation['x-controllerName'],
    operation['x-controller-name'],
    operation['x-controller'],
  ]
  const controller = controllerCandidates.find((item): item is string => typeof item === 'string' && item.trim().length > 0)

  if (controller) {
    return controller.trim()
  }

  const operationId
    = typeof operation.operationId === 'string' ? pickControllerFromOperationId(operation.operationId) : undefined

  if (operationId) {
    return operationId
  }

  const tagGroup = Array.isArray(operation.tags)
    ? operation.tags.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined

  if (tagGroup) {
    return tagGroup.trim()
  }

  return getPathGroupName(pathName) ?? DEFAULT_OPENAPI_GROUP_NAME
}
