export function requireRouteParam(value: string | undefined, paramName: string) {
  if (!value) {
    throw new Response(`${paramName} 缺失`, { status: 404 })
  }

  return value
}
