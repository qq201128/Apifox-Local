import type { ApiErrorResponse, ApiSuccessResponse } from './types'

export function ok<T>(data: T, init?: ResponseInit) {
  const payload: ApiSuccessResponse<T> = {
    ok: true,
    data,
    error: null,
  }

  return Response.json(payload, init)
}

export function fail(message: string, status = 400, init?: ResponseInit) {
  const payload: ApiErrorResponse = {
    ok: false,
    data: null,
    error: message,
  }

  return Response.json(payload, { ...init, status })
}
