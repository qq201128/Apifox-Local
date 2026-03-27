import { ParamType } from '@/enums'
import type { Parameter } from '@/types'

import {
  type RequestVariableMap,
  resolveRequestTemplateList,
} from './request-runtime-variables'

function getParameterExampleValues(param?: Parameter, required = false) {
  if (!param?.name) {
    return []
  }

  if (param.type === ParamType.Array) {
    if (Array.isArray(param.example) && param.example.length > 0) {
      return param.example
    }
  }
  else if (typeof param.example === 'string' && param.example.length > 0) {
    return [param.example]
  }

  if (required) {
    throw new Error(`参数“${param.name}”缺少示例值，无法运行`)
  }

  return []
}

export function resolveParameterValues(payload: {
  param?: Parameter
  variables: RequestVariableMap
  label: string
  required?: boolean
}) {
  const { param, variables, label, required = false } = payload
  const values = getParameterExampleValues(param, required)

  return resolveRequestTemplateList(values, variables, label)
}
